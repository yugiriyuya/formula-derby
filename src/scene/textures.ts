import * as THREE from 'three';

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
  return tex;
}

function noiseFill(
  ctx: CanvasRenderingContext2D,
  rand: () => number,
  base: [number, number, number],
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

export function createBlockTextures() {
  const grassTop = pixelTexture((ctx, r) => noiseFill(ctx, r, [95, 159, 53], 40), 3);
  const dirt = pixelTexture((ctx, r) => noiseFill(ctx, r, [134, 96, 67], 35), 7);
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
  return { grassTop, grassSide, dirt };
}
