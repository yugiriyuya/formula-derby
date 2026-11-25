import * as THREE from 'three';

/** 観客 1 人の座る（立つ）位置と、向いている方向（水平の単位ベクトル。コースの方） */
export interface Seat {
  x: number;
  y: number;
  z: number;
  fx: number;
  fz: number;
}

/** 服の色（観客席が単調にならないように）と、肌・帽子の色 */
const SHIRTS = [0xd83a3a, 0x2f6fd8, 0xf2c230, 0x2fae5a, 0xf4f4f4, 0x222222, 0xf07c24, 0x8a3fd1, 0x1fb5b0, 0xe86aa0, 0x6b4a2b, 0x9aa0a8];
const SKINS = [0xf0c8a0, 0xe0b088, 0xc89068, 0xf5d5b5];
const CAPS = [0xffffff, 0x1f3a8a, 0xd83a3a, 0x222222, 0xffd23a];

/** 決まった並びの乱数（毎回同じ観客席になる） */
function seeded(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => {
    s = (s * 48271) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * ブロック調の観客（胴体＋頭）。InstancedMesh 2 つ（胴体・頭）でまとめて描くので、何千人いても軽い。
 * 座標はこのグループを入れる親（スタンドのグループ・ワールド）の座標で渡す。
 */
export function buildSpectators(seats: readonly Seat[], seed = 1): THREE.Group {
  const group = new THREE.Group();
  if (seats.length === 0) return group;
  const rand = seeded(seed);
  const n = seats.length;
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(0.52, 0.62, 0.36), material, n);
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), material, n);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();
  seats.forEach((st, i) => {
    q.setFromAxisAngle(up, Math.atan2(st.fx, st.fz) + (rand() - 0.5) * 0.5);
    // 少しだけ高さと前後をばらす（立ち上がって応援している人もいる）
    const standing = rand() < 0.15 ? 0.3 : 0;
    pos.set(st.x, st.y + 0.36 + standing, st.z);
    bodies.setMatrixAt(i, m.compose(pos, q, one));
    bodies.setColorAt(i, color.setHex(SHIRTS[Math.floor(rand() * SHIRTS.length)]));
    pos.set(st.x, st.y + 0.86 + standing, st.z);
    heads.setMatrixAt(i, m.compose(pos, q, one));
    heads.setColorAt(i, color.setHex(rand() < 0.25 ? CAPS[Math.floor(rand() * CAPS.length)] : SKINS[Math.floor(rand() * SKINS.length)]));
  });
  for (const mesh of [bodies, heads]) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  return group;
}

/**
 * 一列に並べた座席：from から along 方向へ length の長さに、spacing 間隔で（occupancy の割合だけ埋まる）。
 * skip(x, y, z) が true の所には座らせない（カメラの位置など）
 */
export function seatRow(
  out: Seat[],
  center: THREE.Vector3,
  along: THREE.Vector3,
  facing: THREE.Vector3,
  length: number,
  rand: () => number,
  occupancy = 0.7,
  spacing = 0.85,
  skip?: (p: THREE.Vector3) => boolean,
) {
  const count = Math.floor(length / spacing);
  const p = new THREE.Vector3();
  for (let k = 0; k < count; k++) {
    if (rand() > occupancy) continue;
    const t = (k + 0.5) * spacing - length / 2 + (rand() - 0.5) * 0.2;
    p.copy(center).addScaledVector(along, t);
    if (skip?.(p)) continue;
    out.push({ x: p.x, y: p.y, z: p.z, fx: facing.x, fz: facing.z });
  }
}

export { seeded as seededRandom };
