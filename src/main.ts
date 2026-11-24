import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { COURSES, courseById } from './course/courses';
import { loadSettings, saveSettings, type LapsOption } from './data/settings';
import { runQualifying, type QualifyingResult } from './race/Qualifying';
import { QualifyingScreen } from './ui/QualifyingScreen';
import { SeriesScreen } from './ui/SeriesScreen';
import { EditScreen } from './ui/EditScreen';
import { aiFactor, applyEdits, loadEdits } from './data/edits';
import { isFinished, loadSeries, newSeries, randomWind, recordRound, saveSeries, type SeriesState } from './race/Series';
import { WeatherView } from './scene/WeatherView';
import type { Weather } from './race/Race';
import { windName } from './ui/RaceHud';
import { CourseTrack } from './course/CourseTrack';
import { buildCourseWorld, type WorldBounds } from './scene/courseWorld';
import { buildFences } from './scene/fences';
import { buildDistanceMarkers } from './scene/markers';
import { buildStructures } from './scene/structures';
import { buildLabels } from './scene/labels';
import { createClouds, createLights, SKY_COLOR } from './scene/sky';
import { CameraRig, FOLLOW_STYLE_LABEL, type CameraMode, type FollowStyle, type ViewId } from './camera/CameraRig';
import { constructorOf, ENTRIES, fieldEntries, PLAYER_ENTRY_ID, teamsOf, type FieldSize } from './data/roster';
import { buildScenery } from './scene/scenery';
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
import { Commentary, marginText } from './ui/Commentary';
import { ResultScreen } from './ui/ResultScreen';
import { Sfx } from './audio/Sfx';
import type { ReplayHorseFrame } from './race/ReplayRecorder';

/**
 * 確認用 URL パラメーター
 *   ?mode=race|spectate タイトルを飛ばしてシンプルレース / 観戦モードで開始
 *   ?course=interlagos コースを指定（kyoto-outer / interlagos。指定がなければタイトルで選んだコース）
 *   ?qual=1            予選ありで開始（?mode= と一緒に使う。予選結果の画面で止まる）
 *   ?weather=rain      天候を指定（sunny / rain。?mode= と一緒に使う）
 *   ?field=16          出走頭数（12 / 16）
 *   ?mode=preview      コース下見で開始
 *   ?edit=1&tab=horses 設定（エディット）画面を開く
 *   &series=1          早送りでレースが終わったら、シリーズ戦の 1 戦目として順位画面を開く（final = 全戦終了の画面。保存はしない）
 *   ?laps=1            周回数を変更（既定 5）
 *   ?start=1300&pit=1  スタート位置（ゴール板から何 m 地点か）を変更 / 最初からピット要求 ON
 *   ?auto=1            ペースを常にハイペースにする（確認用）
 *   ?cam=jockey        騎手視点で開始（観戦モードでは broadcast も可）
 *   ?player=5          操作する馬を出走表の番号で選ぶ（既定 1 = クロワデュノール）
 *   ?view=hill         コース確認用の視点で開始（overview / hill / pit / finish）
 *   ?preview=pit&s=380 コースのプレビュー走行で開始
 *   ?ff=300            レースを指定秒数だけ早送りしてから表示（?mode= と一緒に使う）
 *   &crash=60          早送り中、レース時間がこの秒数になったら注目している馬を外ラチに衝突させる（落馬・SC の確認用）
 *   &replay=12         早送りでレースが終わっていたら、ゴール前リプレイのこの秒数で一時停止して開く（photo = 写真判定の瞬間）
 */
const params = new URLSearchParams(location.search);
const numParam = (key: string) => (params.has(key) ? Number(params.get(key)) : undefined);

const container = document.getElementById('app')!;

// --- レース設定（タイトルで選ぶ。ブラウザに保存） ---
const settings = loadSettings();
// 設定（エディット）：名前・能力値などを出走表に反映（起動時だけ。変更したら読み込み直す）
const edits = loadEdits();
applyEdits(edits);
// 確認用に ?mode= でタイトルを飛ばした時は、保存した設定ではなく URL の指定（既定 5 周・予選なし）で走る
if (params.has('mode')) {
  settings.laps = 5;
  settings.qualifying = params.get('qual') === '1';
  settings.weather = params.get('weather') === 'rain' ? 'rain' : 'sunny';
}
/** 走るコース。コースを変えるとワールド全体を作り直すので、ページを読み込み直して切り替える */
const COURSE = courseById(params.get('course') ?? settings.course);
/** 出走表（頭数 12 / 16。?field=16 でも指定できる）。頭数を変える時も読み込み直す */
const FIELD = fieldEntries(numParam('field') ?? settings.fieldSize);

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
const track = new CourseTrack(COURSE);
// ワールドの大きさはコースの形から決める（コースの外側に約 90m の余白）
const ext = track.extent();
const margin = Math.ceil(COURSE.trackWidth / 2 + 90 / COURSE.metersPerBlock);
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
const structures = buildStructures(track, world.topAt, WORLD_BOUNDS, teamsOf(FIELD));
scene.add(structures.group);
// コースごとの景観（池・山並み・建物・港・城壁・スタジアム・照明塔など）
if (COURSE.scenery) scene.add(buildScenery(track, world.topAt, WORLD_BOUNDS, COURSE.scenery));
const labels = buildLabels(track);
scene.add(labels);

