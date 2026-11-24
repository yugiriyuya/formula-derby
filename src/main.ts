import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { KYOTO_OUTER } from './course/kyotoOuter';
import { CourseTrack } from './course/CourseTrack';
import { buildCourseWorld, type WorldBounds } from './scene/courseWorld';
import { buildFences } from './scene/fences';
import { buildDistanceMarkers } from './scene/markers';
import { buildStructures } from './scene/structures';
import { buildLabels } from './scene/labels';
import { createClouds, createLights, SKY_COLOR } from './scene/sky';
import { CameraRig, FOLLOW_STYLE_LABEL, type CameraMode, type FollowStyle, type ViewId } from './camera/CameraRig';
import { constructorOf, ENTRIES, PLAYER_ENTRY_ID } from './data/roster';
import { Race } from './race/Race';
import { TurfWear } from './race/TurfWear';
import { RACE_CONFIG } from './race/raceConfig';
import { NO_CONTROLS, type RaceHorse } from './race/RaceHorse';
import { KeyboardInput } from './race/KeyboardInput';
import { playerControls, shiftPace } from './race/pace';
import { HorseModel, lookOfEntry } from './models/HorseModel';
import { RaceHud } from './ui/RaceHud';
import { StandingsPanel } from './ui/StandingsPanel';
import { Minimap } from './ui/Minimap';
import { StartGate } from './scene/StartGate';
import { TurfParticles } from './scene/TurfParticles';

/**
 * 確認用 URL パラメーター
 *   ?mode=race|spectate タイトルを飛ばしてシンプルレース / 観戦モードで開始
 *   ?laps=1            周回数を変更（既定 5）
 *   ?start=1300&pit=1  スタート位置（ゴール板から何 m 地点か）を変更 / 最初からピット要求 ON
 *   ?auto=1            ペースを常にハイペースにする（確認用）
 *   ?cam=jockey        騎手視点で開始（観戦モードでは broadcast も可）
 *   ?player=5          操作する馬を出走表の番号で選ぶ（既定 1 = クロワデュノール）
 *   ?view=hill         コース確認用の視点で開始（overview / hill / pit / finish）
 *   ?preview=pit&s=380 コースのプレビュー走行で開始
 *   ?ff=300            レースを指定秒数だけ早送りしてから表示（?mode= と一緒に使う）
 *   &crash=60          早送り中、レース時間がこの秒数になったら注目している馬を外ラチに衝突させる（落馬・SC の確認用）
 */
const params = new URLSearchParams(location.search);
const numParam = (key: string) => (params.has(key) ? Number(params.get(key)) : undefined);

const container = document.getElementById('app')!;

// --- Renderer ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// --- Scene / Sky ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY_COLOR);
scene.fog = new THREE.Fog(SKY_COLOR, 700, 1800);

// --- Camera & Controls ---
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 3000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.49; // 地面の下に潜らない
controls.minDistance = 4;
controls.maxDistance = 1200;
controls.autoRotateSpeed = 0.4;

// --- Lights（影は注視点のまわり 90 ブロックだけ描く） ---
const lights = createLights(90);
scene.add(lights.hemi, lights.sun, lights.sun.target);

// --- Course ---
const track = new CourseTrack(KYOTO_OUTER);
// ワールドの大きさはコースの形から決める（コースの外側に約 90m の余白）
const ext = track.extent();
const margin = Math.ceil(KYOTO_OUTER.trackWidth / 2 + 90 / KYOTO_OUTER.metersPerBlock);
const WORLD_BOUNDS: WorldBounds = {
  minX: Math.floor(ext.minX) - margin,
  maxX: Math.ceil(ext.maxX) + margin,
  minZ: Math.floor(ext.minZ) - margin,
  maxZ: Math.ceil(ext.maxZ) + margin,
};
const world = buildCourseWorld(track, WORLD_BOUNDS);
scene.add(world.group);
scene.add(buildFences(track, world.topAt));
scene.add(buildDistanceMarkers(track, world.topAt));
scene.add(buildStructures(track, world.topAt, WORLD_BOUNDS));
const labels = buildLabels(track);
scene.add(labels);

