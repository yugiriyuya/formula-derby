import * as THREE from 'three';

export const SKY_COLOR = 0x87ceeb;

/** ブロック調の雲を空に浮かべる。update(dt) でゆっくり流れる。 */
export function createClouds(count: number, spread: number) {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  const geom = new THREE.BoxGeometry(1, 1, 1);

  for (let i = 0; i < count; i++) {
    const cloud = new THREE.Group();
    const parts = 3 + Math.floor(Math.random() * 4);
    for (let j = 0; j < parts; j++) {
      const part = new THREE.Mesh(geom, mat);
      part.scale.set(6 + Math.random() * 8, 2, 4 + Math.random() * 6);
      part.position.set((Math.random() - 0.5) * 12, 0, (Math.random() - 0.5) * 8);
      cloud.add(part);
    }
    cloud.position.set(
      (Math.random() - 0.5) * spread,
      110 + Math.random() * 20,
      (Math.random() - 0.5) * spread,
    );
    group.add(cloud);
  }

  const update = (dt: number) => {
    for (const c of group.children) {
      c.position.x += dt * 1.5;
      if (c.position.x > spread / 2) c.position.x = -spread / 2;
    }
  };
  return { group, update };
}

/** 太陽光（影付き）＋空/地面の環境光 */
export function createLights(shadowRange: number) {
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x5a7a3a, 1.2);

  const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
  sun.position.set(40, 80, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const cam = sun.shadow.camera;
  cam.left = -shadowRange;
  cam.right = shadowRange;
  cam.top = shadowRange;
  cam.bottom = -shadowRange;
  cam.near = 1;
  cam.far = 250;
  sun.shadow.bias = -0.0005;

  return { hemi, sun };
}
