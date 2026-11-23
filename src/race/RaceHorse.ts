import type { CourseTrack } from '../course/CourseTrack';
import { HORSESHOES, HORSESHOE_ORDER, MAX_WEAR_PENALTY, type HorseshoeType, type TrackCondition } from '../data/horseshoes';
import type { EntryData } from '../data/roster';
import { RACE_CONFIG as C } from './raceConfig';

/** 1 フレーム分の操作。プレイヤーはキーボードから、AI は思考ルーチンから作る */
export interface HorseControls {
  accelerate: boolean;
  brake: boolean;
  /** -1 = 左（外側）, +1 = 右（内側） */
  steer: number;
  whip: boolean;
}

export const NO_CONTROLS: HorseControls = { accelerate: false, brake: false, steer: 0, whip: false };

/**
 * ピットの進行段階
 *  none     : 本コース走行中
 *  approach : ピット要求 ON でピット入口手前。内側へ自動で寄せる
 *  lane     : ピットレーン走行中（速度制限・自動走行）
 *  stopped  : ピットボックスで停止して蹄鉄交換中
 */
export type PitPhase = 'none' | 'approach' | 'lane' | 'stopped';

/**
 * 1 頭の走行状態と物理。描画やキー入力には依存しない（AI 馬にもそのまま使う）。
 * 位置は s（コース上の距離）と lateral（横位置, + が内側）で持つ（単位はブロック）。
 * 速度は実寸の m/s で持つ（km/h = speed × 3.6）。
 */
export class RaceHorse {
  s = 0;
  lateral = 0;
  /** 横方向の速度 m/s（描画で馬体を少し向けるのに使う） */
  lateralVelocity = 0;
  /** 速度 m/s */
  speed = 0;
  stamina = 100;
  shoe: HorseshoeType;
  shoeWear = 0;
  /** 次のピットで履き替える蹄鉄 */
  nextShoe: HorseshoeType;
  pitRequested = false;
  pitPhase: PitPhase = 'none';
  pitTimer = 0;
  pitCount = 0;
  private serviced = false;
  whipsThisLap = 0;
  whipBoost = 0;
  private whipCooldown = 0;
  /** ムチを振った直後のアニメーション用（1 → 0） */
  whipAnim = 0;
  /** ゴール板の通過回数 */
  lineCrossings = 0;
  /** 規定周回を走り終えた */
  finished = false;
  /** ゴールしたレース時間（秒）と着順 */
  finishTime: number | null = null;
  finishPosition: number | null = null;
  /** 各周のラップタイム（秒）と、今の周を走り始めたレース時間 */
  lapTimes: number[] = [];
  lapStartTime = 0;
  /** true の間は進路を変えられない（ゲートの中など） */
  steerLocked = false;
  private startedBehindLine = false;
  /** 走った累積距離（ブロック） */
  distance = 0;
  /** 走行アニメーションの位相 */
  gallopPhase = 0;
  /** 停止するピットボックス前の s（僚馬と重ならないよう少しずらす） */
  readonly pitBoxS: number;

  /** ゴール板を通過した時に呼ばれる */
  onCrossLine?: (horse: RaceHorse) => void;
  /** ピット作業が終わった時に呼ばれる */
  onPitComplete?: (horse: RaceHorse, from: HorseshoeType, to: HorseshoeType) => void;

  constructor(
    readonly track: CourseTrack,
    readonly entry: EntryData,
    /** ピットボックスの番号（コンストラクターの並び順） */
    readonly garageIndex: number,
    readonly garageCount: number,
    /** 同じ厩舎の前で止まる位置のずらし幅（ブロック） */
    boxOffset = 0,
  ) {
    this.shoe = entry.startShoe;
    this.nextShoe = this.defaultNextShoe();
    this.pitBoxS = track.wrap(track.garageS(garageIndex, garageCount) + boxOffset);
  }

  /**
   * レースの進み具合（ブロック）。順位付けに使う。
   * スタート直後（ゴール板の手前）は負、以降は 周回数 × 1 周 + ゴール板からの距離。
   */
  get progress(): number {
    const fromLine = this.track.wrap(this.s - this.track.def.finishS);
    if (this.startedBehindLine && this.lineCrossings === 0) return this.track.diff(this.s, this.track.def.finishS);
    return this.lapsCompleted * this.track.length + fromLine;
  }

  /** スタート位置に並べる */
  reset(startS: number, startLateral: number) {
    this.s = this.track.wrap(startS);
    this.lateral = startLateral;
    this.lateralVelocity = 0;
    this.speed = 0;
    this.stamina = 100;
    this.shoe = this.entry.startShoe;
    this.shoeWear = 0;
    this.nextShoe = this.defaultNextShoe();
    this.pitRequested = false;
    this.pitPhase = 'none';
    this.pitTimer = 0;
    this.pitCount = 0;
    this.serviced = false;
    this.whipsThisLap = 0;
    this.whipBoost = 0;
    this.whipCooldown = 0;
    this.whipAnim = 0;
    this.lineCrossings = 0;
    this.finished = false;
    this.finishTime = null;
    this.finishPosition = null;
    this.lapTimes = [];
    this.lapStartTime = 0;
    this.steerLocked = false;
    this.distance = 0;
    this.startedBehindLine = this.track.diff(this.s, this.track.def.finishS) < 0;
  }