const clouds = createClouds(30, 1800, 520);
scene.add(clouds.group);
// 天候の見た目（雨：灰色の空・霧・濡れた芝・雨粒）
const weatherView = new WeatherView(scene, lights, world.turf.mesh.material as THREE.Material, clouds.group, COURSE.night === true);

// --- Race（出走表の全頭。誰を操作するかはモード選択で決める） ---
// シンプルレースで操作する馬：?player=番号（出走表の番号 1〜）。指定がなければクロワデュノール
const playerEntry = FIELD.find((e) => e.number === numParam('player')) ?? ENTRIES.find((e) => e.id === PLAYER_ENTRY_ID)!;
const race = new Race(track, numParam('laps') ?? settings.laps ?? RACE_CONFIG.laps, FIELD, null);
race.aiAbility = aiFactor(edits);
race.shoeWearMultiplier = edits.shoeWear;
race.setLaps(race.laps);
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
turfParticles.dirt = COURSE.surface === 'dirt';
scene.add(turfParticles.mesh);
const safetyModel = HorseModel.safetyHorse();
safetyModel.root.visible = false;
scene.add(safetyModel.root);
const hud = new RaceHud();
const standings = new StandingsPanel(document.querySelector('#standings tbody')!, race.horses.length);
const minimap = new Minimap(document.getElementById('minimap') as HTMLCanvasElement, track);
const input = new KeyboardInput();
const commentary = new Commentary();
const resultScreen = new ResultScreen();
const qualifyingScreen = new QualifyingScreen();
const seriesScreen = new SeriesScreen();
const editScreen = new EditScreen();
const sfx = new Sfx();

// 鳥瞰カメラ用の目印（チームカラーの丸。画面上で一定の大きさ）
const markerTexture = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(16, 16, 14, 0, Math.PI * 2);
  g.fill();
  return new THREE.CanvasTexture(c);
})();
const topMarkers = new Map(
  race.horses.map((h) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerTexture, color: constructorOf(h.entry).color, depthTest: false, sizeAttenuation: false }));
    s.renderOrder = 20;
    s.visible = false;
    scene.add(s);
    return [h, s] as const;
  }),
);

// --- Camera rig ---
const rig = new CameraRig(camera, controls, track);
rig.setFollowSource(() => horseModels.get(race.focus)!.cameraAnchor(race.focus, track, world.topAt));

// --- 画面の状態（タイトル / シンプルレース / 観戦モード） ---
/** preview = コース下見（レースは止めたまま、コースを自由に眺める） */
type AppMode = 'title' | 'race' | 'spectate' | 'preview';
let appMode: AppMode = 'title';
/** タイトルで選んだモード（シンプルレースで落馬して観戦に切り替わっても、R で元に戻すため） */
let chosenMode: 'race' | 'spectate' = 'race';
/** 観戦モードのレース進行速度（1 倍 / 2 倍） */
let speedMultiplier = 1;

const mpb = COURSE.metersPerBlock;
const maxH = Math.max(...COURSE.elevation.map((k) => k.h));
document.getElementById('course-name')!.textContent = COURSE.name;
const refreshCourseInfo = () => {
  document.getElementById('course-info')!.textContent =
    `全長 約${Math.round(track.length * mpb)}m（1ブロック=${mpb}m）・高低差 約${Math.round(maxH * mpb)}m（誇張表示）・${race.laps}周・` +
    `${race.weather === 'rain' ? '雨（重馬場）' : '晴れ（良馬場）'}・${windName(race.wind.fromDeg)} ${race.wind.speed.toFixed(1)}m/s`;
};
refreshCourseInfo();
// コース確認用の「坂」の視点ボタンはコースごとの名前
document.querySelector<HTMLButtonElement>('[data-view="hill"]')!.textContent = `2 ${COURSE.views.hill.label}`;
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
  // コースラベルはコース下見の俯瞰視点の時だけ出す
  labels.visible = labelsOn && appMode === 'preview' && (cameraMode === 'orbit' || cameraMode === 'transition');
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
  rig.followEnabled = true;
  // シンプルレース（自分で騎乗）は後方⇔騎手だけ。観戦モードは中継俯瞰・スタンド・鳥瞰も
  rig.followStyles = mode === 'race' ? ['chase', 'jockey'] : ['chase', 'jockey', 'broadcast', 'stand', 'topdown'];
};

/** コース下見：レースは止めたまま、コースを自由に眺める（視点切替・プレビュー走行・ラベル） */
const startCoursePreview = () => {
  appMode = 'preview';
  document.body.dataset.mode = 'preview';
  rig.followEnabled = false;
  controls.autoRotate = false;
  race.configure(null);
  startGate.reset();
  rig.goTo('overview');
  refreshLabels();
};

/** シンプルレースで自分の馬が落馬した：観戦カメラに切り替えて先頭の馬を追う */
const watchAfterRetire = () => {
  applyModeUi('spectate');
  const leader = race.standings.find((h) => !h.retired) ?? race.standings[0];
  setFocus(leader);
  rig.follow(rig.followStyle);
  race.notify('観戦カメラに切替 — R でリスタート', 3.5);
};

