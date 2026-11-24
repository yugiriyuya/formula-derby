import * as THREE from 'three';
import type { CourseTrack } from '../course/CourseTrack';
import { createBlockTextures } from './textures';
import { TurfSurface, type TurfCell } from './turfSurface';

export enum Block {
  Grass,
  TurfA,
  TurfB,
  Finish,
  Stone,
  /** インフィールドの舗装（スタンド前やピットの石畳より明るいグレー） */
  Concrete,
}

export interface WorldBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface CourseWorld {
  group: THREE.Group;
  /** (x, z) の地面の上面の高さ */
  topAt(x: number, z: number): number;
  /** 芝コースの上面（荒れ具合で色が変わる） */
  turf: TurfSurface;
}

/** 外周の断面を見せる深さ */
const BASE_DEPTH = -3;
/** 芝の刈り込み模様：進行方向の縞の間隔と、幅方向の帯の幅（ブロック）、暗い縞の明るさ */
const STRIPE_LENGTH = 3;
const BAND_WIDTH = 9;
const TURF_B_SHADE = 0.84;

/** 見えている面だけを 1 つのジオメトリに集める */
class FaceBuilder {
  private readonly pos: number[] = [];
  private readonly nor: number[] = [];
  private readonly uv: number[] = [];
  private readonly idx: number[] = [];

