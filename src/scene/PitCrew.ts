import * as THREE from 'three';
import { constructorOf } from '../data/roster';
import type { RaceHorse } from '../race/RaceHorse';
import type { CourseTrack } from '../course/CourseTrack';

/** クルーの大きさ（馬・騎手と並んで見劣りしない大きさ） */
const CREW_SCALE = 1.15;

const lambert = (color: number) => new THREE.MeshLambertMaterial({ color });
const SKIN = lambert(0xf0c8a0);
const PANTS = lambert(0x2a2a2e);
const HAMMER = lambert(0x555555);
const GLOVE = lambert(0x1a1a1a);

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/**
 * ブロック調のピットクルー 1 人。ローカル座標：+x = 向いている方向、地面 y = 0。
 * crouch(0〜1) でしゃがみ、hammer で右腕（ハンマー）を振る。
 */
class CrewMember {
  readonly root = new THREE.Group();
  private readonly upper = new THREE.Group();
  private readonly legs = new THREE.Group();
  private readonly arm = new THREE.Group();

  constructor(shirt: THREE.Material, helmet: THREE.Material) {
    // 脚（しゃがむと前に折りたたむ）
    this.legs.add(box(0.14, 0.62, 0.14, PANTS, 0, -0.31, -0.11));
    this.legs.add(box(0.14, 0.62, 0.14, PANTS, 0, -0.31, 0.11));
    this.legs.position.y = 0.66;
    this.root.add(this.legs);
    // 胴体・頭（ヘルメット）・左腕
    this.upper.position.y = 0.66;
    this.upper.add(box(0.26, 0.5, 0.4, shirt, 0, 0.25, 0));
    this.upper.add(box(0.24, 0.24, 0.24, SKIN, 0.02, 0.64, 0));
    this.upper.add(box(0.28, 0.12, 0.28, helmet, 0.02, 0.8, 0));
    this.upper.add(box(0.28, 0.1, 0.1, shirt, 0.14, 0.32, -0.25).rotateZ(-0.6));
    // 右腕＋ハンマー（肩を支点に振る）
    this.arm.position.set(0, 0.45, 0.25);
    this.arm.add(box(0.1, 0.34, 0.1, shirt, 0, -0.17, 0));
    this.arm.add(box(0.11, 0.08, 0.11, GLOVE, 0, -0.36, 0));
    this.arm.add(box(0.05, 0.05, 0.3, HAMMER, 0, -0.38, 0.0).rotateX(Math.PI / 2));
    this.arm.add(box(0.12, 0.1, 0.1, HAMMER, 0, -0.38, 0.14));
    this.upper.add(this.arm);
    this.root.add(this.upper);
  }

  pose(crouch: number, swing: number) {
    // しゃがむ：腰を落とし、脚を前に折り、上半身を前へ倒す
    const hip = 0.66 - crouch * 0.34;
    this.legs.position.y = hip;
    this.legs.rotation.z = crouch * 1.25;
    this.legs.scale.y = 1 - crouch * 0.35;
    this.upper.position.y = hip;
    this.upper.rotation.z = -crouch * 0.55;
    // ハンマーを振る（しゃがんでいる時だけ）
    this.arm.rotation.z = 0.15 + crouch * (0.5 + Math.max(0, Math.sin(swing)) * 1.1);
  }
}

/** 1 頭分のクルー（4 人）と、作業後に出す「FAST PIT!」などの表示 */
class CrewSet {
  readonly group = new THREE.Group();
  readonly members: CrewMember[] = [];
  readonly label: THREE.Sprite;
  private readonly canvas = document.createElement('canvas');
  private readonly texture: THREE.CanvasTexture;
  /** 作業後、クルーと表示を残しておく時間 */
  linger = 0;
  phase = Math.random() * 6;