const clouds = createClouds(30, 1800, 520);
scene.add(clouds.group);

// --- Race（出走表の全頭。誰を操作するかはモード選択で決める） ---
// シンプルレースで操作する馬：?player=番号（出走表の番号 1〜）。指定がなければクロワデュノール
const playerEntry = ENTRIES.find((e) => e.number === numParam('player')) ?? ENTRIES.find((e) => e.id === PLAYER_ENTRY_ID)!;
const race = new Race(track, numParam('laps') ?? RACE_CONFIG.laps, ENTRIES, null);
// 馬場の荒れ度（ブロック単位）。レースをやり直すたびにきれいな芝に戻る
const turfWear = new TurfWear(WORLD_BOUNDS);
race.wear = turfWear;
const startGate = new StartGate(track, race.gate, world.topAt);
scene.add(startGate.root);

const horseModels = new Map(race.horses.map((h) => [h, new HorseModel(lookOfEntry(h.entry))] as const));
for (const m of horseModels.values()) scene.add(m.root);
// 芦毛のセーフティホース（出動中だけ表示）
// 荒れた芝を走る時に蹄から舞う土煙・芝片
const turfParticles = new TurfParticles();
scene.add(turfParticles.mesh);
const safetyModel = HorseModel.safetyHorse();
safetyModel.root.visible = false;
scene.add(safetyModel.root);
const hud = new RaceHud();
const standings = new StandingsPanel(document.querySelector('#standings tbody')!, race.horses.length);
const minimap = new Minimap(document.getElementById('minimap') as HTMLCanvasElement, track);
const input = new KeyboardInput();

// --- Camera rig ---
const rig = new CameraRig(camera, controls, track);
rig.setFollowSource(() => horseModels.get(race.focus)!.cameraAnchor(race.focus, track, world.topAt));

// --- 画面の状態（タイトル / シンプルレース / 観戦モード） ---
type AppMode = 'title' | 'race' | 'spectate';
let appMode: AppMode = 'title';
/** タイトルで選んだモード（シンプルレースで落馬して観戦に切り替わっても、R で元に戻すため） */
let chosenMode: 'race' | 'spectate' = 'race';
/** 観戦モードのレース進行速度（1 倍 / 2 倍） */
let speedMultiplier = 1;

const mpb = KYOTO_OUTER.metersPerBlock;
const maxH = Math.max(...KYOTO_OUTER.elevation.map((k) => k.h));
document.getElementById('course-name')!.textContent = KYOTO_OUTER.name;
document.getElementById('course-info')!.textContent =
  `全長 約${Math.round(track.length * mpb)}m（1ブロック=${mpb}m）・淀の坂 高低差 約${Math.round(maxH * mpb)}m（誇張表示）・${race.laps}周`;
document.getElementById('title-player')!.textContent = playerEntry.horse.name;

const previewButtons = document.querySelectorAll<HTMLButtonElement>('[data-preview]');
const followButton = document.querySelector<HTMLButtonElement>('[data-follow]')!;
const camButtons = document.querySelectorAll<HTMLButtonElement>('[data-cam]');
const speedButtons = document.querySelectorAll<HTMLButtonElement>('[data-speed]');
const focusLabel = document.getElementById('sp-focus')!;
let labelsOn = true;
let cameraMode: CameraMode = 'orbit';

const refreshLabels = () => {
  // コースラベルは俯瞰視点の時だけ出す（タイトル画面の背景では出さない）
  labels.visible = labelsOn && appMode !== 'title' && (cameraMode === 'orbit' || cameraMode === 'transition');
};
const toggleLabels = () => {
  labelsOn = !labelsOn;
  refreshLabels();
};

