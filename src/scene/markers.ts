import * as THREE from 'three';
import type { CourseTrack } from '../course/CourseTrack';

type TopAt = (x: number, z: number) => number;

/** ハロン棒の間隔（m）と、その間に立てる小さな距離標の間隔（m） */
const FURLONG = 200;
const SMALL_MARKER = 50;

const lambert = (color: number) => new THREE.MeshLambertMaterial({ color });

/** 残り距離（百 m 単位）を書いた札のテクスチャ */
function numberTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = '#d83a3a';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 58, 58);
  ctx.fillStyle = '#111';
  ctx.font = 'bold 44px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 32, 35);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

/**
 * 距離標識。横を流れていく目印を増やしてスピード感を出す。
 *  - ハロン棒（200m ごと）：紅白の高い柱＋ゴールまでの残り距離の札（例「4」= 残り 400m）
 *  - 小さな距離標（50m ごと）：緑白の低い柱
 * 内ラチの外側に立てる。ピットレーンにかかる所だけ外ラチ側に立てる。
 */
export function buildDistanceMarkers(track: CourseTrack, topAt: TopAt): THREE.Group {
  const def = track.def;
  const mpb = def.metersPerBlock;
  const half = def.trackWidth / 2;
  const pit = def.pitLane;
  const group = new THREE.Group();

  const red = lambert(0xd83a3a);
  const white = lambert(0xf4f4f4);
  const green = lambert(0x1f8f4f);
  const box = (w: number, h: number, d: number, m: THREE.Material | THREE.Material[]) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.castShadow = true;
    return mesh;
  };

  const lapMeters = track.length * mpb;
  for (let remain = SMALL_MARKER; remain < lapMeters - 1; remain += SMALL_MARKER) {
    const s = track.wrap(def.finishS - remain / mpb);
    const isFurlong = remain % FURLONG === 0;

    // ピットレーンと重なる所は外ラチ側へ
    const inner = half + 1.4;
    const p = track.pitLateralAt(s);
    const blocked = p !== null && Math.abs(inner - p) < pit.width / 2 + 1.5;
    const lateral = blocked ? -(half + 1.4) : inner;

    const frame = track.frameAt(s, lateral);
    const g = new THREE.Group();
    g.position.set(frame.position.x, topAt(frame.position.x, frame.position.z), frame.position.z);
    g.rotation.y = Math.atan2(-frame.dir.z, frame.dir.x); // ローカル +x = 進行方向

    if (isFurlong) {
      // 紅白の柱（0.8 ブロック = 1m ごとに色を替える）
      for (let k = 0; k < 5; k++) {
        const seg = box(0.32, 0.8, 0.32, k % 2 === 0 ? red : white);
        seg.position.y = 0.4 + k * 0.8;
        g.add(seg);
      }
      // 札は走ってくる馬の方（ローカル -x）とその裏に数字を出す
      const num = new THREE.MeshLambertMaterial({ map: numberTexture(String(remain / 100)) });
      const plate = box(0.12, 1.3, 1.3, [num, num, white, white, white, white]);
      plate.position.y = 4.6;
      g.add(plate);
    } else {
      const post = box(0.22, 1.6, 0.22, white);
      post.position.y = 0.8;
      g.add(post);
      const cap = box(0.3, 0.5, 0.3, green);
      cap.position.y = 1.85;
      g.add(cap);
    }
    group.add(g);
  }
  return group;
}
