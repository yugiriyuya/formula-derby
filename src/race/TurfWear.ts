/** ワールドのブロック格子の範囲（scene/courseWorld の WorldBounds と同じ形） */
export interface GridBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * 馬場の荒れ度（0 = きれいな芝 〜 1 = 土が見えるほど荒れた）。ブロック 1 マスごとに持つ。
 * 描画とは独立したデータで、レース（速度の低下・AI の進路取り）と画面（芝の色）の両方から使う。
 */
export class TurfWear {
  readonly width: number;
  readonly depth: number;
  readonly data: Float32Array;
  /** 前回 consumeDirty() してから荒れ度が変わったマス */
  private dirty: number[] = [];
  /** reset() されたら true（描画側で全マスを描き直す） */
  private resetFlag = true;

  constructor(readonly bounds: GridBounds) {
    this.width = bounds.maxX - bounds.minX;
    this.depth = bounds.maxZ - bounds.minZ;
    this.data = new Float32Array(this.width * this.depth);
  }

  /** ワールド座標 (x, z) のマス番号。範囲外なら -1 */
  index(x: number, z: number): number {
    const ix = Math.floor(x - this.bounds.minX);
    const iz = Math.floor(z - this.bounds.minZ);
    if (ix < 0 || iz < 0 || ix >= this.width || iz >= this.depth) return -1;
    return iz * this.width + ix;
  }

  at(x: number, z: number): number {
    const i = this.index(x, z);
    return i < 0 ? 0 : this.data[i];
  }

  add(i: number, amount: number) {
    if (i < 0) return;
    const before = this.data[i];
    if (before >= 1) return;
    this.data[i] = Math.min(1, before + amount);
    this.dirty.push(i);
  }

  /** レースのやり直し：すべてきれいな芝に戻す */
  reset() {
    this.data.fill(0);
    this.dirty = [];
    this.resetFlag = true;
  }

  /** 描画側が呼ぶ：変わったマスの一覧（reset 直後は null = 全部描き直す） */
  consumeDirty(): number[] | null {
    if (this.resetFlag) {
      this.resetFlag = false;
      this.dirty = [];
      return null;
    }
    const d = this.dirty;
    this.dirty = [];
    return d;
  }
}