// --- レース後：リザルトとゴール前リプレイ ---
/** リザルトを出したか（全馬ゴールの 2.5 秒後に 1 度だけ自動で出す）と、レースが終わった時刻 */
let resultShown = false;
/** シリーズ戦の進み具合（ブラウザに保存）・今のレースがシリーズ戦か・このレースの結果を記録したか */
let series: SeriesState | null = loadSeries();
let inSeries = false;
let seriesRecorded = false;
let finishedAt: number | null = null;
const replay = {
  active: false,
  t: 0,
  speed: 1,
  paused: false,
  look: new THREE.Vector3(),
  lookInit: false,
  /** 写真判定：先頭の馬の鼻先がゴールラインに届くリプレイ上の時刻と、その演出を出したか・一時停止の残り秒 */
  photoT: null as number | null,
  photoDone: false,
  freeze: 0,
};
/** 馬体の中心から鼻先まで（ブロック）。ゴールの判定は馬体の中心で行っているので、鼻先が線に届くのは少し前 */
const NOSE_BLOCKS = 1.7;
/** 写真判定の前後でスローになる範囲（秒）と速さ、ゴールの瞬間に止める秒数 */
const PHOTO_SLOW_BEFORE = 0.8;
const PHOTO_SLOW_AFTER = 1.4;
const PHOTO_SLOW_SPEED = 0.25;
const PHOTO_FREEZE = 1.4;
const photoFlash = document.getElementById('photo-flash')!;
const photoCard = document.getElementById('photo-card')!;
const photoCardSub = photoCard.querySelector('.sub') as HTMLElement;
const finishPost = scene.getObjectByName('finish-post');
const replayPlayBtn = document.getElementById('replay-play')!;
const replayTimeEl = document.getElementById('replay-time')!;
const replaySpeedBtns = document.querySelectorAll<HTMLButtonElement>('[data-replay-speed]');

const showResults = () => {
  resultShown = true;
  document.body.classList.add('showing-result');
  // シリーズ戦：このレースの結果をポイントにして記録し、次のラウンドへ進めて保存する（1 レースにつき 1 回）
  if (series && inSeries && !seriesRecorded && race.phase === 'finished') {
    seriesRecorded = true;
    if (recordRound(series, race)) {
      series.round++;
      // 確認用の &series= では保存しない（遊んでいるシリーズを上書きしないように）
      if (!params.has('series')) saveSeries(series);
    }
  }
  resultScreen.setSeries(inSeries);
  resultScreen.show(race);
};

const hideResults = () => {
  resultScreen.hide();
  document.body.classList.remove('showing-result');
};

const setReplaySpeed = (speed: number) => {
  replay.speed = speed;
  replaySpeedBtns.forEach((b) => b.classList.toggle('active', Number(b.dataset.replaySpeed) === speed));
};

/** ゴール前リプレイを始める（レースは止めて、記録した 4コーナー出口〜ゴール後を再生） */
const startReplay = () => {
  if (!race.replay.available) return;
  hideResults();
  document.body.classList.add('replaying');
  replay.active = true;
  replay.t = 0;
  replay.paused = false;
  replay.lookInit = false;
  replayPlayBtn.textContent = '一時停止';
  setReplaySpeed(1);
  setupPhotoFinish();
  rig.hold();
  if (finishPost) finishPost.visible = false;
  for (const m of horseModels.values()) m.setJockeyHeadVisible(true);
  safetyModel.root.visible = false;
  turfParticles.clear();
};

const stopReplay = (backToResults = true) => {
  if (!replay.active) return;
  replay.active = false;
  document.body.classList.remove('replaying', 'photo-locked');
  photoCard.classList.remove('show');
  if (finishPost) finishPost.visible = true;
  for (const m of horseModels.values()) m.root.visible = true;
  rig.follow(rig.followStyle);
  if (backToResults) showResults();
};

/**
 * 写真判定の準備：1 着の馬（記録中にゴールしていなければ最初に線を越えた馬）の鼻先がゴールラインに届く時刻と、
 * 判定結果（1 着・2 着と着差）。着差はリザルトと同じペナルティ込みのタイム差。
 */
const setupPhotoFinish = () => {
  const list = [...race.replay.finishes].sort((a, b) => a.t - b.t);
  replay.photoDone = false;
  replay.freeze = 0;
  photoCard.classList.remove('show');
  const target = list.find((f) => race.horses[f.index].finishPosition === 1) ?? list[0];
  if (!target) {
    replay.photoT = null;
    return;
  }
  replay.photoT = Math.max(0, target.t - (NOSE_BLOCKS * mpb) / Math.max(1, target.speed));
  const name = (h: RaceHorse) => `${h.postNumber}番 ${h.entry.horse.name}`;
  const winner = race.horses[target.index];
  const second = race.horses.find((h) => h.finishPosition === 2);
  const lines = [`1着 ${name(winner)}`];
  if (second) {
    const gap = (race.correctedTime(second) ?? 0) - (race.correctedTime(winner) ?? 0);
    lines.push(`2着 ${name(second)}　着差 ${marginText(gap)}${gap < 0.15 ? '（大接戦）' : ''}`);
  }
  // ペナルティで順位が入れ替わった時は、先頭で線を越えた馬も書いておく
  const firstAcross = race.horses[list[0].index];
  if (firstAcross !== winner) lines.push(`<small>先頭入線 ${name(firstAcross)}（ペナルティ +${firstAcross.penaltySeconds}s）</small>`);
  photoCardSub.innerHTML = lines.join('<br>');
};

