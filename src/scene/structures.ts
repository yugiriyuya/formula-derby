import * as THREE from 'three';
import type { CourseTrack, TrackFrame } from '../course/CourseTrack';
import type { WorldBounds } from './courseWorld';
import { CONSTRUCTORS, type ConstructorData } from '../data/roster';

type TopAt = (x: number, z: number) => number;

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
 * 左回りのコースでは内側が進行方向の左になるので、z を反転（鏡写し）する。文字を描いた面には使わないこと。
 */
function placeOnTrack(frame: TrackFrame, y: number, side: 1 | -1): THREE.Group {
  const g = new THREE.Group();
  g.position.set(frame.position.x, y, frame.position.z);
  g.rotation.y = Math.atan2(-frame.dir.z, frame.dir.x);
  g.scale.z = side;
  return g;
}

/** ホームストレッチ外側の段々スタンド */
function buildStands(track: CourseTrack, topAt: TopAt): THREE.Group {
  const { centerS, length, offset } = track.def.stands;
  const frame = track.frameAt(centerS, 0);
  const g = placeOnTrack(frame, topAt(frame.position.x, frame.position.z), track.side);

  const concrete = lambert(0xbdbdbd);
  const seatColors = [lambert(0x2e5aa8), lambert(0x3a6cc4)];
  const tiers = 14;
  const tierDepth = 2;
  const rise = 1.2;
  for (let k = 0; k < tiers; k++) {
    const h = 0.8 + k * rise;
    const tier = box(length, h, tierDepth, k === 0 ? concrete : seatColors[k % 2]);
    tier.position.set(0, h / 2, -(offset + tierDepth / 2 + k * tierDepth));
    g.add(tier);
  }
  const depth = tiers * tierDepth;
  const wallH = 22;
  const wall = box(length, wallH, 1.5, concrete);
  wall.position.set(0, wallH / 2, -(offset + depth + 0.75));
  g.add(wall);

  // 屋根と、それを支える後ろ側の柱
  const roof = box(length + 4, 1, depth + 6, lambert(0xe8e8e8));
  roof.position.set(0, wallH + 0.5, -(offset + depth / 2 - 2));
  g.add(roof);
  const roofEdge = box(length + 4, 1.4, 0.6, lambert(0x1f8f4f));
  roofEdge.position.set(0, wallH + 0.5, -(offset - 5));
  g.add(roofEdge);
  for (let x = -length / 2; x <= length / 2; x += 22) {
    const pillar = box(1, wallH, 1, concrete);
    pillar.position.set(x, wallH / 2, -(offset + depth - 3));
    g.add(pillar);
  }
  return g;
}

/** ピット番号の札（常にカメラの方を向く。左回りのコースで文字が裏返らないようスプライトにする） */
function pitSign(text: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffd23a';
  ctx.fillRect(0, 0, 128, 64);
  ctx.fillStyle = '#111';
  ctx.font = 'bold 40px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 35);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
  sprite.scale.set(4, 2, 1);
  return sprite;
}

/** 厩舎の並びを塗り替える：order[i] = ピットレーンの入口側から i 番目の厩舎を使うコンストラクター */
export interface GarageRow {
  paint(order: readonly string[] | null): void;
}

/** ピットレーン沿いの厩舎（ピットボックス）。コンストラクターごとに 1 棟。出口側が 1 番ピット */
function buildGarages(track: CourseTrack, topAt: TopAt, teams: readonly ConstructorData[]): { group: THREE.Group; row: GarageRow } {
  const pit = track.def.pitLane;
  const group = new THREE.Group();
  const count = teams.length;
  const span = track.wrap(pit.garageEnd - pit.garageStart) / count;
  const depth = 8;
  const height = 5;
  const lateral = pit.lateral + pit.width / 2 + 0.5 + depth / 2;
  const wallMat = lambert(0xd9c7a0);
  const openMat = lambert(0x3a2a1a);
  const teamMats: THREE.MeshLambertMaterial[] = [];

  teams.forEach((c, i) => {
    // 馬が停止する位置（track.garageS）と同じ s に建てる
    const frame = track.frameAt(track.garageS(i, count), lateral);
    const g = placeOnTrack(frame, topAt(frame.position.x, frame.position.z), track.side);
    const teamMat = lambert(c.color);
    teamMats.push(teamMat);
    const w = Math.min(span - 2, 14);
    // 面順: +x, -x, +y(屋根), -y, +z(裏), -z(ピットレーン側 = 開口部)
    const body = box(w, height, depth, [wallMat, wallMat, teamMat, wallMat, wallMat, openMat]);
    body.position.y = height / 2;
    g.add(body);
    const awning = box(w, 0.4, 2.4, teamMat);
    awning.position.set(0, height, -(depth / 2 + 1.2));
    g.add(awning);
    group.add(g);
    // ピット番号の札（屋根の上、ピットレーン側）
    const sign = pitSign(`PIT ${count - i}`);
    const sp = track.frameAt(track.garageS(i, count), lateral - depth / 2).position;
    sign.position.set(sp.x, topAt(frame.position.x, frame.position.z) + height + 2.2, sp.z);
    group.add(sign);
  });
  const row: GarageRow = {
    paint(order) {
      teams.forEach((c, i) => {
        const id = order ? order[i] : c.id;
        const team = CONSTRUCTORS.find((t) => t.id === id) ?? c;
        teamMats[i].color.setHex(team.color);
      });
    },
  };
  return { group, row };
}

