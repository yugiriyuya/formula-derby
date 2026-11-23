import * as THREE from 'three';
import type { CourseTrack } from '../course/CourseTrack';
import { GATE_STALL_LENGTH, type GateSlot, type Race } from '../race/Race';

type TopAt = (x: number, z: number) => number;

/** 上部の梁の高さ。騎手の目線（約 2.35）より十分上にして、騎手視点で枠が視界にかからないようにする */
const STALL_HEIGHT = 3.4;
const DOOR_HEIGHT = 1.6;
/** 扉が開ききるまでの時間（秒）と、開いた時の角度 */
const DOOR_OPEN_SECONDS = 0.35;
const DOOR_OPEN_ANGLE = 1.45;
/** 退避：外ラチの外へ何ブロック動かすか、何秒かけるか */
const RETRACT_DISTANCE = 40;
const RETRACT_SECONDS = 5;

const lambert = (color: number) => new THREE.MeshLambertMaterial({ color });

function plateTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 48;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 64, 48);
  ctx.fillStyle = '#111';
  ctx.font = 'bold 36px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 32, 26);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * ブロック調の斜めスタートゲート。
 *  - カウントダウン中は扉が閉じている
 *  - GO で前扉が一斉に開く
 *  - 全馬が 1コーナー付近まで進んだら、外ラチの外へ退避して消える
 */
export class StartGate {
  readonly root = new THREE.Group();
  private readonly doors: { left: THREE.Group; right: THREE.Group }[] = [];
  private openT = 0;
  private retractT = 0;
  private retracting = false;
  /** 退避する方向（コースの外側） */
  private readonly outward = new THREE.Vector3();

  constructor(
    private readonly track: CourseTrack,
    gate: GateSlot[],
    topAt: TopAt,
  ) {
    const frame = lambert(0x2f8f4f);
    const white = lambert(0xf4f4f4);
    const doorMat = lambert(0x2f8f4f);
    const box = (w: number, h: number, d: number, m: THREE.Material | THREE.Material[]) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.castShadow = true;
      return mesh;
    };
    const L = GATE_STALL_LENGTH;

    gate.forEach((slot, k) => {
      const f = track.frameAt(slot.frontS - L / 2, slot.lateral);
      const g = new THREE.Group();
      g.position.set(f.position.x, topAt(f.position.x, f.position.z), f.position.z);
      g.rotation.y = Math.atan2(-f.dir.z, f.dir.x); // ローカル +x = 進行方向, +z = 内側
      const w = slot.width;

      // 仕切り：各枠の外側だけ描く（隣の枠と二重にならないように）。最内枠だけ内側も描く
      const partition = (z: number) => {
        const p = box(L, STALL_HEIGHT - 0.3, 0.12, white);
        p.position.set(0, (STALL_HEIGHT - 0.3) / 2, z);
        g.add(p);
      };
      partition(-w / 2);
      if (k === 0) partition(w / 2);

      // 屋根の梁と枠番の札（札は梁の上に立てて、騎手の目の前に下がらないようにする）
      const beam = box(L, 0.3, w, frame);
      beam.position.y = STALL_HEIGHT;
      g.add(beam);
      const num = new THREE.MeshLambertMaterial({ map: plateTexture(String(slot.post)) });
      const plate = box(0.08, 0.5, w * 0.7, [num, num, white, white, white, white]);
      plate.position.set(L / 2 - 0.1, STALL_HEIGHT + 0.4, 0);
      g.add(plate);

      // 後ろ扉（閉じたまま）
      const back = box(0.08, DOOR_HEIGHT, w - 0.12, doorMat);
      back.position.set(-L / 2, DOOR_HEIGHT / 2 + 0.2, 0);
      g.add(back);

      // 前扉（観音開き。両側の蝶番を軸に前へ開く）
      const leaf = (side: -1 | 1) => {
        const pivot = new THREE.Group();
        pivot.position.set(L / 2, 0, side * (w / 2));
        const d = box(0.08, DOOR_HEIGHT, w / 2 - 0.06, doorMat);
        d.position.set(0, DOOR_HEIGHT / 2 + 0.2, -side * (w / 4));
        pivot.add(d);
        g.add(pivot);
        return pivot;
      };
      this.doors.push({ left: leaf(-1), right: leaf(1) });
      this.root.add(g);
    });

    const mid = track.frameAt(gate[Math.floor(gate.length / 2)].frontS, 0);
    this.outward.copy(mid.right).multiplyScalar(-1);
    this.reset();
  }

  /** リスタート時：扉を閉じ、元の位置に戻す */
  reset() {
    this.openT = 0;
    this.retractT = 0;
    this.retracting = false;
    this.root.position.set(0, 0, 0);
    this.root.visible = true;
    this.applyDoors();
  }

  private applyDoors() {
    const e = 1 - (1 - this.openT) ** 3;
    for (const d of this.doors) {
      // 外側(-z)の蝶番は +回転、内側(+z)の蝶番は -回転で、どちらも前（+x）へ開く
      d.left.rotation.y = DOOR_OPEN_ANGLE * e;
      d.right.rotation.y = -DOOR_OPEN_ANGLE * e;
    }
  }

  update(dt: number, race: Race) {
    if (race.phase === 'countdown') return;

    // GO で扉を開く
    if (this.openT < 1) {
      this.openT = Math.min(1, this.openT + dt / DOOR_OPEN_SECONDS);
      this.applyDoors();
    }

    // 全馬が 1コーナー付近まで進んだら退避を始める
    const first = this.track.def.segments[0];
    const firstCornerS = first.type === 'straight' ? first.length : 0;
    if (!this.retracting && race.horses.every((h) => h.finished || h.progress > firstCornerS)) {
      this.retracting = true;
    }
    if (this.retracting && this.root.visible) {
      this.retractT = Math.min(1, this.retractT + dt / RETRACT_SECONDS);
      const e = this.retractT * this.retractT * (3 - 2 * this.retractT);
      this.root.position.copy(this.outward).multiplyScalar(RETRACT_DISTANCE * e);
      if (this.retractT >= 1) this.root.visible = false;
    }
  }
}
