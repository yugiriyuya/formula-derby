import * as THREE from 'three';
import type { CourseTrack } from '../course/CourseTrack';

function makeLabel(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const font = 'bold 44px system-ui, sans-serif';
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 40;
  canvas.width = w;
  canvas.height = 72;
  ctx.font = font;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, w, 72);
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 20, 38);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  // 距離に関係なく画面上で一定サイズ（近づいても巨大化しない）
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: false }),
  );
  const height = 0.032;
  sprite.scale.set((w / 72) * height, height, 1);
  sprite.renderOrder = 10;
  return sprite;
}

/** コース各所の名前（1コーナー、淀の坂、ピットなど）を浮かべる */
export function buildLabels(track: CourseTrack): THREE.Group {
  const g = new THREE.Group();
  for (const l of track.def.labels) {
    const sprite = makeLabel(l.text);
    const p = track.frameAt(l.s, l.lateral).position;
    sprite.position.set(p.x, p.y + l.height, p.z);
    g.add(sprite);
  }
  return g;
}