  /** 完了した周回数（スタート直後のゴール板通過は数えない） */
  get lapsCompleted(): number {
    return Math.max(0, this.lineCrossings - (this.startedBehindLine ? 1 : 0));
  }

  get inPit(): boolean {
    return this.pitPhase === 'lane' || this.pitPhase === 'stopped';
  }

  private defaultNextShoe(): HorseshoeType {
    return this.shoe === 'SOFT' ? 'HARD' : 'SOFT';
  }

  togglePitRequest() {
    if (this.inPit) return; // ピットレーンに入ったら取り消せない
    this.pitRequested = !this.pitRequested;
    if (!this.pitRequested && this.pitPhase === 'approach') this.pitPhase = 'none';
  }

  cycleNextShoe() {
    const i = HORSESHOE_ORDER.indexOf(this.nextShoe);
    this.nextShoe = HORSESHOE_ORDER[(i + 1) % HORSESHOE_ORDER.length];
  }

  /** 能力値・蹄鉄・スタミナ・勾配を反映した、現在の最高速度（ムチ込み） */
  topSpeed(condition: TrackCondition): number {
    const st = this.entry.horse.stats;
    let top = C.topSpeedBase + st.speed * C.topSpeedPerStat;
    top *= HORSESHOES[this.shoe].grip[condition] * (1 - MAX_WEAR_PENALTY * this.shoeWear);
    if (this.stamina < C.staminaTiredThreshold) {
      top *= 1 - C.staminaTiredPenalty * (1 - this.stamina / C.staminaTiredThreshold);
    }
    const slopeEffect = C.slopeEffectBase - st.power * C.slopeEffectPerStat;
    top *= Math.min(1.15, Math.max(0.8, 1 - this.track.slopeAt(this.s) * slopeEffect));
    if (this.whipBoost > 0) top *= 1 + C.whipBoostBase + st.intelligence * C.whipBoostPerStat;
    return top;
  }

