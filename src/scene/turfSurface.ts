import * as THREE from 'three';
import type { TurfWear } from '../race/TurfWear';
import type { WorldBounds } from './courseWorld';

/** 芝の 1 マス（上面の左下の角と高さ、刈り込み模様の濃さ） */
export interface TurfCell {
  ix: number;
  iz: number;
  height: number;
  /** 1 = 明るい縞, 0.85 前後 = 暗い縞 */
  shade: number;
}

/**
 * 芝コースの上面。マスごとに「荒れ度」を頂点属性で持ち、シェーダーで色を変える。
 *   荒れ度 0   → 鮮やかな緑（刈り込みの縞模様）
 *   荒れ度 0.5 → 黄土色がかった緑
 *   荒れ度 1   → 土色
 * 地面の他の部分（まとめて描く）とは別のメッシュにして、荒れたマスだけ書き換える。
 */
export class TurfSurface {
  readonly mesh: THREE.Mesh;
  private readonly wearAttr: THREE.BufferAttribute;
  /** ワールドのマス番号 → このメッシュでの先頭の頂点番号（芝でないマスは -1） */
  private readonly vertexOf: Int32Array;

  constructor(cells: TurfCell[], bounds: WorldBounds, texture: THREE.Texture) {
    const width = bounds.maxX - bounds.minX;
    const depth = bounds.maxZ - bounds.minZ;
    this.vertexOf = new Int32Array(width * depth).fill(-1);

    const n = cells.length;
    const pos = new Float32Array(n * 12);
    const uv = new Float32Array(n * 8);
    const nor = new Float32Array(n * 12);
    const shade = new Float32Array(n * 4);
    const wear = new Float32Array(n * 4);
    const idx = new Uint32Array(n * 6);
    cells.forEach((c, k) => {
      const x0 = bounds.minX + c.ix;
      const z0 = bounds.minZ + c.iz;
      const h = c.height;
      // 上から見て反時計回り（法線 +y）
      pos.set([x0, h, z0, x0, h, z0 + 1, x0 + 1, h, z0 + 1, x0 + 1, h, z0], k * 12);
      uv.set([0, 0, 0, 1, 1, 1, 1, 0], k * 8);
      nor.set([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], k * 12);
      shade.fill(c.shade, k * 4, k * 4 + 4);
      const v = k * 4;
      idx.set([v, v + 1, v + 2, v, v + 2, v + 3], k * 6);
      this.vertexOf[c.iz * width + c.ix] = v;
    });

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('turfShade', new THREE.BufferAttribute(shade, 1));
    this.wearAttr = new THREE.BufferAttribute(wear, 1);
    this.wearAttr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('turfWear', this.wearAttr);
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();

    const material = new THREE.MeshLambertMaterial({ map: texture });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute float turfShade;\nattribute float turfWear;\nvarying float vTurfShade;\nvarying float vTurfWear;',
        )
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTurfShade = turfShade;\nvTurfWear = turfWear;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vTurfShade;\nvarying float vTurfWear;')
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          diffuseColor.rgb *= vTurfShade;
          {
            // テクスチャの明暗（細かな模様）は残したまま、緑 → 黄土色 → 土色へ
            float w = clamp(vTurfWear, 0.0, 1.0);
            float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
            vec3 worn = vec3(0.30, 0.26, 0.07) * (0.55 + 1.6 * lum);
            vec3 dirt = vec3(0.26, 0.14, 0.06) * (0.55 + 1.6 * lum);
            vec3 c = mix(diffuseColor.rgb, worn, smoothstep(0.02, 0.4, w));
            diffuseColor.rgb = mix(c, dirt, smoothstep(0.35, 0.9, w));
          }`,
        );
    };

    this.mesh = new THREE.Mesh(g, material);
    this.mesh.receiveShadow = true;
  }

  /** 荒れ度データの変化を色に反映する（毎フレーム呼んでよい。変わったマスだけ書き換える） */
  sync(wear: TurfWear) {
    const dirty = wear.consumeDirty();
    const arr = this.wearAttr.array as Float32Array;
    if (dirty === null) {
      // リセット直後：今の荒れ度を全マス写し直す（リセット後すぐに荒れた分も取りこぼさない）
      for (let i = 0; i < this.vertexOf.length; i++) {
        const v = this.vertexOf[i];
        if (v >= 0) arr.fill(wear.data[i], v, v + 4);
      }
      this.wearAttr.needsUpdate = true;
      return;
    }
    if (dirty.length === 0) return;
    for (const i of dirty) {
      const v = this.vertexOf[i];
      if (v < 0) continue;
      arr.fill(wear.data[i], v, v + 4);
    }
    this.wearAttr.needsUpdate = true;
  }
}
