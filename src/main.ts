import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createTerrain } from './scene/terrain';
import { createClouds, createLights, SKY_COLOR } from './scene/sky';

const WORLD_SIZE = 96;

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
scene.fog = new THREE.Fog(SKY_COLOR, 60, 160);

// --- Camera & Controls ---
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(30, 25, 40);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 2, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.48; // 地面の下に潜らない
controls.minDistance = 5;
controls.maxDistance = 120;

// --- Lights ---
const { hemi, sun } = createLights(WORLD_SIZE / 2);
scene.add(hemi, sun);

// --- World ---
scene.add(createTerrain({ size: WORLD_SIZE, maxHeight: 4 }));
const clouds = createClouds(14, WORLD_SIZE * 2);
scene.add(clouds.group);

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
  controls.update();
  renderer.render(scene, camera);
});
