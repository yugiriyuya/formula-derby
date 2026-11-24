import * as THREE from 'three';
import type { Weather } from '../race/Race';
import { SKY_COLOR } from './sky';

const RAIN_SKY = 0x7d8a96;
/** ナイターの夜空（雨の夜は少し明るい灰紺） */
const NIGHT_SKY = 0x0b1226;
const NIGHT_RAIN_SKY = 0x1a2230;
const DROPS = 2200;
/** 雨粒を降らせる範囲（カメラのまわり。ブロック） */
const BOX = { x: 70, y: 40, z: 70 };
const FALL_SPEED = 38;

/**
 * 天候の見た目。雨の日は空と霧を灰色に、光を弱く、芝を濡れた濃い色にして、カメラのまわりに雨を降らせる。
 * レースの物理（グリップ・芝の荒れ）は Race 側で扱う。ここは描画だけ。
 */
export class WeatherView {
  private readonly rain: THREE.LineSegments;
  private readonly positions: Float32Array;
  private weather: Weather = 'sunny';
  private readonly stars: THREE.Points;

  /**
   * @param night ナイター：夜空と星、照明で照らされたコース（太陽の代わりに真上寄りの白い照明）
   */
  constructor(
    private readonly scene: THREE.Scene,
    private readonly lights: { hemi: THREE.HemisphereLight; sun: THREE.DirectionalLight },
    private readonly turfMaterial: THREE.Material | null,
    private readonly clouds: THREE.Group,
    private readonly night = false,
  ) {
    // 夜空の星（遠くの大きな半球に点を散らす）
    const starPos = new Float32Array(900 * 3);
    for (let i = 0; i < 900; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = 0.08 + Math.random() * 1.3;
      const r = 1500;
      starPos.set([Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false }));
    this.stars.visible = false;
    scene.add(this.stars);
    this.positions = new Float32Array(DROPS * 6);
    for (let i = 0; i < DROPS; i++) this.placeDrop(i, Math.random() * BOX.y);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.rain = new THREE.LineSegments(
      g,
      new THREE.LineBasicMaterial({ color: 0xc8d4e0, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    scene.add(this.rain);
  }

  private placeDrop(i: number, y: number) {
    const x = (Math.random() - 0.5) * BOX.x;
    const z = (Math.random() - 0.5) * BOX.z;
    const p = this.positions;
    p[i * 6] = x;
    p[i * 6 + 1] = y;
    p[i * 6 + 2] = z;
    p[i * 6 + 3] = x + 0.08;
    p[i * 6 + 4] = y - 0.9;
    p[i * 6 + 5] = z;
  }

  set(weather: Weather) {
    this.weather = weather;
    const rain = weather === 'rain';
    const night = this.night;
    const sky = night ? (rain ? NIGHT_RAIN_SKY : NIGHT_SKY) : rain ? RAIN_SKY : SKY_COLOR;
    (this.scene.background as THREE.Color).setHex(sky);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.setHex(sky);
    fog.near = rain ? 180 : night ? 450 : 700;
    fog.far = rain ? 900 : night ? 1500 : 1800;
    // ナイター：空からの光は暗い青、コースは照明（白い平行光）で明るく照らす
    this.lights.hemi.color.setHex(night ? 0x5a6a9a : 0xcfe8ff);
    this.lights.hemi.groundColor.setHex(night ? 0x1a1a22 : 0x5a7a3a);
    this.lights.hemi.intensity = night ? (rain ? 0.45 : 0.55) : rain ? 0.8 : 1.2;
    this.lights.sun.color.setHex(night ? 0xf4f0ff : 0xfff4e0);
    this.lights.sun.intensity = night ? (rain ? 1.3 : 1.7) : rain ? 0.7 : 2.2;
    this.stars.visible = night && !rain;
    this.clouds.visible = !night;
    if (this.turfMaterial && 'color' in this.turfMaterial) {
      // 濡れた芝は濃い色に
      (this.turfMaterial as THREE.MeshLambertMaterial).color.setHex(rain ? 0x9aa894 : 0xffffff);
    }
    for (const c of this.clouds.children) {
      for (const part of c.children) {
        const m = (part as THREE.Mesh).material as THREE.MeshLambertMaterial;
        m.color.setHex(rain ? 0x8a9099 : 0xffffff);
      }
    }
    this.rain.visible = rain;
  }

  /** 雨粒を落とす（カメラのまわりについて回る） */
  update(dt: number, camera: THREE.Camera) {
    // 星はカメラについて回る（いつも遠くに見える）
    if (this.stars.visible) this.stars.position.copy(camera.position);
    if (this.weather !== 'rain') return;
    this.rain.position.set(camera.position.x, camera.position.y - BOX.y / 2, camera.position.z);
    const p = this.positions;
    const fall = FALL_SPEED * dt;
    for (let i = 0; i < DROPS; i++) {
      p[i * 6 + 1] -= fall;
      p[i * 6 + 4] -= fall;
      if (p[i * 6 + 4] < 0) this.placeDrop(i, BOX.y);
    }
    (this.rain.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}
