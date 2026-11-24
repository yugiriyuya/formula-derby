import type { CourseTrack } from '../course/CourseTrack';
import { HORSESHOES, HORSESHOE_ORDER, MAX_WEAR_PENALTY, type HorseshoeType, type TrackCondition } from '../data/horseshoes';
import { constructorOf, type EntryData } from '../data/roster';
import { RUNNING_STYLES } from '../data/runningStyles';
import { PACE_LEVELS, RACE_CONFIG as C, type PaceLevel } from './raceConfig';

/** 発馬の結果 */
export type StartResult = 'rocket' | 'normal' | 'late';

/** 1 フレーム分の操作。プレイヤーはキーボードから、AI は思考ルーチンから作る */
export interface HorseControls {
  accelerate: boolean;
  brake: boolean;
  /** -1 = 左（外側）, +1 = 右（内側） */
  steer: number;
  whip: boolean;
  /** 目指している巡航速度（m/s）。上回っている時はゆっくり（2m/s²）落として合わせる。省略時は惰性 */
  targetSpeed?: number;
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
  /** 直前のムチの効き（0〜1。スタミナが少ないほど弱い） */
  private whipPower = 1;
  private whipCooldown = 0;
  /** 馬番（ゲート番号 1〜頭数） */
  postNumber = 0;
  /** 今のペース（巡航速度とスタミナの使い方） */
  paceLevel: PaceLevel = 'normal';
  /** 発馬：ゲートが開いてから走り出すまでの遅れ（秒）、ロケットスタートの残り時間、結果 */
  startDelay = 0;
  startBoost = 0;
  startResult: StartResult | null = null;
  /** ムチを振った直後のアニメーション用（1 → 0） */
  whipAnim = 0;
  /** タイムペナルティの合計（秒）。ゴールタイムに加算する */
  penaltySeconds = 0;
  /** 今いるブロックの荒れ度（0〜1）。Race が毎フレーム入れる */
  groundWear = 0;
  /** 最後に荒らしたマス（同じマスに留まっている間は何度も荒らさない） */
  lastWearCell = -1;
  /** スリップストリーム：Race が判定（true/false）し、ここで 0〜1 になめらかに効かせる */
  slipstreamTarget = false;
  slipstream = 0;
  /** 落馬してリタイア（DNF）した */
  retired = false;
  /** 落馬したレース時間（順位表でリタイアの順を決める） */
  retireTime = 0;
  private retireTimer = 0;
  /** 倒れ具合（0 = 立っている 〜 1 = 横倒し）。描画用 */
  fallen = 0;
  /** レース側が決める速度の上限（m/s）。セーフティホース中の 50km/h 制限・追い越し禁止 */
  speedCap = Infinity;
  /** STOP & GO ペナルティ：次のピットインでボックスに完全停止する */
  stopGoPending = false;
  private servingStopGo = false;
  /** 最後に接触・押し出しをしてきた馬と時刻（落馬させた馬を判定するため） */
  lastHitBy: RaceHorse | null = null;
  lastHitAt = -Infinity;
  /** 最後の接触ペナルティ（相手を落馬させた時に STOP & GO へ置き換える） */
  lastContactPenalty: { victim: RaceHorse; at: number } | null = null;

  // --- リザルト用の計測（次のフェーズのリザルト画面で使う） ---
  /** 単勝オッズ（倍）と人気順（1 = 1 番人気）。レース前に Race が決める */
  odds = 0;
  popularity = 0;
  /** 追い抜いた回数（コース上で前の馬を抜いた回数。ピットで順位が入れ替わった分は数えない） */
  overtakes = 0;
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
  pitBoxS: number;
  /** ピットボックスの番号（ピットレーンの入口側から 0, 1, …。予選の結果で変わる） */
  garageIndex: number;
  /** 周回数に合わせた調整（20 周では蹄鉄の摩耗・スタミナの消耗を緩める）。Race.setLaps で設定 */
  shoeWearScale = 1;
  staminaScale = 1;
  /** スタート時に履く蹄鉄（AI の作戦で決める。null なら出走表のとおり） */
  startShoeOverride: HorseshoeType | null = null;

  /** ゴール板を通過した時に呼ばれる */
  onCrossLine?: (horse: RaceHorse) => void;
  /** ピット作業が終わった時に呼ばれる */
  onPitComplete?: (horse: RaceHorse, from: HorseshoeType, to: HorseshoeType) => void;
  /** タイムペナルティを受けた時に呼ばれる */
  onPenalty?: (horse: RaceHorse, seconds: number, reason: string) => void;
  /** STOP & GO を消化した時に呼ばれる */
  onStopGoServed?: (horse: RaceHorse) => void;