  /** a→b→c→d の順（法線方向から見て反時計回り）で四角形を追加 */
  quad(p: number[][], n: number[], uvs: number[][]) {
    const base = this.pos.length / 3;
    for (let i = 0; i < 4; i++) {
      this.pos.push(...p[i]);
      this.nor.push(...n);
      this.uv.push(...uvs[i]);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  build(material: THREE.Material): THREE.Mesh | null {
    if (this.idx.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, material);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    return mesh;
  }
}

/**
 * コース定義を 1x1 のブロックに変換して描画する。
 * ブロックの上面は y = height（0.5 刻み）。描画は見えている面だけをまとめた 1 メッシュ／マテリアル。
 *  - 上面：同じ種類・高さで x 方向に並ぶブロックを 1 枚にまとめる
 *  - 側面：隣より高い所だけ（上 1 段は草の側面、その下は土）
 */
export function buildCourseWorld(track: CourseTrack, bounds: WorldBounds): CourseWorld {
  const def = track.def;
  const half = def.trackWidth / 2;
  const pit = def.pitLane;
  const stands = def.stands;

  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  const heights = new Float32Array(width * depth);
  const types = new Uint8Array(width * depth);

  // 平らに盛る範囲：コースの幅に加えて、内側はピットレーンと厩舎の奥まで、外側はスタンドの奥まで
  // （坂の上にピット・スタンドがあるコースでも、建物が法面に浮かないように）
  const pitFlat = pit.lateral + pit.width / 2 + 10;
  const standsFlat = stands.offset + 32;
  const heightOf = (s: number, lateral: number) => {
    const a = Math.abs(lateral);
    let flat = half + 1;
    if (lateral > 0 && track.pitLateralAt(s) !== null) flat = Math.max(flat, Math.min(pitFlat, track.pitLateralAt(s)! + pit.width / 2 + 10));
    if (lateral < 0 && Math.abs(track.diff(s, stands.centerS)) <= stands.length / 2 + 4) flat = Math.max(flat, standsFlat);
    const k = a <= flat ? 1 : Math.max(0, 1 - (a - flat) / def.embankment);
    // ハーフブロック（0.5）刻みにして坂の段差をなめらかにする
    return Math.round(track.elevationAt(s) * k * 2) / 2;
  };

  const classify = (s: number, lat: number, x: number, z: number): Block => {
    if (Math.abs(lat) <= half) {
      if (Math.abs(track.diff(s, def.finishS)) < 0.5) return Block.Finish;
      // ダート：ハローをかけた筋（幅方向に細い明暗）。芝：進行方向の縞 × 幅方向の帯 = 市松模様の刈り込み
      if (def.surface === 'dirt') return Math.floor((lat + half) / 2) % 2 === 0 ? Block.TurfA : Block.TurfB;
      const stripe = Math.floor(s / STRIPE_LENGTH) + Math.floor((lat + half) / BAND_WIDTH);
      return stripe % 2 === 0 ? Block.TurfA : Block.TurfB;
    }
    const pitLat = track.pitLateralAt(s);
    if (pitLat !== null && lat > half && Math.abs(lat - pitLat) <= pit.width / 2) return Block.Stone;
    // インフィールドをグレーの舗装にするコース（芝の走路のすぐ脇は草の縁を残す）
    if (def.infield && Math.abs(lat) > half + def.infield.verge && track.insideLoop(x, z)) return Block.Concrete;
    if (lat < -half && lat >= -stands.offset && Math.abs(track.diff(s, stands.centerS)) <= stands.length / 2) {
      return Block.Stone; // スタンド前のエプロン
    }
    return Block.Grass;
  };

  for (let iz = 0; iz < depth; iz++) {
    for (let ix = 0; ix < width; ix++) {
      const { s, lateral } = track.project(bounds.minX + ix + 0.5, bounds.minZ + iz + 0.5);
      const i = iz * width + ix;
      heights[i] = heightOf(s, lateral);
      types[i] = classify(s, lateral, bounds.minX + ix + 0.5, bounds.minZ + iz + 0.5);
    }
  }

  const heightAtCell = (ix: number, iz: number) =>
    ix < 0 || iz < 0 || ix >= width || iz >= depth ? BASE_DEPTH : heights[iz * width + ix];

  // --- マテリアル ---
  const tex = createBlockTextures();
  const mat = (map: THREE.Texture) => new THREE.MeshLambertMaterial({ map });
  const m = {
    grassTop: mat(tex.grassTop),
    white: mat(tex.white),
    stone: mat(tex.stone),
    concrete: new THREE.MeshLambertMaterial({ map: tex.stone, color: 0xd4d6d8 }),
    grassSide: mat(tex.grassSide),
    dirt: mat(tex.dirt),
  };
  const topMat: Record<Block, THREE.Material> = {
    [Block.Grass]: m.grassTop,
    [Block.TurfA]: m.grassTop, // 芝コースは TurfSurface で描くので使わない
    [Block.TurfB]: m.grassTop,
    [Block.Finish]: m.white,
    [Block.Stone]: m.stone,
    [Block.Concrete]: m.concrete,
  };
  const sideMat = (b: Block) => (b === Block.Stone ? m.stone : b === Block.Concrete ? m.concrete : m.grassSide);

  const builders = new Map<THREE.Material, FaceBuilder>();
  const builder = (material: THREE.Material) => {
    let b = builders.get(material);
    if (!b) builders.set(material, (b = new FaceBuilder()));
    return b;
  };

  // --- 上面（x 方向に同じブロックが続く所は 1 枚にまとめる） ---
  // 芝コースのマスだけは荒れ具合で色が変わるので、まとめずに TurfSurface に渡す
  const turfCells: TurfCell[] = [];
  for (let iz = 0; iz < depth; iz++) {
    const z0 = bounds.minZ + iz;
    const z1 = z0 + 1;
    let ix = 0;
    while (ix < width) {
      const i = iz * width + ix;
      const t = types[i];
      const h = heights[i];
      if (t === Block.TurfA || t === Block.TurfB) {
        turfCells.push({ ix, iz, height: h, shade: t === Block.TurfA ? 1 : def.surface === 'dirt' ? 0.93 : TURF_B_SHADE });
        ix++;
        continue;
      }
      let end = ix + 1;
      while (end < width && types[iz * width + end] === t && heights[iz * width + end] === h) end++;
      const x0 = bounds.minX + ix;
      const x1 = bounds.minX + end;
      const len = end - ix;
      builder(topMat[t as Block]).quad(
        [[x0, h, z0], [x0, h, z1], [x1, h, z1], [x1, h, z0]],
        [0, 1, 0],
        [[0, 0], [0, 1], [len, 1], [len, 0]],
      );
      ix = end;
    }
  }

  // --- 側面（隣より高い部分だけ） ---
  const sides: { dx: number; dz: number; n: number[] }[] = [
    { dx: 1, dz: 0, n: [1, 0, 0] },
    { dx: -1, dz: 0, n: [-1, 0, 0] },
    { dx: 0, dz: 1, n: [0, 0, 1] },
    { dx: 0, dz: -1, n: [0, 0, -1] },
  ];
  const sideQuad = (b: FaceBuilder, x0: number, z0: number, dir: (typeof sides)[number], y0: number, y1: number, v0: number, v1: number) => {
    const x1 = x0 + 1;
    const z1 = z0 + 1;
    const uv = [[0, v0], [0, v1], [1, v1], [1, v0]];
    let p: number[][];
    if (dir.dx === 1) p = [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]];
    else if (dir.dx === -1) p = [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]];
    else if (dir.dz === 1) p = [[x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1]];
    else p = [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]];
    b.quad(p, dir.n, uv);
  };

  for (let iz = 0; iz < depth; iz++) {
    for (let ix = 0; ix < width; ix++) {
      const h = heights[iz * width + ix];
      const t = types[iz * width + ix] as Block;
      const x0 = bounds.minX + ix;
      const z0 = bounds.minZ + iz;
      for (const dir of sides) {
        const hn = heightAtCell(ix + dir.dx, iz + dir.dz);
        if (hn >= h) continue;
        // 上 1 段ぶんはブロック自身の側面（草なら緑の縁が見える）
        const topFrom = Math.max(hn, h - 1);
        sideQuad(builder(sideMat(t)), x0, z0, dir, topFrom, h, topFrom - (h - 1), 1);
        // それより下は土
        if (hn < h - 1) sideQuad(builder(m.dirt), x0, z0, dir, hn, h - 1, hn, h - 1);
      }
    }
  }

  const group = new THREE.Group();
  for (const [material, b] of builders) {
    const mesh = b.build(material);
    if (mesh) group.add(mesh);
  }
  const turf = new TurfSurface(turfCells, bounds, def.surface === 'dirt' ? tex.sand : tex.turfA, def.surface === 'dirt');
  group.add(turf.mesh);

  return {
    group,
    turf,
    topAt(x, z) {
      return heightAtCell(Math.floor(x - bounds.minX), Math.floor(z - bounds.minZ));
    },
  };
}
