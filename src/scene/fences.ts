import * as THREE from 'three';
import type { CourseTrack } from '../course/CourseTrack';

interface RailSpec {
  lateral: number;
  /** true を返した s では柵を切る（ピット出入口など） */
  skip?: (s: number) => boolean;
}

const POST_SPACING = 2;
const RAIL_HEIGHT = 1.0;
const X_AXIS = new THREE.Vector3(1, 0, 0);

/** 白いラチ（柵）。支柱とレールを InstancedMesh でまとめて描画する。 */
export function buildFences(track: CourseTrack, topAt: (x: number, z: number) => number): THREE.Group {
  // ラチの位置は落馬判定（Race）と同じ track.railLateral を使う
  const rail = track.railLateral;
  const rails: RailSpec[] = [
    { lateral: -rail }, // 外ラチ
    // 内ラチ。ピットレーンが横切る区間は開ける
    { lateral: rail, skip: (s) => track.innerRailOpenAt(s) },
  ];

  const posts: THREE.Matrix4[] = [];
  const bars: THREE.Matrix4[] = [];
  const n = Math.round(track.length / POST_SPACING);

  for (const rail of rails) {
    let prev: THREE.Vector3 | null = null;
    let first: THREE.Vector3 | null = null;
    for (let i = 0; i <= n; i++) {
      const s = (i % n) * (track.length / n);
      if (rail.skip?.(s)) {
        prev = null;
        continue;
      }
      const p = track.frameAt(s, rail.lateral).position;
      p.y = topAt(p.x, p.z);
      if (i < n) {
        posts.push(new THREE.Matrix4().makeTranslation(p.x, p.y + RAIL_HEIGHT / 2, p.z));
      }
      const top = p.clone().setY(p.y + RAIL_HEIGHT);
      if (i === 0) first = top;
      if (prev) bars.push(barMatrix(prev, i === n && first ? first : top));
      prev = top;
    }
  }

  const mat = new THREE.MeshLambertMaterial({ color: 0xf4f4f4 });
  const group = new THREE.Group();
  group.add(instanced(new THREE.BoxGeometry(0.2, RAIL_HEIGHT, 0.2), mat, posts));
  group.add(instanced(new THREE.BoxGeometry(1, 0.18, 0.28), mat, bars));
  return group;
}

function barMatrix(a: THREE.Vector3, b: THREE.Vector3): THREE.Matrix4 {
  const d = b.clone().sub(a);
  const len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(X_AXIS, d.normalize());
  const mid = a.clone().add(b).multiplyScalar(0.5);
  return new THREE.Matrix4().compose(mid, q, new THREE.Vector3(len, 1, 1));
}

function instanced(geom: THREE.BufferGeometry, mat: THREE.Material, matrices: THREE.Matrix4[]) {
  const mesh = new THREE.InstancedMesh(geom, mat, matrices.length);
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  return mesh;
}