/** 写真判定の瞬間：フラッシュ・シャッター音・判定結果の表示 */
const firePhotoFinish = () => {
  replay.photoDone = true;
  replay.freeze = PHOTO_FREEZE;
  photoFlash.classList.remove('flash');
  void photoFlash.offsetWidth;
  photoFlash.classList.add('flash');
  photoCard.classList.add('show');
  sfx.shutter();
};

/** リプレイの時間を進める（写真判定の前後はスロー、鼻先がラインに届いた瞬間に一瞬止める） */
const advanceReplay = (dt: number) => {
  if (replay.paused) return;
  if (replay.freeze > 0) {
    replay.freeze -= dt;
    return;
  }
  const pt = replay.photoT;
  let speed = replay.speed;
  if (pt !== null && replay.t > pt - PHOTO_SLOW_BEFORE && replay.t < pt + PHOTO_SLOW_AFTER) speed = Math.min(speed, PHOTO_SLOW_SPEED);
  let next = replay.t + dt * speed;
  if (pt !== null && !replay.photoDone && replay.t <= pt && next >= pt) {
    next = pt;
    firePhotoFinish();
  }
  replay.t = Math.min(race.replay.duration, next);
  // 判定結果はゴールから 5 秒ほどで消す
  if (pt !== null && replay.t > pt + 5) photoCard.classList.remove('show');
};

/**
 * リプレイのカメラ：写真判定カメラのように、コース外側・ゴールラインの延長線上に固定する。
 * 馬が遠いうちは先頭の馬を追ってパン・ズームし、ゴール前 50m からゴールラインの真横を向いて固定する。
 * 固定するとゴールラインが画面のちょうど中央の縦線になるので、そこに判定線を重ねる。
 */
const updateReplayCamera = (frames: ReplayHorseFrame[], dt: number) => {
  const finishS = COURSE.finishS;
  const camPos = track.frameAt(finishS, -(track.railLateral + 8 / mpb)).position;
  camPos.y += 6 / mpb;
  // 先頭の馬（ゴール板の 600m 手前を基準に、いちばん進んでいる馬）
  const ref = finishS - 600 / mpb;
  let lead: ReplayHorseFrame | null = null;
  for (const f of frames) if (!f.hidden && (!lead || track.diff(f.s, ref) > track.diff(lead.s, ref))) lead = f;
  if (!lead) return;
  const follow = track.frameAt(lead.s, lead.lateral + 2).position;
  follow.y = world.topAt(follow.x, follow.z) + 1.4;
  // ゴールライン上（先頭の馬と同じ進路）の点。カメラもゴールラインの延長線上なので、ここを向けば線は画面中央
  const line = track.frameAt(finishS, lead.lateral).position;
  line.y = world.topAt(line.x, line.z) + 1.2;
  const toLineM = -track.diff(lead.s, finishS) * mpb;
  const lock = 1 - THREE.MathUtils.smoothstep(toLineM, 12, 50);
  const target = follow.lerp(line, lock);
  if (!replay.lookInit) {
    replay.look.copy(target);
    replay.lookInit = true;
  } else replay.look.lerp(target, 1 - Math.exp(-dt * (lock > 0.99 ? 12 : 4)));
  camera.position.copy(camPos);
  camera.up.set(0, 1, 0);
  camera.lookAt(replay.look);
  controls.target.copy(replay.look);
  document.body.classList.toggle('photo-locked', lock > 0.97);
  // 遠いうちは横幅 約 20m、固定したら 約 15m を画面に収める（ズーム）
  const dist = camPos.distanceTo(replay.look);
  const halfHeight = THREE.MathUtils.lerp(8, 3.6, lock);
  const fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(halfHeight / dist)), 5, 45);
  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
};