/** 騎手視点では、追っている馬の騎手の頭（カメラにかぶる）だけ隠す */
const refreshJockeyHeads = () => {
  const firstPerson = cameraMode === 'follow' && rig.followStyle === 'jockey';
  for (const [h, model] of horseModels) model.setJockeyHeadVisible(!(firstPerson && h === race.focus));
};

const refreshCameraButtons = () => {
  followButton.classList.toggle('active', cameraMode === 'follow');
  followButton.textContent = `C ${FOLLOW_STYLE_LABEL[rig.followStyle]}`;
  camButtons.forEach((b) => b.classList.toggle('active', cameraMode === 'follow' && b.dataset.cam === rig.followStyle));
};

rig.onModeChange = (mode, viaPit) => {
  cameraMode = mode;
  refreshLabels();
  refreshJockeyHeads();
  refreshCameraButtons();
  previewButtons.forEach((b) => {
    b.classList.toggle('active', mode === 'preview' && (b.dataset.preview === 'pit') === viaPit);
  });
};

const setSpeed = (mul: number) => {
  speedMultiplier = mul;
  speedButtons.forEach((b) => b.classList.toggle('active', Number(b.dataset.speed) === mul));
};

/** 観戦モード：注目する馬（カメラ・HUD の対象）を切り替える */
const setFocus = (h: RaceHorse) => {
  if (h === race.focus) return;
  race.focus = h;
  rig.retarget();
  refreshJockeyHeads();
  standings.refresh();
};

const debugStartS = numParam('start');
/** モードごとの画面・カメラの設定 */
const applyModeUi = (mode: 'race' | 'spectate') => {
  appMode = mode;
  document.body.dataset.mode = mode;
  rig.followStyles = mode === 'race' ? ['chase', 'jockey'] : ['chase', 'jockey', 'broadcast'];
};

/** シンプルレースで自分の馬が落馬した：観戦カメラに切り替えて先頭の馬を追う */
const watchAfterRetire = () => {
  applyModeUi('spectate');
  const leader = race.standings.find((h) => !h.retired) ?? race.standings[0];
  setFocus(leader);
  rig.follow(rig.followStyle);
  race.notify('観戦カメラに切替 — R でリスタート', 3.5);
};

/** 同じモードのままレースをやり直す */
const restartRace = () => {
  race.restart();
  startGate.reset();
  turfParticles.clear();
  // 落馬で観戦に切り替わっていたら、シンプルレースに戻す
  if (chosenMode === 'race' && appMode === 'spectate' && race.player) {
    applyModeUi('race');
    race.focus = race.player;
    rig.follow('chase');
    refreshJockeyHeads();
  }
  if (appMode === 'race' && race.player) {
    if (debugStartS !== undefined) race.player.reset(debugStartS / mpb, 0);
    if (params.get('pit') === '1') race.player.togglePitRequest();
  }
  rig.snapFollow();
  standings.refresh();
};

/** モードを選んでレースを始める */
const startMode = (mode: 'race' | 'spectate', followStyle?: FollowStyle) => {
  chosenMode = mode;
  applyModeUi(mode);
  controls.autoRotate = false;
  race.configure(mode === 'race' ? playerEntry.id : null);
  setSpeed(1);
  restartRace();
  const style = followStyle && rig.followStyles.includes(followStyle) ? followStyle : mode === 'spectate' ? 'broadcast' : 'chase';
  rig.follow(style);
  refreshLabels();
  refreshJockeyHeads();
};

/** タイトル（モード選択）に戻る。背景ではコース全景をゆっくり回す */
const showTitle = () => {
  appMode = 'title';
  document.body.dataset.mode = 'title';
  race.configure(null);
  startGate.reset();
  setSpeed(1);
  rig.snapTo('overview');
  controls.autoRotate = true;
  refreshLabels();
};