  /**
   * @param canRace false の間（スタート前・ゴール後）は加速できない
   */
  update(dt: number, c: HorseControls, canRace: boolean, condition: TrackCondition) {
    const track = this.track;
    const def = track.def;
    const pit = def.pitLane;
    const st = this.entry.horse.stats;
    const half = def.trackWidth / 2;
    /** 速度・距離の設定値（m）をコース上の位置（ブロック）に換算する */
    const mpb = def.metersPerBlock;

    this.whipCooldown = Math.max(0, this.whipCooldown - dt);
    this.whipBoost = Math.max(0, this.whipBoost - dt);
    this.whipAnim = Math.max(0, this.whipAnim - dt * 3);

    // --- ピット停止中 ---
    if (this.pitPhase === 'stopped') {
      this.speed = 0;
      this.stamina = Math.min(100, this.stamina + C.pitStaminaRecover * dt);
      this.pitTimer -= dt;
      if (this.pitTimer <= 0) {
        const from = this.shoe;
        this.shoe = this.nextShoe;
        this.shoeWear = 0;
        this.nextShoe = this.defaultNextShoe();
        this.pitCount++;
        this.serviced = true;
        this.pitRequested = false;
        this.pitPhase = 'lane';
        this.onPitComplete?.(this, from, this.shoe);
      }
      return;
    }

    // --- ムチ ---
    if (c.whip && canRace && this.whipCooldown <= 0 && this.pitPhase === 'none') {
      this.whipBoost = C.whipDuration;
      this.whipCooldown = C.whipCooldown;
      this.whipAnim = 1;
      this.stamina = Math.max(0, this.stamina - C.whipStaminaCost);
      this.whipsThisLap++;
    }

    // --- 速度 ---
    const top = this.topSpeed(condition);
    let cap = top;
    if (this.pitPhase === 'lane') {
      cap = Math.min(cap, C.pitSpeedLimit);
      if (!this.serviced) {
        // 自分のピットボックス前でぴったり止まるよう減速
        const dist = (track.pitOffset(this.pitBoxS) - track.pitOffset(this.s)) * mpb;
        cap = Math.min(cap, Math.max(1, Math.sqrt(2 * C.pitLimiterDecel * 0.75 * Math.max(0, dist))));
      }
    }

    const accel = C.accelBase + st.power * C.accelPerStat;
    if (!canRace) {
      // スタート前は停止、ゴール後はキャンター程度までゆっくり落とす
      this.speed = this.finished ? approach(this.speed, 6, C.brakeDecel * 0.4 * dt) : 0;
    } else if (this.pitPhase === 'lane' || c.accelerate) {
      // ピットレーンは自動走行（リミッター速度まで加速）
      if (this.speed < cap) this.speed = Math.min(cap, this.speed + accel * dt);
    } else if (c.brake) {
      this.speed -= C.brakeDecel * dt;
    } else {
      this.speed -= C.coastDecel * dt;
    }
    if (this.speed > cap) {
      const decel = this.pitPhase === 'lane' ? C.pitLimiterDecel : C.overSpeedDecel;
      this.speed = Math.max(cap, this.speed - decel * dt);
    }
    this.speed = Math.max(0, this.speed);

    // --- スタミナ ---
    if (canRace) {
      const baseTop = C.topSpeedBase + st.speed * C.topSpeedPerStat;
      const drainK = C.staminaDrainBase - st.stamina * C.staminaDrainPerStat;
      let rate = drainK * (this.speed / baseTop - C.staminaCruiseRatio);
      rate += Math.max(0, track.slopeAt(this.s)) * C.staminaHillDrain * (1.2 - st.power * 0.05) * (this.speed / baseTop);
      if (rate < 0) rate = Math.max(-C.staminaRecoverMax, rate * 0.5);
      this.stamina = Math.min(100, Math.max(0, this.stamina - rate * dt));
    }

    // --- 前進（内側ほど同じ速さで s が進む = インコースが有利） ---
    const k = track.curvatureAt(this.s);
    const ds = (this.speed * dt) / mpb / Math.max(0.5, 1 - k * this.lateral);
    const prevS = this.s;
    this.s = track.wrap(this.s + ds);
    this.distance += ds;
    this.gallopPhase += ds * mpb * C.gallopPhasePerMeter;
    this.shoeWear = Math.min(1, this.shoeWear + (ds / track.length) * HORSESHOES[this.shoe].wearPerLap);

    if (track.diff(prevS, def.finishS) < 0 && track.diff(this.s, def.finishS) >= 0) {
      this.lineCrossings++;
      this.onCrossLine?.(this);
    }

    // --- ピット進行 ---
    const prevOff = track.pitOffset(prevS);
    const off = track.pitOffset(this.s);
    const crossedEntry = off < prevOff; // オフセットが一周して戻った = 入口を通過

    if (this.pitPhase === 'none' && this.pitRequested && !this.serviced) {
      const toEntry = track.wrap(pit.entryStart - this.s);
      if (toEntry > 0 && toEntry <= C.pitApproachDistance / mpb) this.pitPhase = 'approach';
    }
    if (this.pitPhase === 'approach' && crossedEntry) this.pitPhase = 'lane';
    // ピットレーンの終端を過ぎたら本コースへ合流し、次のピットに入れるようにする
    if (this.pitPhase === 'lane' && off >= track.pitLength) {
      this.pitPhase = 'none';
      this.serviced = false;
    }
    this.checkPitStop();

    // --- 横位置 ---
    const prevLat = this.lateral;
    if (this.pitPhase === 'approach') {
      this.lateral = approach(this.lateral, pit.mergeLateral, (C.pitApproachSteerRate / mpb) * dt);
    } else if (this.pitPhase === 'lane') {
      // 走行中はコース側（ファストレーン）、自分のボックスが近づいたら厩舎側（作業レーン）へ寄る
      const center = track.pitLateralAt(this.s) ?? pit.mergeLateral;
      const toBox = track.pitOffset(this.pitBoxS) - track.pitOffset(this.s);
      const nearBox = !this.serviced && toBox < 25 / mpb;
      const workLane = pit.width / 4;
      const target = center + (nearBox || this.pitTimer > 0 ? workLane : -workLane * 0.75);
      this.lateral = approach(this.lateral, target, (C.pitLaneSteerRate / mpb) * dt);
    } else if (this.pitPhase === 'none' && !this.steerLocked) {
      // 本コース上だけプレイヤーが進路を取れる（ラチの内側に収める）
      const grip = Math.min(1, this.speed / 6);
      this.lateral += c.steer * (C.steerRate / mpb) * grip * dt;
      const limit = half - C.railMargin / mpb;
      this.lateral = Math.max(-limit, Math.min(limit, this.lateral));
    }
    this.lateralVelocity = dt > 0 ? ((this.lateral - prevLat) * mpb) / dt : 0;
  }

  /** 次の周回に入った（ムチ回数のリセットなど） */
  startNewLap() {
    this.whipsThisLap = 0;
  }

  /** 自分のピットボックス前に達したら停止して作業を始める */
  private checkPitStop() {
    if (this.pitPhase !== 'lane' || this.serviced) return;
    const track = this.track;
    const stopS = this.pitBoxS;
    const dist = track.pitOffset(stopS) - track.pitOffset(this.s);
    if (dist <= 0.05) {
      this.s = stopS;
      this.speed = 0;
      this.pitPhase = 'stopped';
      this.pitTimer = C.pitWorkBase - this.entry.jockey.strategy * C.pitWorkPerStat;
    }
  }
}

function approach(value: number, target: number, maxStep: number): number {
  if (Math.abs(target - value) <= maxStep) return target;
  return value + Math.sign(target - value) * maxStep;
}