  /** STOP & GO でピットボックスに停止中 */
  get isServingStopGo(): boolean {
    return this.servingStopGo;
  }

  constructor(
    readonly track: CourseTrack,
    readonly entry: EntryData,
    /** ピットボックスの番号（コンストラクターの並び順） */
    garageIndex: number,
    readonly garageCount: number,
    /** 同じ厩舎の前で止まる位置のずらし幅（ブロック） */
    private readonly boxOffset = 0,
  ) {
    this.shoe = entry.startShoe;
    this.nextShoe = this.defaultNextShoe();
    this.garageIndex = garageIndex;
    this.pitBoxS = track.wrap(track.garageS(garageIndex, garageCount) + boxOffset);
  }

  /** ピットボックスを割り当て直す（予選の結果） */
  assignGarage(index: number) {
    this.garageIndex = index;
    this.pitBoxS = this.track.wrap(this.track.garageS(index, this.garageCount) + this.boxOffset);
  }

  /** ピットの番号（1 = ピット出口にいちばん近い有利なボックス） */
  get pitNumber(): number {
    return this.garageCount - this.garageIndex;
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
    this.shoe = this.startShoeOverride ?? this.entry.startShoe;
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
    this.paceLevel = 'normal';
    this.whipPower = 1;
    this.startDelay = 0;
    this.startBoost = 0;
    this.startResult = null;
    this.penaltySeconds = 0;
    this.groundWear = 0;
    this.lastWearCell = -1;
    this.slipstreamTarget = false;
    this.slipstream = 0;
    this.retired = false;
    this.retireTime = 0;
    this.retireTimer = 0;
    this.fallen = 0;
    this.speedCap = Infinity;
    this.stopGoPending = false;
    this.servingStopGo = false;
    this.lastHitBy = null;
    this.lastHitAt = -Infinity;
    this.lastContactPenalty = null;
    this.overtakes = 0;
    this.distance = 0;
    this.startedBehindLine = this.track.diff(this.s, this.track.def.finishS) < 0;
  }

  /**
   * ゲートが開いた瞬間の反応を決める（運＋賢さ・パワー補正）。
   *  - ロケットスタート：遅れなし＋最初の数秒の加速が増す
   *  - 普通：わずかな反応の遅れ
   *  - 出遅れ：ワンテンポ遅れて走り出す
   */
  rollStart(rand: () => number): StartResult {
    const st = this.entry.horse.stats;
    const q = rand() * C.startLuckWeight + ((st.intelligence + st.power) / 20) * (1 - C.startLuckWeight);
    const between = (r: readonly [number, number]) => r[0] + rand() * (r[1] - r[0]);
    if (q >= C.rocketStartThreshold) {
      this.startDelay = 0;
      this.startBoost = C.rocketDuration;
      this.startResult = 'rocket';
    } else if (q < C.lateStartThreshold) {
      this.startDelay = between(C.lateReaction);
      this.startResult = 'late';
    } else {
      this.startDelay = between(C.normalReaction);
      this.startResult = 'normal';
    }
    return this.startResult;
  }

  /** 完了した周回数（スタート直後のゴール板通過は数えない） */
  get lapsCompleted(): number {
    return Math.max(0, this.lineCrossings - (this.startedBehindLine ? 1 : 0));
  }

  get inPit(): boolean {
    return this.pitPhase === 'lane' || this.pitPhase === 'stopped';
  }

  /** 脚質の性能 */
  get style() {
    return RUNNING_STYLES[this.entry.horse.style];
  }

  /** ファステストラップ（最速の周回タイムと、それが何周目か）。まだ 1 周も走っていなければ null */
  get fastestLap(): { time: number; lap: number } | null {
    if (this.lapTimes.length === 0) return null;
    let best = 0;
    this.lapTimes.forEach((t, i) => {
      if (t < this.lapTimes[best]) best = i;
    });
    return { time: this.lapTimes[best], lap: best + 1 };
  }

  private defaultNextShoe(): HorseshoeType {
    return this.shoe === 'SOFT' ? 'HARD' : 'SOFT';
  }

  /** 柵に衝突して落馬：リタイア（DNF） */
  retire(raceTime: number) {
    if (this.retired) return;
    this.retired = true;
    this.retireTime = raceTime;
    this.retireTimer = 0;
    this.pitRequested = false;
    this.pitPhase = 'none';
    this.slipstream = 0;
    this.whipBoost = 0;
  }

