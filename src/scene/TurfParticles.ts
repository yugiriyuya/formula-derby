import * as THREE from 'three';

/** 一度に出せるパーティクルの最大数 */
const MAX = 900;
/** 重力（ブロック/秒²。1 ブロック = 1.25m） */
const GRAVITY = 9.8 / 1.25;
/** 荒れ度がこれより低い芝ではパーティクルを出さない */
const MIN_WEAR = 0.06;

const DIRT_COLORS = [new THREE.Color(0x7a5a36), new THREE.Color(0x5e4329), new THREE.Color(0x8a6a44)];
const GRASS_COLOR = new THREE.Color(0x4f8f2f);
const DUST_COLOR = new THREE.Color(0xc2a77c);

/**
 * 荒れた芝を走る馬の蹄から舞う土煙・芝片（ブロック調の小さな立方体）。
 *  - 芝片・土くれ：小さく速く、放物線を描いて落ちる
 *  - 土煙：大きめで淡い色、ふわっと浮いて消える
 * 荒れ度と速さに応じて量が増える（＝グリップが落ちて減速しているのが見てわかる）。
 */
/** ダートの砂（蹴り上げる砂粒と、舞う砂ぼこり） */
const SAND_COLORS = [new THREE.Color(0xb48a5a), new THREE.Color(0x9a7046), new THREE.Color(0xc9a272)];
const SAND_DUST = new THREE.Color(0xd8bf98);

export class TurfParticles {
  readonly mesh: THREE.InstancedMesh;
  private readonly pos = new Float32Array(MAX * 3);
  private readonly vel = new Float32Array(MAX * 3);
  private readonly life = new Float32Array(MAX);
  private readonly maxLife = new Float32Array(MAX);
  private readonly size = new Float32Array(MAX);
  private readonly gravity = new Float32Array(MAX);
  /** 地面の高さ（坂の上でも地面で止まるように） */
  private readonly floor = new Float32Array(MAX);
  private next = 0;
  /** ダートコース：砂を蹴り上げる */
  dirt = false;
  /** 馬ごとの「出しそびれた端数」（1 フレームに 1 個未満の時に貯めておく） */
  private readonly carry = new Map<object, number>();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();

  constructor() {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < MAX; i++) {
      this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
      this.mesh.setColorAt(i, DUST_COLOR);
    }
  }

  /**
   * 1 頭ぶんの蹄跡から出す。
   * @param key 馬ごとに同じオブジェクト（端数の持ち越し用）
   * @param at 馬の足元（ワールド座標）
   * @param dir 進行方向（水平, 正規化済み）
   * @param speed 速度 m/s
   * @param wear 足元の荒れ度 0〜1
   */
  emit(key: object, at: THREE.Vector3, dir: THREE.Vector3, speed: number, wear: number, dt: number) {
    // ダートはきれいな馬場でも蹄が砂を蹴り上げる（芝より多く、砂色だけ）
    if (this.dirt) wear = Math.max(wear, 0.45);
    if (wear < MIN_WEAR || speed < 6) {
      this.carry.set(key, 0);
      return;
    }
    // 1 秒あたりの数：荒れ度と速さに比例（荒れ度 0.5・70km/h で 1 頭あたり約 25 個/秒）
    const rate = (wear - MIN_WEAR + 0.05) * speed * 2.6;
    let n = (this.carry.get(key) ?? 0) + rate * dt;
    const count = Math.floor(n);
    n -= count;
    this.carry.set(key, n);
    const right = this.v.set(-dir.z, 0, dir.x);
    const rx = right.x;
    const rz = right.z;
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      const dust = Math.random() < 0.3;
      // 後ろ脚のあたり（馬の中心から 0.5〜0.8 ブロック後ろ、左右の脚）から
      const back = 0.5 + Math.random() * 0.3;
      const side = (Math.random() - 0.5) * 0.45;
      this.pos[i * 3] = at.x - dir.x * back + rx * side;
      this.pos[i * 3 + 1] = at.y + 0.08;
      this.floor[i] = at.y + 0.02;
      this.pos[i * 3 + 2] = at.z - dir.z * back + rz * side;
      // 蹴り上げ：後ろ向き＋上向き、少し左右にばらける（ブロック/秒）
      const kick = dust ? 0.6 + Math.random() * 1.0 : 1.5 + Math.random() * 2.2;
      const up = dust ? 0.8 + Math.random() * 0.8 : 2.2 + Math.random() * 2.2;
      const spread = (Math.random() - 0.5) * (dust ? 1.2 : 1.8);
      this.vel[i * 3] = -dir.x * kick + rx * spread;
      this.vel[i * 3 + 1] = up;
      this.vel[i * 3 + 2] = -dir.z * kick + rz * spread;
      this.maxLife[i] = this.life[i] = dust ? 0.7 + Math.random() * 0.5 : 0.45 + Math.random() * 0.35;
      this.size[i] = dust ? 0.22 + Math.random() * 0.16 : 0.08 + Math.random() * 0.07;
      this.gravity[i] = dust ? GRAVITY * 0.12 : GRAVITY;
      // 荒れているほど土くれが多く、まだ浅い荒れなら芝片が多い
      const color = this.dirt
        ? dust
          ? SAND_DUST
          : SAND_COLORS[(Math.random() * 3) | 0]
        : dust
          ? DUST_COLOR
          : Math.random() < 0.3 + wear * 0.6
            ? DIRT_COLORS[(Math.random() * 3) | 0]
            : GRASS_COLOR;
      this.mesh.setColorAt(i, color);
    }
    if (count > 0 && this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number) {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
        continue;
      }
      this.vel[i * 3 + 1] -= this.gravity[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] = Math.max(this.floor[i], this.pos[i * 3 + 1] + this.vel[i * 3 + 1] * dt);
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      // 消える前に小さくなる
      const t = this.life[i] / this.maxLife[i];
      const sc = this.size[i] * (0.35 + 0.65 * t);
      this.v.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
      this.mesh.setMatrixAt(i, this.m.compose(this.v, this.q, this.s.set(sc, sc, sc)));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** レースのやり直し：全部消す */
  clear() {
    this.life.fill(0);
    for (let i = 0; i < MAX; i++) this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
    this.mesh.instanceMatrix.needsUpdate = true;
    this.carry.clear();
  }
}
