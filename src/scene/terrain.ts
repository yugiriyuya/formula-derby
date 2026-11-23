import * as THREE from 'three';
import { createBlockTextures } from './textures';

export interface TerrainOptions {
  /** 一辺のブロック数 */
  size: number;
  /** 最大の起伏（ブロック数） */
  maxHeight: number;
}

/** 決定的な簡易ノイズ（なだらかな起伏用） */
function heightAt(x: number, z: number, maxHeight: number): number {
  const h = Math.sin(x * 0.08) * Math.cos(z * 0.07) * 0.6 + Math.sin((x + z) * 0.035) * 0.4;
  return Math.max(0, Math.round(((h + 1) / 2) * maxHeight - maxHeight * 0.35));
}

/**
 * マイクラ風ブロック地面。InstancedMesh で描画コールを抑える。
 * 表層 = 草ブロック、段差の側面 = 土ブロック。
 */
export function createTerrain({ size, maxHeight }: TerrainOptions): THREE.Group {
  const group = new THREE.Group();
  const { grassTop, grassSide, dirt } = createBlockTextures();
  const geom = new THREE.BoxGeometry(1, 1, 1);

  // BoxGeometry の面順: +x, -x, +y, -y, +z, -z
  const sideMat = new THREE.MeshLambertMaterial({ map: grassSide });
  const grassMats = [
    sideMat,
    sideMat,
    new THREE.MeshLambertMaterial({ map: grassTop }),
    new THREE.MeshLambertMaterial({ map: dirt }),
    sideMat,
    sideMat,
  ];
  const dirtMat = new THREE.MeshLambertMaterial({ map: dirt });

  const half = size / 2;
  const grassPositions: THREE.Vector3[] = [];
  const dirtPositions: THREE.Vector3[] = [];

  for (let ix = 0; ix < size; ix++) {
    for (let iz = 0; iz < size; iz++) {
      const x = ix - half + 0.5;
      const z = iz - half + 0.5;
      const h = heightAt(ix, iz, maxHeight);
      grassPositions.push(new THREE.Vector3(x, h + 0.5, z));
      // 隣より高い分だけ土を積む（見える部分のみ）。外周は 1 段下まで埋める。
      const minNeighbor = Math.min(
        heightAt(ix + 1, iz, maxHeight),
        heightAt(ix - 1, iz, maxHeight),
        heightAt(ix, iz + 1, maxHeight),
        heightAt(ix, iz - 1, maxHeight),
      );
      for (let y = Math.min(minNeighbor, h - 1); y < h; y++) {
        dirtPositions.push(new THREE.Vector3(x, y + 0.5, z));
      }
    }
  }

  const build = (positions: THREE.Vector3[], material: THREE.Material | THREE.Material[]) => {
    const mesh = new THREE.InstancedMesh(geom, material, positions.length);
    const m = new THREE.Matrix4();
    positions.forEach((p, i) => {
      m.makeTranslation(p.x, p.y, p.z);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };

  group.add(build(grassPositions, grassMats));
  if (dirtPositions.length > 0) group.add(build(dirtPositions, dirtMat));
  return group;
}