  constructor(color: number) {
    const shirt = lambert(color);
    // ヘルメットは白（チームカラーのシャツと見分けやすく、どの馬場・夜間でも目立つ）
    const helmet = lambert(0xf2f2f2);
    // 4 本の脚のそれぞれの横（前左・前右・後左・後右）。馬体にめり込まないよう少し離し、脚の方を向いて作業する
    const spots: [number, number, number][] = [
      [0.6, -0.95, -Math.PI / 2],
      [0.6, 0.95, Math.PI / 2],
      [-0.6, -0.95, -Math.PI / 2],
      [-0.6, 0.95, Math.PI / 2],
    ];
    for (const [x, z, yaw] of spots) {
      const m = new CrewMember(shirt, helmet);
      m.root.scale.setScalar(CREW_SCALE);
      m.root.position.set(x, 0, z);
      m.root.rotation.y = yaw;
      this.members.push(m);
      this.group.add(m.root);
    }
    this.canvas.width = 256;
    this.canvas.height = 64;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, depthTest: false, transparent: true }));
    this.label.scale.set(4, 1, 1);
    this.label.position.set(0, 3.4, 0);
    this.label.renderOrder = 10;
    this.label.visible = false;
    this.group.add(this.label);
    this.group.visible = false;
  }

  setLabel(text: string, color: string) {
    const g = this.canvas.getContext('2d')!;
    g.clearRect(0, 0, 256, 64);
    g.font = 'bold 34px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 6;
    g.strokeStyle = 'rgba(0,0,0,0.85)';
    g.strokeText(text, 128, 32);
    g.fillStyle = color;
    g.fillText(text, 128, 32);
    this.texture.needsUpdate = true;
    this.label.visible = true;
  }
}

/**
 * ピットイン中の 4 人クルーの蹄鉄交換アニメーション。
 *  - ペナルティ消化中：クルーは馬の横で立って待つ
 *  - 作業中：しゃがんでハンマーで蹄鉄を打つ
 *  - 作業後：その場に少し残り、頭上に「FAST PIT! 2.1s」「SLOW PIT 5.4s」などを出す
 */
export class PitCrewView {
  readonly group = new THREE.Group();
  private readonly sets = new Map<RaceHorse, CrewSet>();
  private readonly wasStopped = new Set<RaceHorse>();

  /**
   * @param topAt 地面（ブロックの上面）の高さ。馬のモデルと同じものを使い、どのコースでもピットボックスの地面に立たせる
   */
  constructor(
    horses: readonly RaceHorse[],
    private readonly track: CourseTrack,
    private readonly topAt: (x: number, z: number) => number,
  ) {
    for (const h of horses) {
      const s = new CrewSet(constructorOf(h.entry).color);
      this.sets.set(h, s);
      this.group.add(s.group);
    }
  }

  /** レースのやり直し・リプレイの時はすべて片付ける */
  clear() {
    for (const s of this.sets.values()) {
      s.group.visible = false;
      s.label.visible = false;
      s.linger = 0;
    }
    this.wasStopped.clear();
  }

  update(dt: number) {
    for (const [h, s] of this.sets) {
      const stopped = h.pitPhase === 'stopped' && !h.retired;
      if (stopped) {
        // 停止位置（コース座標 → ワールド座標）に合わせる。馬のモデルと同じ計算なので、どのコース・左回りでもズレない
        if (!this.wasStopped.has(h)) {
          const frame = this.track.frameAt(h.s, h.lateral);
          const p = frame.position;
          s.group.position.set(p.x, this.topAt(p.x, p.z), p.z);
          s.group.rotation.set(0, Math.atan2(-frame.dir.z, frame.dir.x), 0);
          s.label.visible = false;
          this.wasStopped.add(h);
        }
        s.group.visible = true;
        s.linger = 0;
        const working = h.pitTimer <= h.pitWork;
        s.phase += dt * 11;
        s.members.forEach((m, i) => m.pose(working ? 1 : 0, s.phase + i * 1.7));
        continue;
      }
      if (this.wasStopped.has(h)) {
        // 作業が終わった：出来を頭上に出して、少しのあいだ残る
        this.wasStopped.delete(h);
        const r = h.pitWorkResult;
        const t = `${h.pitWork.toFixed(1)}s`;
        if (r === 'fast') s.setLabel(`FAST PIT! ${t}`, '#6fe07d');
        else if (r === 'slow') s.setLabel(`SLOW PIT ${t}`, '#ff6a5a');
        else s.setLabel(`PIT ${t}`, '#ffffff');
        s.linger = 2.5;
        s.members.forEach((m) => m.pose(0, 0));
      }
      if (s.linger > 0) {
        s.linger -= dt;
        s.label.position.y = 3.4 + (2.5 - s.linger) * 0.25;
        if (s.linger <= 0) {
          s.group.visible = false;
          s.label.visible = false;
        }
      } else s.group.visible = false;
    }
  }
}