/** 同じモードのままレースをやり直す */
const restartRace = () => {
  stopReplay(false);
  hideResults();
  hideSeriesScreen();
  seriesRecorded = false;
  resultShown = false;
  finishedAt = null;
  race.restart();
  startGate.reset();
  turfParticles.clear();
  commentary.reset();
  sfxRead = 0;
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

/** 予選の結果（枠順・ピットボックス）をレースに反映する。null なら抽選の枠順・既定のピット */
const applyQualifying = (q: QualifyingResult | null) => {
  race.gridOrder = q ? q.rows.map((r) => race.horses.find((h) => h.entry.id === r.entry.id)!) : null;
  race.assignGarages(q ? q.garageOrder : null);
  structures.garages.paint(q ? q.garageOrder : null);
};

/** 予選（1 周タイムアタック）を走らせて結果を出す。計算の間「予選中…」を出すため、少し待ってから計算する */
let qualifyingFor: { mode: 'race' | 'spectate'; followStyle?: FollowStyle; result: QualifyingResult } | null = null;
const runQualifyingFlow = (mode: 'race' | 'spectate', followStyle?: FollowStyle) => {
  titleBusy.textContent = '予選（1周タイムアタック）を計算中…';
  document.body.classList.add('qualifying');
  qualifyingScreen.hide();
  setTimeout(() => {
    const result = runQualifying(track, FIELD);
    titleBusy.textContent = '';
    qualifyingFor = { mode, followStyle, result };
    applyQualifying(result);
    qualifyingScreen.show(result, COURSE, mode === 'race' ? playerEntry.id : null);
  }, 30);
};

/**
 * 天候と風を決める。指定がなければタイトルの設定（ランダムならコースの雨の降りやすさで抽選）と、
 * コースの基本の風を少し揺らしたもの。「同じ条件で再レース」ではそのまま使う
 */
const prepareConditions = (weather?: Weather, wind?: { fromDeg: number; speed: number }) => {
  const w: Weather =
    weather ?? (settings.weather === 'random' ? (Math.random() < COURSE.rainChance ? 'rain' : 'sunny') : settings.weather);
  race.setWeather(w);
  const wd = wind ?? (params.has('mode') ? COURSE.wind : randomWind(COURSE.wind));
  race.setWind(wd.fromDeg, wd.speed);
  weatherView.set(w);
  refreshCourseInfo();
};

/** モードを選んでレースを始める（予選ありなら先に予選） */
const startMode = (mode: 'race' | 'spectate', followStyle?: FollowStyle, qualifying = settings.qualifying, keepConditions = false) => {
  if (!keepConditions) prepareConditions();
  if (qualifying) {
    runQualifyingFlow(mode, followStyle);
    return;
  }
  applyQualifying(null);
  beginRace(mode, followStyle);
};

/** 決勝を始める */
const beginRace = (mode: 'race' | 'spectate', followStyle?: FollowStyle) => {
  qualifyingScreen.hide();
  document.body.classList.remove('qualifying');
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
  stopReplay(false);
  hideResults();
  qualifyingScreen.hide();
  document.body.classList.remove('qualifying');
  titleBusy.textContent = '';
  hideSeriesScreen();
  if (inSeries) {
    inSeries = false;
    race.setLaps(settings.laps);
  }
  resultScreen.setSeries(false);
  refreshSeriesButtons();
  resultShown = false;
  finishedAt = null;
  commentary.reset();
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

/** コースを切り替える：読み込み中の幕を出してから読み込み直す（新しいページも同じ幕から始まるので白い画面は出ない） */
const reloadWithCourse = (courseId: string, fieldSize = settings.fieldSize) => {
  settings.course = courseId;
  settings.fieldSize = fieldSize;
  saveSettings(settings);
  const cover = document.getElementById('boot-cover')!;
  document.getElementById('boot-text')!.textContent = `${courseById(courseId).shortName} を読み込み中…`;
  cover.classList.remove('hidden');
  // URL でコースを指定していたら外す
  const url = new URL(location.href);
  url.searchParams.delete('course');
  setTimeout(() => location.replace(url.toString()), 120);
};

const togglePreview = (viaPit: boolean) => {
  const sameMode = rig.previewing && document.querySelector(`[data-preview="${viaPit ? 'pit' : 'normal'}"].active`);
  if (sameMode) rig.stopPreview();
  else rig.startPreview(viaPit);
};

// タイトル：レース設定（コース・周回数・予選）
const titleBusy = document.createElement('div');
titleBusy.className = 'busy';
document.querySelector('#title-screen .title-box')!.appendChild(titleBusy);
const courseOpts = document.getElementById('set-course')!;
courseOpts.classList.add('courses');
for (const c of COURSES) {
  const b = document.createElement('button');
  b.dataset.course = c.id;
  b.innerHTML = `<b>${c.shortName}</b><small>${c.direction === 'right' ? '右回り' : '左回り'}・約${Math.round(new CourseTrack(c).length * c.metersPerBlock).toLocaleString()}m</small>`;
  courseOpts.appendChild(b);
}
const refreshTitleSettings = () => {
  document.querySelectorAll<HTMLButtonElement>('[data-course]').forEach((b) => b.classList.toggle('active', b.dataset.course === COURSE.id));
  document.querySelectorAll<HTMLButtonElement>('[data-laps]').forEach((b) => b.classList.toggle('active', Number(b.dataset.laps) === race.laps));
  document.querySelectorAll<HTMLButtonElement>('[data-qual]').forEach((b) => b.classList.toggle('active', (b.dataset.qual === '1') === settings.qualifying));
  document.querySelectorAll<HTMLButtonElement>('[data-weather]').forEach((b) => b.classList.toggle('active', b.dataset.weather === settings.weather));
  document.querySelectorAll<HTMLButtonElement>('[data-field]').forEach((b) => b.classList.toggle('active', Number(b.dataset.field) === FIELD.length));
  document.getElementById('set-course-desc')!.textContent =
    `${COURSE.description}　風：${windName(COURSE.wind.fromDeg)} 約${COURSE.wind.speed}m/s・雨の確率 ${Math.round(COURSE.rainChance * 100)}%`;
  const weatherText = settings.weather === 'random' ? '天候ランダム' : settings.weather === 'rain' ? '雨' : '晴れ';
  document.getElementById('title-sub')!.textContent = `${COURSE.name}・${race.laps}周・${FIELD.length}頭・${weatherText}・${settings.qualifying ? '予選あり' : '予選なし'}`;
  refreshCourseInfo();
};
document.querySelectorAll<HTMLButtonElement>('[data-course]').forEach((b) =>
  onClick(b, () => {
    if (b.dataset.course === COURSE.id) return;
    reloadWithCourse(b.dataset.course!);
  }),
);
document.querySelectorAll<HTMLButtonElement>('[data-field]').forEach((b) =>
  onClick(b, () => {
    const size = Number(b.dataset.field) as FieldSize;
    if (size === FIELD.length) return;
    // 出走表が変わる（馬・ピットボックス・ゲート）ので読み込み直す
    reloadWithCourse(COURSE.id, size);
  }),
);
document.querySelectorAll<HTMLButtonElement>('[data-weather]').forEach((b) =>
  onClick(b, () => {
    settings.weather = b.dataset.weather as typeof settings.weather;
    saveSettings(settings);
    // タイトルの背景にも天候を反映（ランダムは晴れで表示）
    race.setWeather(settings.weather === 'rain' ? 'rain' : 'sunny');
    weatherView.set(race.weather);
    refreshTitleSettings();
  }),
);
document.querySelectorAll<HTMLButtonElement>('[data-laps]').forEach((b) =>
  onClick(b, () => {
    settings.laps = Number(b.dataset.laps) as LapsOption;
    saveSettings(settings);
    race.setLaps(settings.laps);
    race.restart();
    refreshTitleSettings();
  }),
);
document.querySelectorAll<HTMLButtonElement>('[data-qual]').forEach((b) =>
  onClick(b, () => {
    settings.qualifying = b.dataset.qual === '1';
    saveSettings(settings);
    refreshTitleSettings();
  }),
);
// タイトルの背景：コースの基本の風と、設定の天候（ランダムは晴れで表示）
race.setWind(COURSE.wind.fromDeg, COURSE.wind.speed);
race.setWeather(settings.weather === 'rain' ? 'rain' : 'sunny');
weatherView.set(race.weather);
refreshTitleSettings();

// 予選結果
qualifyingScreen.onStart = () => {
  if (qualifyingFor) beginRace(qualifyingFor.mode, qualifyingFor.followStyle);
};
qualifyingScreen.onRedo = () => {
  if (qualifyingFor) runQualifyingFlow(qualifyingFor.mode, qualifyingFor.followStyle);
};
qualifyingScreen.onTitle = showTitle;

// --- シリーズ戦 ---
const seriesResumeBtn = document.getElementById('btn-series-resume') as HTMLButtonElement;
function refreshSeriesButtons() {
  const s = series;
  if (s && !isFinished(s)) {
    const next = s.rounds[s.round];
    seriesResumeBtn.style.display = '';
    seriesResumeBtn.textContent = `続きから：第${s.round + 1}戦 ${courseById(next.courseId).shortName}（${s.mode === 'race' ? '騎乗' : '観戦'}）`;
  } else seriesResumeBtn.style.display = 'none';
}
function hideSeriesScreen() {
  seriesScreen.hide();
  document.body.classList.remove('series-shown');
}
/** シリーズの今のラウンドを始める（天候・風はシリーズ開始時に決めたもの） */
function startSeriesRace() {
  if (!series) return;
  const round = series.rounds[series.round];
  inSeries = true;
  race.setLaps(series.laps);
  prepareConditions(round.weather, round.wind);
  startMode(series.mode, undefined, series.qualifying, true);
}
/** 次のラウンドのコースへ（違うコースなら読み込み直して、読み込み後に自動でスタート） */
const goToSeriesRound = () => {
  if (!series || isFinished(series)) return;
  const round = series.rounds[series.round];
  const fieldSize = series.fieldSize ?? 12;
  if (round.courseId !== COURSE.id || fieldSize !== FIELD.length) {
    try {
      sessionStorage.setItem('fd-series-go', '1');
    } catch {
      // 自動スタートできなくても、タイトルの「続きから」で続けられる
    }
    reloadWithCourse(round.courseId, fieldSize as FieldSize);
    return;
  }
  startSeriesRace();
};
const startNewSeries = (mode: 'race' | 'spectate') => {
  series = newSeries(mode, settings.laps, settings.qualifying, settings.fieldSize);
  saveSeries(series);
  goToSeriesRound();
};
onClick(document.getElementById('btn-series-race')!, () => startNewSeries('race'));
onClick(document.getElementById('btn-series-spectate')!, () => startNewSeries('spectate'));
onClick(seriesResumeBtn, goToSeriesRound);
resultScreen.onSeries = () => {
  if (!series) return;
  hideResults();
  document.body.classList.add('series-shown');
  seriesScreen.show(series);
};
seriesScreen.onNext = () => {
  hideSeriesScreen();
  goToSeriesRound();
};
seriesScreen.onBack = () => {
  hideSeriesScreen();
  showResults();
};
seriesScreen.onTitle = showTitle;
refreshSeriesButtons();

// 設定（エディット）：保存したら読み込み直して出走表に反映
onClick(document.getElementById('btn-edit')!, () => editScreen.show(edits));
editScreen.onApply = () => reloadWithCourse(COURSE.id);

// タイトル
onClick(document.getElementById('btn-preview')!, startCoursePreview);
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

// リザルト・リプレイ
resultScreen.onReplay = startReplay;
resultScreen.onRetry = restartRace;
resultScreen.onTitle = showTitle;
onClick(replayPlayBtn, () => {
  // 最後まで再生していたら最初から
  if (replay.t >= race.replay.duration) {
    replay.t = 0;
    setupPhotoFinish();
  }
  replay.paused = !replay.paused;
  replayPlayBtn.textContent = replay.paused ? '再生' : '一時停止';
});
replaySpeedBtns.forEach((b) => onClick(b, () => setReplaySpeed(Number(b.dataset.replaySpeed))));
onClick(document.getElementById('replay-close')!, () => stopReplay(true));

// 効果音：ブラウザは操作があるまで音を出せないので、最初のクリック・キーで有効にする
let sfxRead = 0;
const sfxButton = document.getElementById('sfx-toggle')!;
const refreshSfxButton = () => {
  sfxButton.textContent = sfx.muted ? 'SE OFF' : 'SE ON';
  sfxButton.classList.toggle('off', sfx.muted);
};
const toggleSfx = () => {
  sfx.unlock();
  sfx.setMuted(!sfx.muted);
  refreshSfxButton();
};
refreshSfxButton();
onClick(sfxButton, toggleSfx);
window.addEventListener('pointerdown', () => sfx.unlock());
window.addEventListener('keydown', () => sfx.unlock());

/** 順位で 1 つ上（-1）/ 下（+1）の馬 */
function neighbor(dir: 1 | -1): RaceHorse {
  const i = race.standings.indexOf(race.focus);
  const n = race.standings.length;
  return race.standings[(i + dir + n) % n];
}

const KEY_VIEWS: Record<string, ViewId> = { Digit1: 'overview', Digit2: 'hill', Digit3: 'pit', Digit4: 'finish' };
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM' && (appMode === 'race' || appMode === 'spectate')) toggleSfx();
  if (replay.active) {
    if (e.code === 'Escape') stopReplay(true);
    return;
  }
  // 視点切替・プレビュー走行はコース下見だけ（レース中の自分の馬の視点は C キーの後方⇔騎手だけにする）
  if (appMode === 'preview') {
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
    // 早送りでレースが終わっていたらすぐリザルト。&replay=秒 ならその時点のリプレイで一時停止
    if (race.phase === 'finished') {
      // 確認用：&series=1 ならシリーズ戦の 1 戦目として記録し、シリーズ順位を開く（保存はしない）。
      // &series=final なら全 10 戦をこのレースの結果で埋めてチャンピオン画面を開く
      const demo = params.get('series');
      if (demo) {
        series = newSeries(chosenMode, race.laps, false);
        inSeries = true;
        if (demo === 'final') {
          for (let i = 0; i < series.rounds.length - 1; i++) {
            recordRound(series, race);
            series.round++;
          }
        }
      }
      showResults();
      if (demo) resultScreen.onSeries?.();
      // &replay=photo なら写真判定の瞬間（鼻先がゴールラインに届いた所）で止める
      const rt = params.get('replay') === 'photo' ? 'photo' : numParam('replay');
      if (rt !== undefined) {
        startReplay();
        replay.t = rt === 'photo' ? (replay.photoT ?? 0) : rt;
        replay.paused = true;
        // 写真判定の瞬間より後から開いたら、判定結果を出しておく
        if (replay.photoT !== null && replay.t >= replay.photoT) {
          replay.photoDone = true;
          if (replay.t < replay.photoT + 5) photoCard.classList.add('show');
        }
        replayPlayBtn.textContent = '再生';
      }
    }
  }
} else if (initialMode === 'preview') {
  showTitle();
  startCoursePreview();
} else {
  showTitle();
  // 確認用：?edit=1 で設定（エディット）画面を開く（&tab=horses / teams でそのタブ）
  if (params.get('edit')) {
    editScreen.show(edits);
    const tab = params.get('tab');
    if (tab) document.querySelector<HTMLButtonElement>(`[data-edit-tab="${tab}"]`)?.click();
  }
  // シリーズ戦で次のコースへ読み込み直した直後なら、そのままスタート
  let go = false;
  try {
    go = sessionStorage.getItem('fd-series-go') === '1';
    sessionStorage.removeItem('fd-series-go');
  } catch {
    go = false;
  }
  if (go && series && !isFinished(series) && series.rounds[series.round].courseId === COURSE.id && (series.fieldSize ?? 12) === FIELD.length) {
    startSeriesRace();
  }
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
/** 最初のフレームを描いたら読み込み中の幕を消す */
let bootCoverShown = true;
const hideBootCover = () => {
  if (!bootCoverShown) return;
  bootCoverShown = false;
  requestAnimationFrame(() => document.getElementById('boot-cover')!.classList.add('hidden'));
};
renderer.setAnimationLoop((time) => {
  timer.update(time);
  // 初回やタブ復帰時に経過時間が負・巨大になることがあるので 0〜0.1 秒に収める
  const dt = Math.min(Math.max(timer.getDelta(), 0), 0.1);

  const pressed = input.consumePressed();

  // --- ゴール前リプレイ再生中：レースは止めて、記録を再生する ---
  if (replay.active) {
    advanceReplay(dt);
    if (replay.t >= race.replay.duration && !replay.paused) {
      replay.paused = true;
      replayPlayBtn.textContent = 'もう一度';
    }
    replayTimeEl.textContent = `${replay.t.toFixed(1)}s`;
    const frames = race.replay.sample(replay.t, track);
    race.horses.forEach((h, i) => {
      const model = horseModels.get(h)!;
      const f = frames[i];
      model.root.visible = !f.hidden;
      if (!f.hidden) model.sync(f, track, world.topAt, dt);
    });
    updateReplayCamera(frames, dt);
    clouds.update(dt);
    weatherView.update(dt, camera);
    lights.follow(controls.target);
    renderer.render(scene, camera);
    hideBootCover();
    return;
  }

  const racing = appMode === 'race' || appMode === 'spectate';
  if (racing) {
    if (pressed.has('KeyC')) rig.toggleFollowStyle();
    // シリーズ戦ではやり直しできない
    if (pressed.has('KeyR') && !inSeries) restartRace();
  }

  // 効果音：赤ランプの点灯・ゲート開放
  const litBefore = race.lightsOn;
  const phaseBefore = race.phase;
  const focusWhipsBefore = race.focus.whipsThisLap;
  const focusBefore = race.focus;

  if (appMode === 'race' && race.player) {
    if (pressed.has('KeyP')) race.player.togglePitRequest();
    if (pressed.has('KeyT')) race.player.cycleNextShoe();
    // 前進は自動。W/S はペース（巡航速度とスタミナの使い方）を 1 段階ずつ上げ下げする
    const shift = input.paceShift(pressed);
    if (shift !== 0) shiftPace(race.player, shift);
    if (autoRun) race.player.paceLevel = 'high';
    race.update(dt, playerControls(race.player, input.steer() * track.side, pressed.has('Space'), race.condition));
  } else if (appMode === 'spectate') {
    if (pressed.has('ArrowLeft')) setFocus(neighbor(-1));
    if (pressed.has('ArrowRight')) setFocus(neighbor(1));
    // 2 倍速は 1 フレームに 2 回進める（dt を倍にするより挙動が安定する）
    for (let k = 0; k < speedMultiplier; k++) race.update(dt, NO_CONTROLS);
  }

  // シンプルレースで落馬したら、倒れる様子を少し見せてから観戦カメラへ
  if (appMode === 'race' && race.player?.retired && race.time - race.player.retireTime > 2.5) watchAfterRetire();

  if (racing) {
    // --- 効果音 ---
    if (race.lightsOn > litBefore) sfx.lightOn();
    if (phaseBefore === 'countdown' && race.phase === 'running') sfx.gateOpen();
    if (race.focus === focusBefore && race.focus.whipsThisLap > focusWhipsBefore) sfx.whip();
    while (sfxRead < race.events.length) {
      const ev = race.events[sfxRead++];
      if (ev.type === 'crash') sfx.crash();
      else if (ev.type === 'safety') sfx.safety();
      else if (ev.type === 'green') sfx.greenFlag();
      else if (ev.type === 'penalty') sfx.penalty(ev.horse === race.focus);
      else if (ev.type === 'finish' && (ev.value === 1 || ev.horse === race.player)) sfx.finish();
    }
    // --- 実況テロップ ---
    commentary.update(dt, race);
    // --- 全馬ゴール（レース終了）から 2.5 秒でリザルト ---
    if (race.phase === 'finished') {
      finishedAt ??= race.clock;
      if (!resultShown && race.clock - finishedAt > 2.5) showResults();
    }
  }

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
  // 鳥瞰カメラの時だけ、馬の位置にチームカラーの目印を出す（真上からは馬が小さいので）
  const topdown = racing && cameraMode === 'follow' && rig.followStyle === 'topdown';
  for (const [h, marker] of topMarkers) {
    marker.visible = topdown && !h.inPit && !(h.retired && h.fallen === 0);
    if (marker.visible) {
      const p = horseModels.get(h)!.root.position;
      marker.position.set(p.x, p.y + 4, p.z);
      marker.scale.setScalar(h === race.focus ? 0.03 : 0.018);
    }
  }
  if (racing) {
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
    weatherView.update(dt, camera);
  rig.update(dt);
  lights.follow(controls.target); // 影はカメラが見ている所のまわりに描く
  world.turf.sync(turfWear); // 荒れたマスの芝の色を更新
  // 注目している馬がスリップストリーム中なら、画面の縁に風切りエフェクト（追従・騎手視点の時）
  const slipFx = racing && cameraMode === 'follow' && rig.followStyle !== 'broadcast' && race.focus.slipstream > 0.5;
  document.body.classList.toggle('slipstream', slipFx);
  renderer.render(scene, camera);
  hideBootCover();
});
