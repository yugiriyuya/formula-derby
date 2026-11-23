import * as THREE from 'three';

export const SKY_COLOR = 0x87ceeb;

/**
 * ブロック調の雲を空に浮かべる。update(dt) でゆっくり流れる。
 * @param height 雲の高さ（全景カメラより上に置いて視界を遮らないようにする）
 */
export function createClouds(count: number, spread: number, height: number) {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  const geom = new THREE.BoxGeometry(1, 1, 1);

  for (let i = 0; i < count; i++) {
    const cloud = new THREE.Group();
    const parts = 3 + Math.floor(Math.random() * 4);
    for (let j = 0; j < parts; j++) {
      const part = new THREE.Mesh(geom, mat);
      part.scale.set(20 + Math.random() * 25, 6, 14 + Math.random() * 18);
      part.position.set((Math.random() - 0.5) * 36, 0, (Math.random() - 0.5) * 24);
      cloud.add(part);
    }
    cloud.position.set((Math.random() - 0.5) * spread, height + Math.random() * 60, (Math.random() - 0.5) * spread);
    group.add(cloud);
  }

  const update = (dt: number) => {
    for (const c of group.children) {
      c.position.x += dt * 4;
      if (c.position.x > spread / 2) c.position.x = -spread / 2;
    }
  };
  return { group, update };
}

/** 太陽から見た方向（影の向き） */
const SUN_OFFSET = new THREE.Vector3(40, 80, 30);

/**
 * 太陽光（影付き）＋空/地面の環境光。
 * ワールドが広いので、影はカメラの注視点のまわり（shadowRange）だけ描き、follow(target) で影の範囲を動かす。
 */
export function createLights(shadowRange: number) {
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x5a7a3a, 1.2);

  const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
  sun.position.copy(SUN_OFFSET);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const cam = sun.shadow.camera;
  cam.left = -shadowRange;
  cam.right = shadowRange;
  cam.top = shadowRange;
  cam.bottom = -shadowRange;
  cam.near = 1;
  cam.far = 300;
  sun.shadow.bias = -0.0005;

  /** 影を描く範囲の中心を target に合わせる（影のちらつきを防ぐため 1 ブロック単位で動かす） */
  const follow = (target: THREE.Vector3) => {
    const x = Math.round(target.x);
    const z = Math.round(target.z);
    sun.target.position.set(x, 0, z);
    sun.position.set(x + SUN_OFFSET.x, SUN_OFFSET.y, z + SUN_OFFSET.z);
  };

  return { hemi, sun, follow };
}
