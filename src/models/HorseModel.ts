import * as THREE from 'three';
import type { CourseTrack } from '../course/CourseTrack';
import { HORSESHOES } from '../data/horseshoes';
import type { HorseshoeType } from '../data/horseshoes';
import { capColorOf, constructorOf, type EntryData } from '../data/roster';

/** 見た目の色（毛色・勝負服・帽子） */
export interface HorseLook {
  coat: number;
  silk: number;
  cap: number;
}

export const lookOfEntry = (e: EntryData): HorseLook => ({
  coat: e.horse.coat,
  silk: constructorOf(e).color,
  cap: capColorOf(e), // 僚馬は帽子の色で見分ける
});

/** 描画に必要な走行状態（RaceHorse・SafetyHorse の両方がこの形を持つ） */
export interface HorseViewState {
  s: number;
  lateral: number;
  /** m/s */
  speed: number;
  /** m/s */
  lateralVelocity: number;
  gallopPhase: number;
  whipAnim: number;
  shoe: HorseshoeType;
  slipstream: number;
  /** 0 = 立っている 〜 1 = 横倒し（落馬） */
  fallen: number;
}

const lambert = (color: number) => new THREE.MeshLambertMaterial({ color });
/** スリップストリームの風切り線の本数 */
const WIND_STREAKS = 15;

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/** 毛色を少し暗くした色（たてがみ・尾・鼻先用） */
const darker = (color: number, k: number) => new THREE.Color(color).multiplyScalar(k).getHex();

/**
 * マイクラ風ブロック調の馬＋騎手。
 * ローカル座標: +x = 前, +y = 上, +z = 右（コース内側）。地面は y = 0。
 */