/** ゴール板（外ラチ側のポール） */
function buildFinishPost(track: CourseTrack, topAt: TopAt): THREE.Group {
  const frame = track.frameAt(track.def.finishS, -(track.railLateral + 1));
  const g = placeOnTrack(frame, topAt(frame.position.x, frame.position.z), track.side);
  g.name = 'finish-post'; // ゴール前リプレイ（写真判定カメラ）では視線を遮るので隠す
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
  // 内馬場の木はピットレーン・厩舎・坂の法面より内側にだけ置く
  const pit = def.pitLane;
  const infieldMin = Math.max(pit.lateral + pit.width / 2 + 14, half + def.embankment + 4);
  let seed = 12345;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // 外ラチのすぐ外にも木を並べ、横を流れる景色を増やす（スピード感）
  const spots: { p: THREE.Vector3; k: number }[] = [];
  // 木の量はコースごと（森の中のスパは多く、市街地は少なく）
  const density = def.trees?.density ?? 1;
  const maxTrees = Math.round(400 * density);
  for (let tries = 0; tries < 30000 * Math.max(1, density) && spots.length < maxTrees; tries++) {
    const x = Math.floor(bounds.minX + 3 + rand() * (bounds.maxX - bounds.minX - 6)) + 0.5;
    const z = Math.floor(bounds.minZ + 3 + rand() * (bounds.maxZ - bounds.minZ - 6)) + 0.5;
    const { s, lateral } = track.project(x, z);
    const outside = lateral < -(half + 5);
    const nearStands =
      Math.abs(track.diff(s, def.stands.centerS)) < def.stands.length / 2 + 10 && lateral > -(def.stands.offset + 40);
    const infield = lateral > infieldMin;
    if (!((outside && !nearStands) || infield)) continue;
    // インフィールドを舗装したコースでは、舗装の上には木を植えない
    if (def.infield && track.insideLoop(x, z)) continue;
    if (spots.some(({ p }) => Math.abs(p.x - x) < 5 && Math.abs(p.z - z) < 5)) continue;
    spots.push({ p: new THREE.Vector3(x, topAt(x, z), z), k: 1 + rand() * 0.8 });
  }

  const trunks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 4, 1), lambert(0x6b4a2b), spots.length);
  const leaves = new THREE.InstancedMesh(new THREE.BoxGeometry(4, 4, 4), lambert(def.trees?.color ?? 0x3f8f2f), spots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  spots.forEach(({ p, k }, i) => {
    trunks.setMatrixAt(i, m.compose(new THREE.Vector3(p.x, p.y + 2 * k, p.z), q, new THREE.Vector3(k, k, k)));
    leaves.setMatrixAt(i, m.compose(new THREE.Vector3(p.x, p.y + 5.5 * k, p.z), q, new THREE.Vector3(k, k, k)));
  });
  for (const mesh of [trunks, leaves]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  const g = new THREE.Group();
  g.add(trunks, leaves);
  return g;
}

export function buildStructures(
  track: CourseTrack,
  topAt: TopAt,
  bounds: WorldBounds,
  teams: readonly ConstructorData[],
): { group: THREE.Group; garages: GarageRow } {
  const g = new THREE.Group();
  const garages = buildGarages(track, topAt, teams);
  g.add(
    buildStands(track, topAt),
    garages.group,
    buildFinishPost(track, topAt),
    buildTrees(track, topAt, bounds),
  );
  return { group: g, garages: garages.row };
}