// ボタンにフォーカスが残ると Space（ムチ）でボタンが押されてしまうので外す
const onClick = (b: HTMLElement, fn: () => void) =>
  b.addEventListener('click', () => {
    fn();
    b.blur();
  });

const togglePreview = (viaPit: boolean) => {
  const sameMode = rig.previewing && document.querySelector(`[data-preview="${viaPit ? 'pit' : 'normal'}"].active`);
  if (sameMode) rig.stopPreview();
  else rig.startPreview(viaPit);
};

// タイトル
onClick(document.getElementById('btn-race')!, () => startMode('race'));
onClick(document.getElementById('btn-spectate')!, () => startMode('spectate'));
document.querySelectorAll<HTMLButtonElement>('.to-title').forEach((b) => onClick(b, showTitle));

// シンプルレース（コース確認用の視点切替）
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) => {
  onClick(b, () => rig.goTo(b.dataset.view as ViewId));
});
previewButtons.forEach((b) => onClick(b, () => togglePreview(b.dataset.preview === 'pit')));
onClick(followButton, () => rig.toggleFollowStyle());
onClick(document.getElementById('toggle-labels')!, toggleLabels);

// 観戦モード
onClick(document.getElementById('sp-prev')!, () => setFocus(neighbor(-1)));
onClick(document.getElementById('sp-next')!, () => setFocus(neighbor(1)));
camButtons.forEach((b) => onClick(b, () => rig.follow(b.dataset.cam as FollowStyle)));
speedButtons.forEach((b) => onClick(b, () => setSpeed(Number(b.dataset.speed))));
standings.onSelect = (h) => {
  if (appMode === 'spectate') setFocus(h);
};

/** 順位で 1 つ上（-1）/ 下（+1）の馬 */
function neighbor(dir: 1 | -1): RaceHorse {
  const i = race.standings.indexOf(race.focus);
  const n = race.standings.length;
  return race.standings[(i + dir + n) % n];
}

const KEY_VIEWS: Record<string, ViewId> = { Digit1: 'overview', Digit2: 'hill', Digit3: 'pit', Digit4: 'finish' };
window.addEventListener('keydown', (e) => {
  if (appMode === 'race') {
    if (KEY_VIEWS[e.code]) rig.goTo(KEY_VIEWS[e.code]);
    else if (e.code === 'Digit5') togglePreview(false);
    else if (e.code === 'Digit6') togglePreview(true);
    else if (e.code === 'KeyL') toggleLabels();
    else if (e.code === 'Escape') rig.stopPreview();
  } else if (appMode === 'spectate') {
    if (e.code === 'Digit1') setSpeed(1);
    else if (e.code === 'Digit2') setSpeed(2);
  }
});

// --- 初期状態 ---
// ?mode= があればタイトルを飛ばす。以前の確認用パラメーターだけ付いている時はシンプルレースで始める
const debugKeys = ['view', 'preview', 'start', 'auto', 'cam', 'pit'];
const initialMode = params.get('mode') ?? (debugKeys.some((k) => params.has(k)) ? 'race' : 'title');
if (initialMode === 'race' || initialMode === 'spectate') {
  startMode(initialMode, (params.get('cam') as FollowStyle | null) ?? undefined);
  const startView = params.get('view') as ViewId | null;
  if (startView) rig.snapTo(startView);
  if (params.has('preview')) {
    const s = params.get('s');
    rig.startPreview(params.get('preview') === 'pit', s !== null ? Number(s) : undefined);
  }
  // 確認用：?ff=秒数 でレースを早送りしてから表示（馬場の荒れ・ペナルティなどの確認に）
  const ff = numParam('ff');
  if (ff) {
    const crashAt = numParam('crash');
    let crashed = false;
    for (let t = 0; t < ff; t += 1 / 60) {
      if (crashAt !== undefined && !crashed && race.time > crashAt) {
        // 確認用：注目している馬（シンプルレースでは自分の馬）を外ラチへ（落馬 → セーフティホース出動）
        const v = race.focus;
        v.lateral = -v.crashLimit - 0.3;
        crashed = true;
      }
      const p = race.player;
      race.update(1 / 60, p ? playerControls(p, 0, false, race.condition) : NO_CONTROLS);
      startGate.update(1 / 60, race);
    }
    rig.snapFollow();
  }
} else {
  showTitle();
}

