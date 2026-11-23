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
import { CameraRig, type CameraMode, type ViewId } from './camera/CameraRig';
import { ENTRIES, PLAYER_ENTRY_ID } from './data/roster';
import { Race } from './race/Race';
import { RACE_CONFIG } from './race/raceConfig';
import { KeyboardInput } from './race/KeyboardInput';
import { HorseModel } from './models/HorseModel';
import { RaceHud } from './ui/RaceHud';

/**
 * 確認用 URL パラメーター
 *   ?laps=1            周回数を変更（既定 5）
 *   ?start=1300&pit=1  スタート位置（ゴール板から何 m 地点か）を変更 / 最初からピット要求 ON
 *   ?auto=1            加速キーを押しっぱなし扱い（自動走行の確認用）
 *   ?cam=jockey        騎手視点で開始
 *   ?view=hill         コース確認用の視点で開始（overview / hill / pit / finish）
 *   ?preview=pit&s=380 コースのプレビュー走行で開始
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

// --- Race ---
const playerEntry = ENTRIES.find((e) => e.id === PLAYER_ENTRY_ID)!;
const race = new Race(track, numParam('laps') ?? RACE_CONFIG.laps, playerEntry);
const debugStartS = numParam('start');
const restartRace = () => {
  race.restart();
  if (debugStartS !== undefined) race.player.reset(debugStartS / KYOTO_OUTER.metersPerBlock, 0);
  if (params.get('pit') === '1') race.player.togglePitRequest();
  rig.snapFollow();
};

const horseModel = new HorseModel(race.player);
scene.add(horseModel.root);
const hud = new RaceHud();
const input = new KeyboardInput();

// --- Camera rig & course HUD ---
const rig = new CameraRig(camera, controls, track);
rig.setFollowSource(() => horseModel.cameraAnchor(race.player, track, world.topAt));

const mpb = KYOTO_OUTER.metersPerBlock;
const maxH = Math.max(...KYOTO_OUTER.elevation.map((k) => k.h));
document.getElementById('course-name')!.textContent = KYOTO_OUTER.name;
document.getElementById('course-info')!.textContent =
  `全長 約${Math.round(track.length * mpb)}m（1ブロック=${mpb}m）・淀の坂 高低差 約${Math.round(maxH * mpb)}m（誇張表示）・${race.laps}周`;

const previewButtons = document.querySelectorAll<HTMLButtonElement>('[data-preview]');
const followButton = document.querySelector<HTMLButtonElement>('[data-follow]')!;
let labelsOn = true;
let cameraMode: CameraMode = 'orbit';
const refreshLabels = () => {
  // コースラベルは俯瞰視点の時だけ出す
  labels.visible = labelsOn && (cameraMode === 'orbit' || cameraMode === 'transition');
};
const toggleLabels = () => {
  labelsOn = !labelsOn;
  refreshLabels();
};
rig.onModeChange = (mode, viaPit) => {
  cameraMode = mode;
  refreshLabels();
  // 騎手視点ではカメラにかぶる騎手の頭を隠す
  horseModel.setJockeyHeadVisible(!(mode === 'follow' && rig.followStyle === 'jockey'));
  followButton.classList.toggle('active', mode === 'follow');
  followButton.textContent = `C ${rig.followStyle === 'jockey' ? '騎手視点' : '後方視点'}`;
  previewButtons.forEach((b) => {
    b.classList.toggle('active', mode === 'preview' && (b.dataset.preview === 'pit') === viaPit);
  });
};

const togglePreview = (viaPit: boolean) => {
  const sameMode = rig.previewing && document.querySelector(`[data-preview="${viaPit ? 'pit' : 'normal'}"].active`);
  if (sameMode) rig.stopPreview();
  else rig.startPreview(viaPit);
};

// ボタンにフォーカスが残ると Space（ムチ）でボタンが押されてしまうので外す
const onClick = (b: HTMLButtonElement, fn: () => void) =>
  b.addEventListener('click', () => {
    fn();
    b.blur();
  });
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) => {
  onClick(b, () => rig.goTo(b.dataset.view as ViewId));
});
previewButtons.forEach((b) => onClick(b, () => togglePreview(b.dataset.preview === 'pit')));
onClick(followButton, () => rig.toggleFollowStyle());
onClick(document.getElementById('toggle-labels') as HTMLButtonElement, toggleLabels);

const KEY_VIEWS: Record<string, ViewId> = { Digit1: 'overview', Digit2: 'hill', Digit3: 'pit', Digit4: 'finish' };
window.addEventListener('keydown', (e) => {
  if (KEY_VIEWS[e.code]) rig.goTo(KEY_VIEWS[e.code]);
  else if (e.code === 'Digit5') togglePreview(false);
  else if (e.code === 'Digit6') togglePreview(true);
  else if (e.code === 'KeyL') toggleLabels();
  else if (e.code === 'Escape') rig.stopPreview();
});

// --- 初期状態 ---
restartRace();
const startView = params.get('view') as ViewId | null;
if (startView) rig.snapTo(startView);
else rig.follow(params.get('cam') === 'jockey' ? 'jockey' : 'chase');
if (params.has('preview')) {
  const s = params.get('s');
  rig.startPreview(params.get('preview') === 'pit', s !== null ? Number(s) : undefined);
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
  if (pressed.has('KeyP')) race.player.togglePitRequest();
  if (pressed.has('KeyT')) race.player.cycleNextShoe();
  if (pressed.has('KeyC')) rig.toggleFollowStyle();
  if (pressed.has('KeyR')) restartRace();
  const horseControls = input.horseControls(pressed);
  if (autoRun) horseControls.accelerate = true;

  race.update(dt, horseControls);
  horseModel.sync(race.player, track, world.topAt, dt);
  hud.update(race);

  clouds.update(dt);
  rig.update(dt);
  lights.follow(controls.target); // 影はカメラが見ている所のまわりに描く
  renderer.render(scene, camera);
});
