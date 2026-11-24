import * as THREE from 'three';

type RGB = [number, number, number];

/** 16x16 のピクセルアート風テクスチャを Canvas で生成する（外部画像なしで完結）。 */
function pixelTexture(
  draw: (ctx: CanvasRenderingContext2D, rand: () => number) => void,
  seed = 1,
): THREE.CanvasTexture {
  const size = 16;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  draw(ctx, rand);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  // 地面は複数ブロックを 1 枚の面にまとめるので、UV 1 ごとに繰り返す
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function noiseFill(
  ctx: CanvasRenderingContext2D,
  rand: () => number,
  base: RGB,
  variance: number,
  y0 = 0,
  y1 = 16,
) {
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < 16; x++) {
      const v = (rand() - 0.5) * variance;
      ctx.fillStyle = `rgb(${base[0] + v},${base[1] + v},${base[2] + v})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

const noise = (base: RGB, variance: number, seed: number) =>
  pixelTexture((ctx, r) => noiseFill(ctx, r, base, variance), seed);

export function createBlockTextures() {
  const grassSide = pixelTexture((ctx, r) => {
    noiseFill(ctx, r, [134, 96, 67], 35);
    noiseFill(ctx, r, [95, 159, 53], 40, 0, 3);
    // 側面に垂れ下がる草
    for (let x = 0; x < 16; x++) {
      if (r() > 0.5) {
        ctx.fillStyle = 'rgb(85,145,48)';
        ctx.fillRect(x, 3, 1, 1 + Math.floor(r() * 2));
      }
    }
  }, 11);

  return {
    grassTop: noise([95, 159, 53], 40, 3),
    grassSide,
    dirt: noise([134, 96, 67], 35, 7),
    // ダートコースの砂（明るい砂色。荒れ・湿りは turfSurface のシェーダーで濃くする）
    sand: noise([176, 138, 96], 22, 29),
    // 芝コース（刈り込みの縞の明暗と荒れによる色の変化は turfSurface のシェーダーで付ける）
    turfA: noise([104, 190, 64], 18, 13),
    stone: noise([150, 150, 150], 30, 23),
    white: noise([238, 238, 238], 10, 29),
  };
}