// --- Resize ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Loop ---
const autoRun = params.get('auto') === '1';
const timer = new THREE.Timer();
renderer.setAnimationLoop((time) => {
  timer.update(time);
  // 初回やタブ復帰時に経過時間が負・巨大になることがあるので 0〜0.1 秒に収める
  const dt = Math.min(Math.max(timer.getDelta(), 0), 0.1);

  const pressed = input.consumePressed();
  if (appMode !== 'title') {
    if (pressed.has('KeyC')) rig.toggleFollowStyle();
    if (pressed.has('KeyR')) restartRace();
  }

  if (appMode === 'race' && race.player) {
    if (pressed.has('KeyP')) race.player.togglePitRequest();
    if (pressed.has('KeyT')) race.player.cycleNextShoe();
    // 前進は自動。W/S はペース（巡航速度とスタミナの使い方）を 1 段階ずつ上げ下げする
    const shift = input.paceShift(pressed);
    if (shift !== 0) shiftPace(race.player, shift);
    if (autoRun) race.player.paceLevel = 'high';
    race.update(dt, playerControls(race.player, input.steer(), pressed.has('Space'), race.condition));
  } else if (appMode === 'spectate') {
    if (pressed.has('ArrowLeft')) setFocus(neighbor(-1));
    if (pressed.has('ArrowRight')) setFocus(neighbor(1));
    // 2 倍速は 1 フレームに 2 回進める（dt を倍にするより挙動が安定する）
    for (let k = 0; k < speedMultiplier; k++) race.update(dt, NO_CONTROLS);
  }

  // シンプルレースで落馬したら、倒れる様子を少し見せてから観戦カメラへ
  if (appMode === 'race' && race.player?.retired && race.time - race.player.retireTime > 2.5) watchAfterRetire();

  for (const [h, model] of horseModels) model.sync(h, track, world.topAt, dt);
  // 荒れた芝の上では蹄から土煙・芝片が舞う
  if (race.phase === 'running') {
    for (const [h, model] of horseModels) {
      if (h.inPit || h.retired) continue;
      turfParticles.emit(h, model.root.position, track.frameAt(h.s, h.lateral).dir, h.speed, h.groundWear, dt);
    }
  }
  turfParticles.update(dt);
  safetyModel.root.visible = race.safety.visible;
  if (race.safety.visible) safetyModel.sync(race.safety, track, world.topAt, dt);
  startGate.update(dt, race);
  if (appMode !== 'title') {
    hud.update(race);
    standings.update(dt, race);
    minimap.update(race);
    if (appMode === 'spectate') {
      const f = race.focus;
      const team = constructorOf(f.entry);
      const pos = f.finishPosition !== null ? `${f.finishPosition}着` : `${race.positionOf(f)}位`;
      focusLabel.textContent = `${pos} ${f.entry.horse.name}（${team.name}）`;
    }
  }

  clouds.update(dt);
  rig.update(dt);
  lights.follow(controls.target); // 影はカメラが見ている所のまわりに描く
  world.turf.sync(turfWear); // 荒れたマスの芝の色を更新
  // 注目している馬がスリップストリーム中なら、画面の縁に風切りエフェクト（追従・騎手視点の時）
  const slipFx = appMode !== 'title' && cameraMode === 'follow' && rig.followStyle !== 'broadcast' && race.focus.slipstream > 0.5;
  document.body.classList.toggle('slipstream', slipFx);
  renderer.render(scene, camera);
});
