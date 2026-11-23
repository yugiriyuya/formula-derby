import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { KYOTO_OUTER } from './course/kyotoOuter';
import { CourseTrack } from './course/CourseTrack';
import { buildCourseWorld, type WorldBounds } from './scene/courseWorld';
import { buildFences } from './scene/fences';
import { buildStructures } from './scene/structures';
import { buildLabels } from './scene/labels';
import { createClouds, createLights, SKY_COLOR } from './scene/sky';
import { CameraRig, type ViewId } from './camera/CameraRig';

const WORLD_BOUNDS: WorldBounds = { minX: -116, maxX: 116, minZ: -74, maxZ: 80 };

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
scene.fog = new THREE.Fog(SKY_COLOR, 260, 650);

// --- Camera & Controls ---
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1500);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.49; // 地面の下に潜らない
controls.minDistance = 4;
controls.maxDistance = 450;

// --- Lights ---
const { hemi, sun } = createLights(130);
scene.add(hemi, sun, sun.target);

// --- Course ---
const track = new CourseTrack(KYOTO_OUTER);
const world = buildCourseWorld(track, WORLD_BOUNDS);
scene.add(world.group);
scene.add(buildFences(track, world.topAt));
scene.add(buildStructures(track, world.topAt, WORLD_BOUNDS));
const labels = buildLabels(track);
scene.add(labels);

const clouds = createClouds(22, 520);
scene.add(clouds.group);

// --- Camera rig & HUD ---
const rig = new CameraRig(camera, controls, track);
// 確認用: ?view=hill や ?preview=pit&s=400 で初期視点を指定できる
const params = new URLSearchParams(location.search);
rig.snapTo((params.get('view') as ViewId | null) ?? 'overview');

const mpb = KYOTO_OUTER.metersPerBlock;
const maxH = Math.max(...KYOTO_OUTER.elevation.map((k) => k.h));
document.getElementById('course-name')!.textContent = KYOTO_OUTER.name;
document.getElementById('course-info')!.textContent =
  `全長 約${Math.round(track.length * mpb)}m（1ブロック=${mpb}m）・淀の坂 高低差 ${maxH}ブロック（誇張表示）`;

const previewButtons = document.querySelectorAll<HTMLButtonElement>('[data-preview]');
let labelsOn = true;
const toggleLabels = () => {
  labelsOn = !labelsOn;
  labels.visible = labelsOn && !rig.previewing;
};
rig.onModeChange = (previewing, viaPit) => {
  labels.visible = labelsOn && !previewing; // 馬目線のプレビュー中はラベルを隠す
  previewButtons.forEach((b) => {
    const active = previewing && (b.dataset.preview === 'pit') === viaPit;
    b.classList.toggle('active', active);
  });
};

const togglePreview = (viaPit: boolean) => {
  const sameMode = rig.previewing && document.querySelector(`[data-preview="${viaPit ? 'pit' : 'normal'}"].active`);
  if (sameMode) rig.stopPreview();
  else rig.startPreview(viaPit);
};

if (params.has('preview')) {
  const s = params.get('s');
  rig.startPreview(params.get('preview') === 'pit', s !== null ? Number(s) : undefined);
}

document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) => {
  b.addEventListener('click', () => rig.goTo(b.dataset.view as ViewId));
});
previewButtons.forEach((b) => {
  b.addEventListener('click', () => togglePreview(b.dataset.preview === 'pit'));
});
document.getElementById('toggle-labels')!.addEventListener('click', toggleLabels);

const KEY_VIEWS: Record<string, ViewId> = { Digit1: 'overview', Digit2: 'hill', Digit3: 'pit', Digit4: 'finish' };
window.addEventListener('keydown', (e) => {
  if (KEY_VIEWS[e.code]) rig.goTo(KEY_VIEWS[e.code]);
  else if (e.code === 'Digit5') togglePreview(false);
  else if (e.code === 'Digit6') togglePreview(true);
  else if (e.code === 'KeyL') toggleLabels();
  else if (e.code === 'Escape') rig.stopPreview();
});

// --- Resize ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Loop ---
const timer = new THREE.Timer();
renderer.setAnimationLoop((time) => {
  timer.update(time);
  const dt = Math.min(timer.getDelta(), 0.1);
  clouds.update(dt);
  rig.update(dt);
  renderer.render(scene, camera);
});
