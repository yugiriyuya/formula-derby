import * as THREE from 'three';
import type { CourseTrack, TrackFrame } from '../course/CourseTrack';
import type { WorldBounds } from './courseWorld';

type TopAt = (x: number, z: number) => number;

/** 仮のコンストラクターカラー（後で外部データに置き換える） */
const TEAM_COLORS = [0xd83a3a, 0x2f6fd8, 0xf2c230, 0x2fae5a, 0x8a3fd1, 0xf07c24];

const box = (w: number, h: number, d: number, mat: THREE.Material | THREE.Material[]) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};
const lambert = (color: number) => new THREE.MeshLambertMaterial({ color });

/**
 * コースのフレームに合わせたローカル座標のグループを作る。
 * ローカル +x = 進行方向、+z = コース内側、-z = 外側。
 */
function placeOnTrack(frame: TrackFrame, y: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(frame.position.x, y, frame.position.z);
  g.rotation.y = Math.atan2(-frame.dir.z, frame.dir.x);
  return g;
}

/** ホームストレッチ外側の段々スタンド */
function buildStands(track: CourseTrack, topAt: TopAt): THREE.Group {
  const { centerS, length, offset } = track.def.stands;
  const frame = track.frameAt(centerS, 0);
  const g = placeOnTrack(frame, topAt(frame.position.x, frame.position.z));

  const concrete = lambert(0xbdbdbd);
  const seatColors = [lambert(0x2e5aa8), lambert(0x3a6cc4)];
  const tiers = 7;
  for (let k = 0; k < tiers; k++) {
    const h = 0.8 + k * 0.9;
    const tier = box(length, h, 2, k === 0 ? concrete : seatColors[k % 2]);
    tier.position.set(0, h / 2, -(offset + 1 + k * 2));
    g.add(tier);
  }
  const back = -(offset + tiers * 2 + 0.5);
  const wall = box(length, 10, 1, concrete);
  wall.position.set(0, 5, back);
  g.add(wall);

  const roof = box(length + 2, 0.6, tiers * 2 + 3, lambert(0xe8e8e8));
  roof.position.set(0, 10.3, -(offset + tiers + 0.5));
  g.add(roof);
  const roofEdge = box(length + 2, 0.8, 0.4, lambert(0x1f8f4f));
  roofEdge.position.set(0, 10.3, -(offset - 1.2));
  g.add(roofEdge);
  return g;
}

/** ピットレーン沿いの厩舎（ピットボックス）。コンストラクターごとに 1 棟 */
function buildGarages(track: CourseTrack, topAt: TopAt): THREE.Group {
  const pit = track.def.pitLane;
  const group = new THREE.Group();
  const span = (pit.garageEnd - pit.garageStart) / TEAM_COLORS.length;
  const depth = 3;
  const lateral = pit.lateral + pit.width / 2 + 0.5 + depth / 2;
  const wallMat = lambert(0xd9c7a0);
  const openMat = lambert(0x3a2a1a);

  TEAM_COLORS.forEach((color, i) => {
    const frame = track.frameAt(pit.garageStart + (i + 0.5) * span, lateral);
    const g = placeOnTrack(frame, topAt(frame.position.x, frame.position.z));
    const teamMat = lambert(color);
    const w = span - 0.6;
    // 面順: +x, -x, +y(屋根), -y, +z(裏), -z(ピットレーン側 = 開口部)
    const body = box(w, 3, depth, [wallMat, wallMat, teamMat, wallMat, wallMat, openMat]);
    body.position.y = 1.5;
    g.add(body);
    const awning = box(w, 0.3, 1.2, teamMat);
    awning.position.set(0, 3, -(depth / 2 + 0.5));
    g.add(awning);
    group.add(g);
  });
  return group;
}

/** ゴール板（外ラチ側のポール） */
function buildFinishPost(track: CourseTrack, topAt: TopAt): THREE.Group {
  const half = track.def.trackWidth / 2;
  const frame = track.frameAt(track.def.finishS, -(half + 1.5));
  const g = placeOnTrack(frame, topAt(frame.position.x, frame.position.z));
  const pole = box(0.3, 6, 0.3, lambert(0xffffff));
  pole.position.y = 3;
  g.add(pole);
  const board = box(0.3, 1.6, 1.6, [lambert(0xd83a3a), lambert(0xd83a3a), lambert(0xffffff), lambert(0xffffff), lambert(0xffffff), lambert(0xffffff)]);
  board.position.y = 6.5;
  g.add(board);
  return g;
}

/** コース外周と内馬場に置くブロックの木 */
function buildTrees(track: CourseTrack, topAt: TopAt, bounds: WorldBounds): THREE.Group {
  const def = track.def;
  const half = def.trackWidth / 2;
  const dirtOuter = def.dirtCourse.lateral + def.dirtCourse.width / 2;
  let seed = 12345;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  const spots: THREE.Vector3[] = [];
  for (let tries = 0; tries < 4000 && spots.length < 90; tries++) {
    const x = Math.floor(bounds.minX + 3 + rand() * (bounds.maxX - bounds.minX - 6)) + 0.5;
    const z = Math.floor(bounds.minZ + 3 + rand() * (bounds.maxZ - bounds.minZ - 6)) + 0.5;
    const { s, lateral } = track.project(x, z);
    const outside = lateral < -(half + 6);
    const nearStands =
      Math.abs(track.diff(s, def.stands.centerS)) < def.stands.length / 2 + 6 && lateral > -(def.stands.offset + 24);
    const infield = lateral > dirtOuter + 4;
    if (!((outside && !nearStands) || infield)) continue;
    if (spots.some((p) => Math.abs(p.x - x) < 4 && Math.abs(p.z - z) < 4)) continue;
    spots.push(new THREE.Vector3(x, topAt(x, z), z));
  }

  const trunks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 3, 1), lambert(0x6b4a2b), spots.length);
  const leaves = new THREE.InstancedMesh(new THREE.BoxGeometry(3, 3, 3), lambert(0x3f8f2f), spots.length);
  const m = new THREE.Matrix4();
  spots.forEach((p, i) => {
    trunks.setMatrixAt(i, m.makeTranslation(p.x, p.y + 1.5, p.z));
    leaves.setMatrixAt(i, m.makeTranslation(p.x, p.y + 4, p.z));
  });
  for (const mesh of [trunks, leaves]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  const g = new THREE.Group();
  g.add(trunks, leaves);
  return g;
}

export function buildStructures(track: CourseTrack, topAt: TopAt, bounds: WorldBounds): THREE.Group {
  const g = new THREE.Group();
  g.add(
    buildStands(track, topAt),
    buildGarages(track, topAt),
    buildFinishPost(track, topAt),
    buildTrees(track, topAt, bounds),
  );
  return g;
}
