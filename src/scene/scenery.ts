import * as THREE from 'three';
import type { CourseTrack } from '../course/CourseTrack';
import type { SceneryItem } from '../course/types';
import type { WorldBounds } from './courseWorld';

type TopAt = (x: number, z: number) => number;

/** 1 つの箱（ワールド座標・ブロック）。InstancedMesh にまとめて描く */
interface BoxInstance {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  rot: number;
  color: number;
}

let seed = 7;
const rand = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

/**
 * コースまわりの景観（建物・水面・山並み・照明塔・スタンド・壁・目印の建物）。
 * 箱はすべて 2 つの InstancedMesh（ふつうの箱 / 光る箱）にまとめるので、数百個置いても軽い。
 * 置く場所がコース・ピット・スタンドにかかる時は自動で間引く。
 */
export function buildScenery(track: CourseTrack, topAt: TopAt, bounds: WorldBounds, items: readonly SceneryItem[]): THREE.Group {
  seed = 7;
  const def = track.def;
  const mpb = def.metersPerBlock;
  const m = (meters: number) => meters / mpb;
  const half = def.trackWidth / 2;
  const pit = def.pitLane;
  const stands = def.stands;
  const solid: BoxInstance[] = [];
  const glow: BoxInstance[] = [];
  const group = new THREE.Group();

  /** (x, z) を中心に半径 r（ブロック）の物を置いてよいか（コース・ピット・スタンド・ワールドの外を避ける） */
  const clear = (x: number, z: number, r: number) => {
    if (x < bounds.minX + 2 || x > bounds.maxX - 2 || z < bounds.minZ + 2 || z > bounds.maxZ - 2) return false;
    for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
      const { s, lateral } = track.project(x + dx, z + dz);
      if (Math.abs(lateral) < half + 4) return false;
      const p = track.pitLateralAt(s);
      if (p !== null && lateral > 0 && lateral < p + pit.width / 2 + 14) return false;
      if (lateral < 0 && Math.abs(track.diff(s, stands.centerS)) < stands.length / 2 + 8 && -lateral < stands.offset + 34) return false;
    }
    return true;
  };
  /** コースに沿った向き（ローカル +x = 進行方向） */
  const along = (s: number) => {
    const d = track.frameAt(s).dir;
    return Math.atan2(-d.z, d.x);
  };
  const sideSign = (side: 'in' | 'out' | undefined) => (side === 'in' ? 1 : -1);
  const range = (from: number, to: number, step: number) => {
    const out: number[] = [];
    const len = ((to - from) % (track.length * mpb) + track.length * mpb) % (track.length * mpb) || track.length * mpb;
    for (let d = 0; d <= len; d += step) out.push(m(from + d));
    return out;
  };

  for (const item of items) {
    switch (item.kind) {
      case 'buildings': {
        const spacing = item.spacing ?? 24;
        const depth = m(item.depth ?? 14);
        const rows = item.rows ?? 1;
        const sign = sideSign(item.side);
        for (const s of range(item.from, item.to, spacing)) {
          for (let r = 0; r < rows; r++) {
            const lat = sign * (half + m(item.offset) + depth / 2 + r * (depth + m(8)));
            const p = track.frameAt(s, lat).position;
            const w = m(spacing * (0.6 + rand() * 0.3));
            if (!clear(p.x, p.z, Math.max(w, depth) / 2 + 1)) continue;
            const h = m(item.height[0] + rand() * (item.height[1] - item.height[0]));
            const color = item.colors[Math.floor(rand() * item.colors.length)];
            solid.push({ x: p.x, y: topAt(p.x, p.z), z: p.z, w, h, d: depth, rot: along(s), color });
            // 窓の帯（少し暗い色の薄い箱を重ねて、建物らしく見せる）
            if (h > m(12)) {
              const c = new THREE.Color(color).multiplyScalar(0.55).getHex();
              for (let y = m(5); y < h - m(3); y += m(7)) {
                solid.push({ x: p.x, y: topAt(p.x, p.z) + y, z: p.z, w: w + 0.2, h: m(1.6), d: depth + 0.2, rot: along(s), color: c });
              }
            }
          }
        }
        break;
      }
      case 'water': {
        // 池・湖・海。コースにかかる時は小さくする
        let w = m(item.w);
        let d = m(item.d);
        const f = track.frameAt(m(item.s), m(item.lateral));
        const rot = Math.atan2(-f.dir.z, f.dir.x);
        const fits = () => {
          const cx = f.position.x;
          const cz = f.position.z;
          const ax = f.dir.x;
          const az = f.dir.z;
          const bx = f.right.x;
          const bz = f.right.z;
          for (const [u, v] of [[0, 0], [0.5, 0.5], [0.5, -0.5], [-0.5, 0.5], [-0.5, -0.5], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) {
            if (!clear(cx + ax * w * u + bx * d * v, cz + az * w * u + bz * d * v, 1)) return false;
          }
          return true;
        };
        let tries = 0;
        while (!fits() && tries < 6) {
          w *= 0.8;
          d *= 0.8;
          tries++;
        }
        if (!fits()) break;
        // 水面は四隅の地面のいちばん高い所にそろえる（坂のあるコースで地面に埋もれないように）
        let y = topAt(f.position.x, f.position.z);
        for (const [u, v] of [[0.5, 0.5], [0.5, -0.5], [-0.5, 0.5], [-0.5, -0.5]]) {
          y = Math.max(y, topAt(f.position.x + f.dir.x * w * u + f.right.x * d * v, f.position.z + f.dir.z * w * u + f.right.z * d * v));
        }
        const water = new THREE.Mesh(
          new THREE.BoxGeometry(w, 0.3, d),
          new THREE.MeshLambertMaterial({ color: 0x2f74b5, transparent: true, opacity: 0.88 }),
        );
        water.position.set(f.position.x, y + 0.05, f.position.z);
        water.rotation.y = rot;
        water.receiveShadow = true;
        group.add(water);
        // 岸の縁（明るい砂色）
        solid.push({ x: f.position.x, y: y - 0.2, z: f.position.z, w: w + 1.2, h: 0.4, d: d + 1.2, rot, color: 0xc9b98a });
        for (let i = 0; i < (item.boats ?? 0); i++) {
          const u = (rand() - 0.5) * 0.8;
          const v = (rand() - 0.5) * 0.8;
          const bx = f.position.x + f.dir.x * w * u + f.right.x * d * v;
          const bz = f.position.z + f.dir.z * w * u + f.right.z * d * v;
          const len = m(10 + rand() * 18);
          solid.push({ x: bx, y: y + 0.2, z: bz, w: len, h: m(2.2), d: len * 0.32, rot: rot + rand() * 0.6, color: 0xf4f4f4 });
          solid.push({ x: bx, y: y + 0.2 + m(2.2), z: bz, w: len * 0.45, h: m(2), d: len * 0.22, rot: rot, color: 0x9fc3e0 });
        }
        break;
      }
      case 'mountains': {
        // ワールドの外周に、段々に積んだ大きな山（遠景）
        // 全景カメラはホームストレートの内側（スタンドの反対側）の上空にあるので、そちら側には置かない
        const cx = (bounds.minX + bounds.maxX) / 2;
        const cz = (bounds.minZ + bounds.maxZ) / 2;
        const R = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2;
        const lap = track.length;
        const lastSeg = def.segments[def.segments.length - 1];
        const homeLen = lastSeg.type === 'straight' ? lastSeg.length : 0;
        const inward = track.frameAt(lap - homeLen / 2).right;
        const camAngle = Math.atan2(inward.z, inward.x);
        for (let i = 0; i < item.count; i++) {
          const a = (i / item.count) * Math.PI * 2 + rand() * 0.3;
          if (Math.cos(a - camAngle) > 0.2) continue;
          const dist = R * (1.45 + rand() * 0.45);
          const x = cx + Math.cos(a) * dist;
          const z = cz + Math.sin(a) * dist;
          const h = m(item.height[0] + rand() * (item.height[1] - item.height[0]));
          const base = h * (1.6 + rand());
          const c = new THREE.Color(item.color);
          for (let t = 0; t < 4; t++) {
            const k = 1 - t * 0.24;
            const shade = c.clone().multiplyScalar(0.85 + t * 0.07).getHex();
            solid.push({ x, y: -3 + (h / 4) * t, z, w: base * k, h: h / 4 + 0.5, d: base * k * 0.8, rot: a, color: t === 3 && h > m(150) ? 0xe8eef2 : shade });
          }
        }
        break;
      }
      case 'lights': {
        // ナイターの照明塔（外側と内側に交互）。光る頭は glow に入れる
        let i = 0;
        for (const s of range(0, track.length * mpb - item.every / 2, item.every)) {
          const sign = i++ % 2 === 0 ? -1 : 1;
          const lat = sign * (half + m(item.offset));
          const p = track.frameAt(s, lat).position;
          if (!clear(p.x, p.z, 1.5)) continue;
          const y = topAt(p.x, p.z);
          const pole = m(32);
          solid.push({ x: p.x, y, z: p.z, w: 0.7, h: pole, d: 0.7, rot: 0, color: 0x9aa0a8 });
          glow.push({ x: p.x, y: y + pole, z: p.z, w: 4.5, h: 1.6, d: 1.2, rot: along(s), color: 0xfff6d8 });
        }
        break;
      }
      case 'stands': {
        const sign = sideSign(item.side);
        for (const s of range(item.from, item.to, 18)) {
          for (let t = 0; t < 5; t++) {
            const lat = sign * (half + m(item.offset) + t * 2.2);
            const p = track.frameAt(s, lat).position;
            if (!clear(p.x, p.z, 2)) continue;
            solid.push({ x: p.x, y: topAt(p.x, p.z), z: p.z, w: m(16), h: 1 + t * 1.3, d: 2.2, rot: along(s), color: t % 2 ? 0xd84a3a : 0x2e5aa8 });
          }
        }
        break;
      }
      case 'wall': {
        const sign = sideSign(item.side);
        for (const s of range(item.from, item.to, 4)) {
          const p = track.frameAt(s, sign * (half + m(item.offset))).position;
          if (!clear(p.x, p.z, 0.6)) continue;
          solid.push({ x: p.x, y: topAt(p.x, p.z), z: p.z, w: m(4.4), h: m(item.height), d: 1.2, rot: along(s), color: item.color });
          // 城壁の凹凸（狭間）
          if ((Math.round(s * mpb) / 4) % 2 === 0) {
            solid.push({ x: p.x, y: topAt(p.x, p.z) + m(item.height), z: p.z, w: m(2), h: m(1.4), d: 1.2, rot: along(s), color: item.color });
          }
        }
        break;
      }
      case 'landmark': {
        const f = track.frameAt(m(item.s), m(item.lateral));
        const rot = Math.atan2(-f.dir.z, f.dir.x);
        const y0 = topAt(f.position.x, f.position.z);
        for (const [x, z, w, d, h, color, lit] of item.boxes) {
          const px = f.position.x + f.dir.x * m(x) + f.right.x * m(z);
          const pz = f.position.z + f.dir.z * m(x) + f.right.z * m(z);
          (lit ? glow : solid).push({ x: px, y: y0, z: pz, w: m(w), h: m(h), d: m(d), rot, color });
        }
        break;
      }
    }
  }

  const toMesh = (list: BoxInstance[], material: THREE.Material, shadows: boolean) => {
    if (list.length === 0) return;
    const geom = new THREE.BoxGeometry(1, 1, 1);
    geom.translate(0, 0.5, 0); // 足元を y にそろえる
    const mesh = new THREE.InstancedMesh(geom, material, list.length);
    const mat = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const c = new THREE.Color();
    list.forEach((b, i) => {
      q.setFromAxisAngle(up, b.rot);
      mat.compose(new THREE.Vector3(b.x, b.y, b.z), q, new THREE.Vector3(b.w, b.h, b.d));
      mesh.setMatrixAt(i, mat);
      mesh.setColorAt(i, c.setHex(b.color));
    });
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    group.add(mesh);
  };
  toMesh(solid, new THREE.MeshLambertMaterial({ color: 0xffffff }), true);
  toMesh(glow, new THREE.MeshBasicMaterial({ color: 0xffffff }), false);
  return group;
}
