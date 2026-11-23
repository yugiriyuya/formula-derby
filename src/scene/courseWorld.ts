import * as THREE from 'three';
import type { CourseTrack } from '../course/CourseTrack';
import { createBlockTextures } from './textures';

export enum Block {
  Grass,
  TurfA,
  TurfB,
  Finish,
  Dirt,
  Stone,
}
const BLOCK_COUNT = 6;

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
}

/** 外周の断面を見せる深さ */
const BASE_DEPTH = -3;

/**
 * コース定義を 1x1 のブロックに変換し、InstancedMesh で描画する。
 * ブロック i の上面は y = height（0.5 刻み）、下面は y = height - 1。
 */
export function buildCourseWorld(track: CourseTrack, bounds: WorldBounds): CourseWorld {
  const def = track.def;
  const half = def.trackWidth / 2;
  const pit = def.pitLane;
  const dirt = def.dirtCourse;
  const stands = def.stands;

  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  const heights = new Float32Array(width * depth);
  const types = new Uint8Array(width * depth);

  const heightOf = (s: number, lateral: number) => {
    const a = Math.abs(lateral);
    const flat = half + 1;
    const k = a <= flat ? 1 : Math.max(0, 1 - (a - flat) / def.embankment);
    // ハーフブロック（0.5）刻みにして坂の段差をなめらかにする
    return Math.round(track.elevationAt(s) * k * 2) / 2;
  };

  const classify = (s: number, lat: number): Block => {
    if (Math.abs(lat) <= half) {
      if (Math.abs(track.diff(s, def.finishS)) < 0.5) return Block.Finish;
      return Math.floor(s / 4) % 2 === 0 ? Block.TurfA : Block.TurfB;
    }
    const pitLat = track.pitLateralAt(s);
    if (pitLat !== null && lat > half && Math.abs(lat - pitLat) <= pit.width / 2) return Block.Stone;
    if (Math.abs(lat - dirt.lateral) <= dirt.width / 2) return Block.Dirt;
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
      types[i] = classify(s, lateral);
    }
  }

  const heightAtCell = (ix: number, iz: number) =>
    ix < 0 || iz < 0 || ix >= width || iz >= depth ? BASE_DEPTH : heights[iz * width + ix];

  // --- インスタンス配置 ---
  const tops: number[][] = Array.from({ length: BLOCK_COUNT }, () => []);
  const fill: number[] = [];
  for (let iz = 0; iz < depth; iz++) {
    for (let ix = 0; ix < width; ix++) {
      const h = heights[iz * width + ix];
      const x = bounds.minX + ix + 0.5;
      const z = bounds.minZ + iz + 0.5;
      tops[types[iz * width + ix]].push(x, h - 0.5, z);
      // 隣より高い部分（見える側面）だけ土ブロックで埋める。
      // 上面ブロックは [h-1, h]、その下に [y-1, y] を隣の上面に届くまで積む
      const minN = Math.min(
        heightAtCell(ix + 1, iz),
        heightAtCell(ix - 1, iz),
        heightAtCell(ix, iz + 1),
        heightAtCell(ix, iz - 1),
      );
      for (let y = h - 1; y > minN; y -= 1) fill.push(x, y - 0.5, z);
    }
  }

  // --- マテリアル ---
  const tex = createBlockTextures();
  const mat = (map: THREE.Texture) => new THREE.MeshLambertMaterial({ map });
  const grassSide = mat(tex.grassSide);
  const dirtMat = mat(tex.dirt);
  // BoxGeometry の面順: +x, -x, +y, -y, +z, -z
  const topped = (top: THREE.Material, side: THREE.Material) => [side, side, top, dirtMat, side, side];
  const sandMat = mat(tex.sand);
  const stoneMat = mat(tex.stone);
  const materials: Record<Block, THREE.Material | THREE.Material[]> = {
    [Block.Grass]: topped(mat(tex.grassTop), grassSide),
    [Block.TurfA]: topped(mat(tex.turfA), grassSide),
    [Block.TurfB]: topped(mat(tex.turfB), grassSide),
    [Block.Finish]: topped(mat(tex.white), grassSide),
    [Block.Dirt]: sandMat,
    [Block.Stone]: stoneMat,
  };

  const geom = new THREE.BoxGeometry(1, 1, 1);
  const group = new THREE.Group();
  const build = (flat: number[], material: THREE.Material | THREE.Material[]) => {
    const count = flat.length / 3;
    if (count === 0) return;
    const mesh = new THREE.InstancedMesh(geom, material, count);
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      m.makeTranslation(flat[i * 3], flat[i * 3 + 1], flat[i * 3 + 2]);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  for (let b = 0; b < BLOCK_COUNT; b++) build(tops[b], materials[b as Block]);
  build(fill, dirtMat);

  return {
    group,
    topAt(x, z) {
      return heightAtCell(Math.floor(x - bounds.minX), Math.floor(z - bounds.minZ));
    },
  };
}