  /** 馬の中心がこれより外（|lateral|）に出たら柵に衝突（ブロック） */
  get crashLimit(): number {
    const mpb = this.track.def.metersPerBlock;
    return this.track.railLateral - (C.horseHalfWidth + C.railPostHalfWidth) / mpb;
  }

  /** 内ラチ・外ラチまでの近い方の距離（m）。HUD の注意表示用 */
  get railDistance(): number {
    const mpb = this.track.def.metersPerBlock;
    const toOuter = this.crashLimit + this.lateral;
    const toInner = this.track.innerRailOpenAt(this.s) ? Infinity : this.crashLimit - this.lateral;
    return Math.min(toOuter, toInner) * mpb;
  }

  /** STOP & GO を科す（次のピットインを強制） */
  giveStopAndGo() {
    this.stopGoPending = true;
    this.pitRequested = true;
  }

  togglePitRequest() {
    if (this.inPit) return; // ピットレーンに入ったら取り消せない
    if (this.stopGoPending && this.pitRequested) return; // STOP & GO を消化するまでは取り消せない
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
    // ムチ：脚質（差し・追込ほど伸びる）と疲れ具合で効きが変わる
    if (this.whipBoost > 0) top *= 1 + (C.whipBoostBase + st.intelligence * C.whipBoostPerStat) * this.whipPower * this.style.whipPower;
    // 荒れた馬場：柔らかい蹄鉄ほど大きく減速（ピットレーンは対象外）
    if (this.pitPhase !== 'lane') top *= 1 - this.groundWear * C.roughPenalty[this.shoe];
    // スリップストリーム：前の馬の風よけで +3km/h
    top += C.slipstreamSpeedBonus * this.slipstream;
    // セーフティホース中の速度制限・追い越し禁止（ピットレーンでは別の制限がかかる）
    if (this.pitPhase !== 'lane') top = Math.min(top, this.speedCap);
    return top;
  }

