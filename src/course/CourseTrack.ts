import * as THREE from 'three';
import type { CourseDefinition } from './types';

const STEP = 0.5;

export interface TrackFrame {
  position: THREE.Vector3;
  /** 進行方向（水平, 正規化済み） */
  dir: THREE.Vector3;
  /** 進行方向の右 = コース内側（水平, 正規化済み） */
  right: THREE.Vector3;
}

const smoothstep = (t: number) => t * t * (3 - 2 * t);

/**
 * コース定義から中心線をサンプリングし、s / lateral 座標とワールド座標を相互変換する。
 * 描画だけでなく、後でレースロジック（順位・周回・ピット判定）からも使う想定。
 */
export class CourseTrack {
  readonly def: CourseDefinition;
  readonly length: number;
  private readonly ss: number[] = [];
  private readonly xs: number[] = [];
  private readonly zs: number[] = [];
  private readonly dxs: number[] = [];
  private readonly dzs: number[] = [];

  constructor(def: CourseDefinition) {
    this.def = def;
    let x = def.start.x;
    let z = def.start.z;
    let phi = THREE.MathUtils.degToRad(def.start.headingDeg);
    let s = 0;
    const push = () => {
      this.ss.push(s);
      this.xs.push(x);
      this.zs.push(z);
      this.dxs.push(Math.cos(phi));
      this.dzs.push(Math.sin(phi));
    };
    push();

    for (const seg of def.segments) {
      const len =
        seg.type === 'straight' ? seg.length : seg.radius * THREE.MathUtils.degToRad(seg.angleDeg);
      const n = Math.max(1, Math.round(len / STEP));
      const ds = len / n;
      for (let i = 0; i < n; i++) {
        // phi を増やすと右旋回（x→z 平面で、右 = (-sinφ, cosφ)）
        const dphi = seg.type === 'arc' ? (ds / seg.radius) * (seg.turn === 'right' ? 1 : -1) : 0;
        x += Math.cos(phi + dphi / 2) * ds;
        z += Math.sin(phi + dphi / 2) * ds;
        phi += dphi;
        s += ds;
        push();
      }
    }

    this.length = s;
    const gap = Math.hypot(x - def.start.x, z - def.start.z);
    if (gap > 0.5) console.warn(`[CourseTrack] コースが閉じていません（誤差 ${gap.toFixed(2)}）`);
    // 最後の点は始点と同じなので捨てる
    for (const arr of [this.ss, this.xs, this.zs, this.dxs, this.dzs]) arr.pop();
  }

  /** s を [0, length) に正規化 */
  wrap(s: number): number {
    return ((s % this.length) + this.length) % this.length;
  }

  /** a - b を [-length/2, length/2) の範囲で返す（周回を考慮した差） */
  diff(a: number, b: number): number {
    let d = this.wrap(a - b);
    if (d >= this.length / 2) d -= this.length;
    return d;
  }

  /** 滑らかな標高（ブロック単位, 丸めなし）。走行ロジックはこちらを使う */
  elevationAt(s: number): number {
    const keys = this.def.elevation;
    s = this.wrap(s);
    if (s <= keys[0].s) return keys[0].h;
    for (let k = 0; k < keys.length - 1; k++) {
      const a = keys[k];
      const b = keys[k + 1];
      if (s <= b.s) return a.h + (b.h - a.h) * smoothstep((s - a.s) / (b.s - a.s));
    }
    return keys[keys.length - 1].h;
  }

  private indexAt(s: number): { i: number; t: number } {
    s = this.wrap(s);
    let lo = 0;
    let hi = this.ss.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.ss[mid] <= s) lo = mid;
      else hi = mid - 1;
    }
    const next = lo + 1 < this.ss.length ? this.ss[lo + 1] : this.length;
    return { i: lo, t: (s - this.ss[lo]) / (next - this.ss[lo]) };
  }

  /** s, lateral 地点のワールド座標と向き。y は滑らかな標高 */
  frameAt(s: number, lateral = 0): TrackFrame {
    const { i, t } = this.indexAt(s);
    const j = (i + 1) % this.ss.length;
    const x = this.xs[i] + (this.xs[j] - this.xs[i]) * t;
    const z = this.zs[i] + (this.zs[j] - this.zs[i]) * t;
    const dir = new THREE.Vector3(
      this.dxs[i] + (this.dxs[j] - this.dxs[i]) * t,
      0,
      this.dzs[i] + (this.dzs[j] - this.dzs[i]) * t,
    ).normalize();
    const right = new THREE.Vector3(-dir.z, 0, dir.x);
    const position = new THREE.Vector3(x, this.elevationAt(s), z).addScaledVector(right, lateral);
    return { position, dir, right };
  }

  /** ワールド座標 (x, z) を最寄りの s / lateral に変換 */
  project(x: number, z: number): { s: number; lateral: number } {
    const n = this.ss.length;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < n; i += 4) {
      const d = (x - this.xs[i]) ** 2 + (z - this.zs[i]) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const coarse = best;
    for (let k = -8; k <= 8; k++) {
      const i = (coarse + k + n) % n;
      const d = (x - this.xs[i]) ** 2 + (z - this.zs[i]) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const ox = x - this.xs[best];
    const oz = z - this.zs[best];
    const dx = this.dxs[best];
    const dz = this.dzs[best];
    return { s: this.wrap(this.ss[best] + ox * dx + oz * dz), lateral: ox * -dz + oz * dx };
  }

  /** s 地点でのピットレーン中心の lateral。ピット区間外なら null */
  pitLateralAt(s: number): number | null {
    const p = this.def.pitLane;
    s = this.wrap(s);
    if (s < p.entryStart || s > p.exitEnd) return null;
    if (s < p.entryEnd) {
      const t = smoothstep((s - p.entryStart) / (p.entryEnd - p.entryStart));
      return p.mergeLateral + (p.lateral - p.mergeLateral) * t;
    }
    if (s > p.exitStart) {
      const t = smoothstep((s - p.exitStart) / (p.exitEnd - p.exitStart));
      return p.lateral + (p.mergeLateral - p.lateral) * t;
    }
    return p.lateral;
  }
}