export class HorseModel {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly neck = new THREE.Group();
  private readonly legs: { pivot: THREE.Group; offset: number }[] = [];
  private readonly hoofMat = lambert(0xffffff);
  private readonly jockey = new THREE.Group();
  private readonly jockeyHead = new THREE.Group();
  private readonly whipArm = new THREE.Group();
  private groundY = 0;
  private initialized = false;
  private readonly wind = new THREE.Group();
  private readonly windMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });

  /** セーフティホースの回転灯（点滅させる） */
  private beacon: THREE.Mesh | null = null;
  private beaconTime = 0;

  constructor(look: HorseLook) {
    const coat = lambert(look.coat);
    const hair = lambert(darker(look.coat, 0.45));
    const silk = lambert(look.silk);
    const cap = lambert(look.cap);
    this.root.rotation.order = 'YXZ'; // 向き（Y）→ 横倒し（X）→ 坂の傾き（Z）
    const skin = lambert(0xf0c8a0);
    const white = lambert(0xf4f4f4);
    const boot = lambert(0x1a1a1a);

    // --- 馬体 ---
    this.root.add(this.body);
    this.body.add(box(1.5, 0.6, 0.62, coat, 0, 1.0, 0));
    this.body.add(box(0.55, 0.08, 0.66, silk, 0.05, 1.33, 0)); // 鞍下のゼッケン
    this.body.add(box(0.14, 0.55, 0.14, hair, -0.82, 0.95, 0)); // 尾

    // 首と頭（首の付け根を支点にうなずく）
    this.neck.position.set(0.62, 1.2, 0);
    this.body.add(this.neck);
    const neckMesh = box(0.34, 0.75, 0.36, coat, 0.1, 0.3, 0);
    neckMesh.rotation.z = -0.55;
    this.neck.add(neckMesh);
    this.neck.add(box(0.1, 0.7, 0.12, hair, -0.02, 0.36, 0).rotateZ(-0.55)); // たてがみ
    this.neck.add(box(0.58, 0.3, 0.3, coat, 0.48, 0.6, 0)); // 頭
    this.neck.add(box(0.16, 0.22, 0.24, lambert(darker(look.coat, 0.7)), 0.8, 0.56, 0)); // 鼻先
    this.neck.add(box(0.08, 0.14, 0.08, coat, 0.3, 0.8, -0.1)); // 耳
    this.neck.add(box(0.08, 0.14, 0.08, coat, 0.3, 0.8, 0.1));

    // 脚（付け根を支点に前後へ振る）。蹄の色 = 履いている蹄鉄
    const legPositions: [number, number, number][] = [
      [0.55, -0.2, 0], // 前左
      [0.55, 0.2, 0.45], // 前右
      [-0.55, -0.2, Math.PI], // 後左
      [-0.55, 0.2, Math.PI + 0.45], // 後右
    ];
    for (const [x, z, offset] of legPositions) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.72, z);
      pivot.add(box(0.18, 0.62, 0.18, coat, 0, -0.31, 0));
      pivot.add(box(0.2, 0.1, 0.2, this.hoofMat, 0, -0.67, 0));
      this.body.add(pivot);
      this.legs.push({ pivot, offset });
    }

    // --- 騎手（前傾したモンキー乗り） ---
    this.jockey.position.set(0.05, 1.37, 0);
    this.body.add(this.jockey);
    const torso = box(0.5, 0.34, 0.38, silk, 0.12, 0.32, 0);
    torso.rotation.z = -0.75;
    this.jockey.add(torso);
    this.jockey.add(box(0.36, 0.12, 0.12, white, 0.0, 0.1, -0.3)); // 脚（白いズボン）
    this.jockey.add(box(0.36, 0.12, 0.12, white, 0.0, 0.1, 0.3));
    this.jockey.add(box(0.12, 0.16, 0.12, boot, 0.12, -0.02, -0.33));
    this.jockey.add(box(0.12, 0.16, 0.12, boot, 0.12, -0.02, 0.33));
    this.jockey.add(box(0.4, 0.1, 0.1, silk, 0.42, 0.36, -0.17)); // 左腕（手綱）
    this.jockeyHead.position.set(0.4, 0.6, 0);
    this.jockeyHead.add(box(0.26, 0.26, 0.26, skin));
    this.jockeyHead.add(box(0.3, 0.13, 0.3, cap, 0, 0.17, 0));
    this.jockeyHead.add(box(0.12, 0.04, 0.24, cap, 0.18, 0.1, 0)); // ひさし
    this.jockey.add(this.jockeyHead);
    // 右腕（ムチ）
    this.whipArm.position.set(0.3, 0.42, 0.18);
    this.whipArm.add(box(0.34, 0.1, 0.1, silk, 0.12, 0, 0));
    this.whipArm.add(box(0.05, 0.55, 0.05, lambert(0x222222), 0.28, -0.22, 0)); // ムチ
    this.jockey.add(this.whipArm);

    // スリップストリームの風切り線（馬の両脇と上を前から後ろへ流れる白い筋）
    this.root.add(this.wind);
    this.wind.visible = false;
    const streak = new THREE.BoxGeometry(1.1, 0.03, 0.03);
    for (let i = 0; i < WIND_STREAKS; i++) {
      const s = new THREE.Mesh(streak, this.windMat);
      const side = i % 3; // 0 = 左, 1 = 右, 2 = 上
      const z = side === 0 ? -0.55 - Math.random() * 0.3 : side === 1 ? 0.55 + Math.random() * 0.3 : (Math.random() - 0.5) * 0.6;
      const y = side === 2 ? 2.2 + Math.random() * 0.3 : 0.7 + Math.random() * 1.2;
      s.position.set(Math.random() * 4 - 2.5, y, z);
      s.userData.speed = 0.8 + Math.random() * 0.5;
      this.wind.add(s);
    }
  }

  /**
   * 芦毛のセーフティホース：白っぽい大きな誘導馬。騎手は黄色いベストで、帽子の上に黄色の回転灯。
   */
  static safetyHorse(): HorseModel {
    const m = new HorseModel({ coat: 0xd9d9d6, silk: 0xffd23a, cap: 0x1a1a1a });
    m.root.scale.setScalar(1.3);
    m.beacon = box(0.16, 0.12, 0.16, new THREE.MeshBasicMaterial({ color: 0xffc400 }), 0, 0.3, 0);
    m.jockeyHead.add(m.beacon);
    return m;
  }

  /** 騎手視点の時はカメラにかぶる騎手の頭を隠す */
  setJockeyHeadVisible(visible: boolean) {
    this.jockeyHead.visible = visible;
  }

  /** 走行状態をモデルに反映する */
  sync(horse: HorseViewState, track: CourseTrack, topAt: (x: number, z: number) => number, dt: number) {
    const frame = track.frameAt(horse.s, horse.lateral);
    const p = frame.position;

    // ブロック（0.5 刻み）の上面に沿わせつつ、段差はなめらかに上り下りする
    const ground = topAt(p.x, p.z);
    this.groundY = this.initialized ? this.groundY + (ground - this.groundY) * Math.min(1, dt * 10) : ground;
    this.initialized = true;
    this.root.position.set(p.x, this.groundY, p.z);

    // 向き：進行方向＋横移動の分だけ少し斜め、坂では前後に傾ける
    const yaw = Math.atan2(-frame.dir.z, frame.dir.x);
    const drift = horse.speed > 1 ? Math.atan2(horse.lateralVelocity, horse.speed) : 0;
    // 落馬：ラチのある側へ横倒し（進行方向を軸に回す）
    const roll = horse.fallen * 1.45 * (horse.lateral >= 0 ? 1 : -1) * track.side;
    this.root.rotation.set(roll, yaw - drift * 0.6, Math.atan(track.slopeAt(horse.s)));
    if (this.beacon) {
      this.beaconTime += dt;
      this.beacon.visible = Math.floor(this.beaconTime * 3) % 2 === 0;
    }

    // 走りのアニメーション（速いほど大きく）
    const intensity = Math.min(1, horse.speed / 12); // m/s。速歩以上で脚を大きく振る
    const ph = horse.gallopPhase;
    for (const leg of this.legs) leg.pivot.rotation.z = Math.sin(ph + leg.offset) * 0.75 * intensity;
    this.body.position.y = Math.abs(Math.sin(ph)) * 0.08 * intensity;
    // 首の振りは脚の半分の周期でゆったり（落ち着いた自然な動き）
    this.neck.rotation.z = Math.sin(ph * 0.5 + 0.6) * 0.12 * intensity;
    this.jockey.position.y = 1.37 - this.body.position.y * 0.6; // 騎手は上下動を吸収
    this.whipArm.rotation.z = horse.whipAnim > 0 ? Math.sin(horse.whipAnim * Math.PI) * 1.6 : 0;

    this.hoofMat.color.set(HORSESHOES[horse.shoe].color);

    // スリップストリーム中は風切り線を流す（強さに応じて濃く）
    this.wind.visible = horse.slipstream > 0.02;
    if (this.wind.visible) {
      this.windMat.opacity = 0.55 * horse.slipstream;
      const flow = horse.speed * dt * 0.9; // ブロック/フレーム。馬より速く後ろへ流れて見える
      for (const s of this.wind.children) {
        s.position.x -= flow * (s.userData.speed as number);
        if (s.position.x < -2.8) s.position.x += 4.4;
      }
    }
  }

  /** 追従カメラ用：馬の位置・進行方向・少し先（約 25m）の注視点・速度・走りの位相 */
  cameraAnchor(horse: HorseViewState, track: CourseTrack, topAt: (x: number, z: number) => number) {
    const frame = track.frameAt(horse.s, horse.lateral);
    const ahead = track.frameAt(horse.s + 25 / track.def.metersPerBlock, horse.lateral).position;
    ahead.y = topAt(ahead.x, ahead.z);
    return {
      position: this.root.position.clone(),
      dir: frame.dir,
      ahead,
      speed: horse.speed,
      gallopPhase: horse.gallopPhase,
    };
  }
}