  /**
   * @param raceRunning false の間（スタート前・ゴール後）は走れない
   */
  update(dt: number, c: HorseControls, raceRunning: boolean, condition: TrackCondition) {
    const track = this.track;
    const def = track.def;
    const pit = def.pitLane;
    const st = this.entry.horse.stats;
    const half = def.trackWidth / 2;
    /** 速度・距離の設定値（m）をコース上の位置（ブロック）に換算する */
    const mpb = def.metersPerBlock;

    // --- 落馬：倒れて止まり、しばらくしたらコース脇（ラチの外）へ退避 ---
    if (this.retired) {
      this.retireTimer += dt;
      this.speed = approach(this.speed, 0, 14 * dt);
      this.s = track.wrap(this.s + (this.speed * dt) / mpb);
      this.whipAnim = 0;
      if (this.retireTimer < C.retireFallSeconds) {
        this.fallen = Math.min(1, this.retireTimer / 0.4);
      } else {
        this.fallen = 0;
        const side = this.lateral >= 0 ? 1 : -1;
        this.lateral = side * (track.railLateral + C.retireClearOffset / mpb);
      }
      this.lateralVelocity = 0;
      return;
    }

    // ゲートが開いても、反応が遅れている間（出遅れ）はまだ走り出さない
    if (raceRunning && this.startDelay > 0) this.startDelay = Math.max(0, this.startDelay - dt);
    const canRace = raceRunning && this.startDelay <= 0;
    if (canRace) this.startBoost = Math.max(0, this.startBoost - dt);

    this.whipCooldown = Math.max(0, this.whipCooldown - dt);
    this.whipBoost = Math.max(0, this.whipBoost - dt);
    this.whipAnim = Math.max(0, this.whipAnim - dt * 3);
    // スリップストリームは 0.3 秒ほどでかかり、抜けるとすぐ切れる
    this.slipstream = approach(this.slipstream, this.slipstreamTarget && canRace ? 1 : 0, dt * (this.slipstreamTarget ? 3.5 : 5));

    // --- ピット停止中 ---
    if (this.pitPhase === 'stopped') {
      this.speed = 0;
      this.stamina = Math.min(100, this.stamina + C.pitStaminaRecover * dt);
      this.pitTimer -= dt;
      if (this.pitTimer <= 0 && this.servingStopGo) {
        // STOP & GO 消化：作業はせず（蹄鉄はそのまま）発進
        this.servingStopGo = false;
        this.stopGoPending = false;
        this.serviced = true;
        this.pitRequested = false;
        this.pitPhase = 'lane';
        this.onStopGoServed?.(this);
      } else if (this.pitTimer <= 0) {
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
      // 疲れているほどムチへの反応が鈍い
      this.whipPower = C.whipTiredEffect + (1 - C.whipTiredEffect) * (this.stamina / 100);
      this.whipBoost = C.whipDuration;
      this.whipCooldown = C.whipCooldown;
      this.whipAnim = 1;
      this.stamina = Math.max(0, this.stamina - C.whipStaminaCost);
      this.whipsThisLap++;
      // 叩いた瞬間にグッと伸びる
      this.speed += C.whipImpulse * this.whipPower * this.style.whipPower;
      // 1 周 5 回目以降のムチは 1 回ごとに +5 秒
      if (this.whipsThisLap >= C.whipPenaltyCount) {
        this.penaltySeconds += C.whipPenaltySeconds;
        this.onPenalty?.(this, C.whipPenaltySeconds, 'EXCESSIVE WHIP');
      }
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

    let accel = C.accelBase + st.power * C.accelPerStat;
    if (this.whipBoost > 0) accel *= 1 + (C.whipAccelMultiplier - 1) * this.whipPower * this.style.whipPower;
    if (this.startBoost > 0) accel *= C.rocketAccelMultiplier;
    if (!canRace) {
      // スタート前は停止、ゴール後はキャンター程度までゆっくり落とす
      this.speed = this.finished ? approach(this.speed, 6, C.brakeDecel * 0.4 * dt) : 0;
    } else if (this.pitPhase === 'lane' || c.accelerate) {
      // ピットレーンは自動走行（リミッター速度まで加速）
      if (this.speed < cap) this.speed = Math.min(cap, this.speed + accel * dt);
    } else if (c.brake) {
      this.speed -= C.brakeDecel * dt;
    } else {
      // ペースを落とした時は目標の巡航速度までゆっくり下げる（ムチの効き目がある間は惰性で伸びを残す）
      const easing = c.targetSpeed !== undefined && this.whipBoost <= 0 && this.speed > c.targetSpeed + 0.3;
      this.speed -= (easing ? C.paceEaseDecel : C.coastDecel) * dt;
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
      // ペース：ハイペースは消耗が増え、折り合うと回復しやすい
      const pace = PACE_LEVELS[this.paceLevel];
      if (rate > 0) {
        // スリップストリーム中は風よけで消耗が大きく減る
        // 脚質：逃げ・先行はハイペースでも消耗が少なく、差し・追込は道中に消耗しやすい
        const styleDrain = this.paceLevel === 'high' ? this.style.highPaceDrain : this.style.cruiseDrain;
        rate *= pace.drain * styleDrain * C.staminaDrainScale * this.staminaScale * (1 - C.slipstreamDrainCut * this.slipstream);
      } else rate = Math.max(-C.staminaRecoverMax * pace.recover, rate * 0.5 * pace.recover);
      this.stamina = Math.min(100, Math.max(0, this.stamina - rate * dt));
    }

    // --- 前進（内側ほど同じ速さで s が進む = インコースが有利） ---
    const k = track.curvatureAt(this.s);
    const ds = (this.speed * dt) / mpb / Math.max(0.5, 1 - k * this.lateral);
    const prevS = this.s;
    this.s = track.wrap(this.s + ds);
    this.distance += ds;
    this.gallopPhase += ds * mpb * C.gallopPhasePerMeter;
    this.shoeWear = Math.min(1, this.shoeWear + (ds / track.length) * HORSESHOES[this.shoe].wearPerLap * this.shoeWearScale);

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
      // 本コース上だけ進路を取れる。ラチぎりぎりまで寄れるが、越えたら柵に衝突（落馬判定は Race で）。
      // 内ラチが開いているピット出入口だけは、コースの端で止まる
      const grip = Math.min(1, this.speed / 6);
      this.lateral += c.steer * (C.steerRate / mpb) * grip * dt;
      const over = this.crashLimit + 0.05;
      const innerLimit = track.innerRailOpenAt(this.s) ? half - 0.2 : over;
      this.lateral = Math.max(-over, Math.min(innerLimit, this.lateral));
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
      // STOP & GO なら作業なしで決められた時間だけ停止。それ以外は蹄鉄交換
      this.servingStopGo = this.stopGoPending;
      // 作業時間はコンストラクターのピットクルーの腕（と騎手の戦略値を少し）で決まる
      const work = C.pitWorkBase - constructorOf(this.entry).pitCrew * C.pitCrewPerPoint - this.entry.jockey.strategy * C.pitWorkPerStat;
      this.pitTimer = this.servingStopGo ? C.stopGoSeconds : work;
    }
  }
}

function approach(value: number, target: number, maxStep: number): number {
  if (Math.abs(target - value) <= maxStep) return target;
  return value + Math.sign(target - value) * maxStep;
}
