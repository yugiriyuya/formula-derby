import type { CourseTrack } from '../course/CourseTrack';
import type { TrackCondition } from '../data/horseshoes';
import { CONSTRUCTORS, teammateIndex, type EntryData } from '../data/roster';
import { AIController, type AIContext } from './AIController';
import type { TurfWear } from './TurfWear';
import { RACE_CONFIG } from './raceConfig';
import { NO_CONTROLS, RaceHorse, type HorseControls } from './RaceHorse';
import { SafetyHorse } from './SafetyHorse';

export type RacePhase = 'countdown' | 'running' | 'finished';

/** HUD に一時的に出すお知らせ */
export interface RaceMessage {
  text: string;
  until: number;
  /** penalty = 赤い警告として表示 */
  kind?: 'penalty';
}

/** ペナルティ・落馬などの出来事（画面上部に警告として出す） */
export interface RaceIncident {
  horse: RaceHorse;
  text: string;
  /** 演出用の時刻（Race.clock） */
  at: number;
}

/** リザルト画面の 1 行（次のフェーズで表示する） */
export interface RaceResultRow {
  /** 着順（ゴール前は途中順位、落馬は null） */
  position: number | null;
  status: 'FINISHED' | 'RUNNING' | 'PIT RETURN';
  postNumber: number;
  horseName: string;
  jockeyName: string;
  constructorId: string;
  /** 単勝オッズ（倍）と人気順 */
  odds: number;
  popularity: number;
  /** ペナルティ込みのタイム（秒）。ゴール前・落馬は null */
  time: number | null;
  penaltySeconds: number;
  /** ファステストラップ（秒）と何周目か。レース全体の最速なら isFastestLap */
  fastestLap: number | null;
  fastestLapNumber: number | null;
  isFastestLap: boolean;
  /** 追い抜き回数 */
  overtakes: number;
  pitStops: number;
}

/** スタートゲートの 1 枠 */
export interface GateSlot {
  /** 枠番（1 = 最内） */
  post: number;
  /** 前扉の位置（s, ブロック） */
  frontS: number;
  lateral: number;
  /** 枠の幅（ブロック） */
  width: number;
}

/** ゲートの奥行き（ブロック） */
export const GATE_STALL_LENGTH = 2.6;
/** 外枠ほど何 m ずつ後ろに下がるか（外枠ほど走る距離が長くなる斜めゲート） */
const GATE_STEP_M = 1.5;
/** 馬同士が重ならないための大きさ（ブロック） */
const HORSE_LENGTH = 2.4;
const HORSE_WIDTH = 0.95;
/** ギャップ計測の計測点の間隔（ブロック） */
const CHECKPOINT = 5;
const CHECKPOINT_ORIGIN = 100;

/**
 * シンプルレース（規定周回）の進行管理。
 * 出走表の全頭を斜めゲートに並べ、プレイヤー以外は AI が操作する。
 */
export class Race {
  /** countdown = スタート前（F1 式の赤ランプが点灯していく間） */
  phase: RacePhase = 'countdown';
  /** レース経過時間（スタート＝ブラックアウトからの秒） */
  time = 0;
  /** スタート前の経過時間と、ブラックアウト（全消灯）する時刻 */
  private startClock = 0;
  private lightsOutAt = 0;
  condition: TrackCondition = 'good';
  /** プレイヤーが操作する馬。観戦モードでは null（全頭 AI） */
  player: RaceHorse | null = null;
  /** カメラ・HUD が注目している馬（シンプルレースでは常にプレイヤーの馬） */
  focus!: RaceHorse;
  readonly horses: RaceHorse[] = [];
  readonly ai = new Map<RaceHorse, AIController>();
  /** 枠番順のゲート */
  gate: GateSlot[] = [];
  /** 順位順の馬（毎フレーム更新） */
  standings: RaceHorse[] = [];
  message: RaceMessage | null = null;
  /** 馬場の荒れ度（main で設定。null なら荒れない） */
  wear: TurfWear | null = null;
  /** ペナルティ・落馬などの出来事（画面上部の警告表示用。at は演出用の時刻） */
  incidents: RaceIncident[] = [];
  /** 芦毛のセーフティホース */
  readonly safety: SafetyHorse;
  /** 演出用の経過時間（カウントダウン中も進む） */
  clock = 0;
  /** 計測点ごとの通過時刻（ギャップ計算用） */
  private readonly splits = new Map<RaceHorse, number[]>();
  /** 同じ 2 頭の接触で続けてペナルティを出さないための記録 */
  private readonly contactTimes = new Map<string, number>();
  /** 前のフレームで触れていた 2 頭の組 */
  private touchingPairs = new Set<string>();

  constructor(
    readonly track: CourseTrack,
    readonly laps: number,
    entries: readonly EntryData[],
    playerEntryId: string | null,
  ) {
    this.safety = new SafetyHorse(track);
    for (const e of entries) {
      const garageIndex = CONSTRUCTORS.findIndex((c) => c.id === e.constructorId);
      // 僚馬は同じ厩舎の前で、少し前後にずらして止まる
      const boxOffset = (teammateIndex(e) === 0 ? -1 : 1) * (3.5 / track.def.metersPerBlock);
      const h = new RaceHorse(track, e, garageIndex, CONSTRUCTORS.length, boxOffset);
      h.onCrossLine = (horse) => this.handleCrossLine(horse);
      h.onPitComplete = (horse, from, to) => {
        if (horse === this.focus) this.notify(`蹄鉄交換完了 ${from} → ${to}`, 2.5);
      };
      h.onPenalty = (horse, seconds, reason) =>
        this.report(horse, `PENALTY +${seconds}s: ${reason} — ${horse.postNumber}番 ${horse.entry.horse.name}`);
      h.onStopGoServed = (horse) => {
        if (horse === this.focus) this.notify('STOP & GO 消化', 2.5);
      };
      this.horses.push(h);
    }
    this.configure(playerEntryId);
  }

  /**
   * 誰をプレイヤーが操作するかを決めて、レースを最初からやり直す。
   * @param playerEntryId 操作する馬。null なら観戦モード（全頭 AI）
   */
  configure(playerEntryId: string | null) {
    this.player = playerEntryId ? (this.horses.find((h) => h.entry.id === playerEntryId) ?? null) : null;
    this.ai.clear();
    for (const h of this.horses) if (h !== this.player) this.ai.set(h, new AIController(h));
    this.focus = this.player ?? this.horses[0];
    this.restart();
  }

  get spectating(): boolean {
    // 観戦モード、またはシンプルレースで自分の馬が落馬して観戦に切り替わった
    return this.player === null || this.player.retired;
  }

  restart() {
    this.phase = 'countdown';
    this.startClock = 0;
    const C = RACE_CONFIG;
    // 5 つ点灯した後、ランダムな間を置いてブラックアウト
    this.lightsOutAt =
      C.startLightsDelay + 4 * C.startLightsInterval + C.lightsOutHoldMin + Math.random() * (C.lightsOutHoldMax - C.lightsOutHoldMin);
    this.time = 0;
    this.message = null;
    this.incidents = [];
    this.contactTimes.clear();
    this.touchingPairs.clear();
    this.safety.reset();
    this.wear?.reset();
    this.buildGate();

    // 枠順（馬番）は毎レース抽選
    const order = shuffle([...this.horses], Math.random);
    order.forEach((h, i) => {
      const slot = this.gate[i];
      h.reset(slot.frontS - GATE_STALL_LENGTH / 2, slot.lateral);
      h.postNumber = slot.post;
    });

    // AI の作戦（ピットに入る周など）。僚馬同士は別の周にピットインする
    const pitLaps = new Map<string, number>();
    for (const [h, ai] of this.ai) {
      ai.plan(this.laps, Math.random, pitLaps.get(h.entry.constructorId) ?? null);
      pitLaps.set(h.entry.constructorId, ai.pitLap);
    }
    for (const h of this.horses) this.splits.set(h, []);
    this.standings = [...this.horses];
    this.updateStandings();
    this.setOdds();
  }

  /** 枠番 1（最内）から外へ、外枠ほど少しずつ後ろに下がる斜めのゲート */
  private buildGate() {
    const def = this.track.def;
    const mpb = def.metersPerBlock;
    const n = this.horses.length;
    const half = def.trackWidth / 2;
    const width = Math.min(1.75, (def.trackWidth - 3) / n);
    const front0 = def.finishS - RACE_CONFIG.startBehindLine / mpb;
    this.gate = Array.from({ length: n }, (_, k) => ({
      post: k + 1,
      frontS: this.track.wrap(front0 - (k * GATE_STEP_M) / mpb),
      lateral: half - 1.5 - width / 2 - k * width,
      width,
    }));
  }

  /** 枠番（ゲートの何番に入ったか） */
  postOf(h: RaceHorse): number {
    return h.postNumber;
  }

  /** 点灯している赤ランプの数（0〜5）。ブラックアウト後は 0 */
  get lightsOn(): number {
    if (this.phase !== 'countdown') return 0;
    const C = RACE_CONFIG;
    return Math.max(0, Math.min(5, Math.floor((this.startClock - C.startLightsDelay) / C.startLightsInterval) + 1));
  }

  /** 表示用の現在周回（1〜laps）。注目している馬の周回 */
  get currentLap(): number {
    return Math.min(this.laps, this.focus.lapsCompleted + 1);
  }

  get lastLapTime(): number | null {
    const t = this.focus.lapTimes;
    return t.length ? t[t.length - 1] : null;
  }

  get bestLapTime(): number | null {
    const t = this.focus.lapTimes;
    return t.length ? Math.min(...t) : null;
  }

  /** 現在の順位（1〜） */
  positionOf(h: RaceHorse): number {
    return this.standings.indexOf(h) + 1;
  }

  notify(text: string, seconds: number, kind?: 'penalty') {
    this.message = { text, until: this.clock + seconds, kind };
  }

  get activeMessageKind(): 'penalty' | undefined {
    return this.message && this.message.until > this.clock ? this.message.kind : undefined;
  }

  get activeMessage(): string | null {
    return this.message && this.message.until > this.clock ? this.message.text : null;
  }

  update(dt: number, playerControls: HorseControls) {
    this.clock += dt;
    if (this.phase === 'countdown') {
      this.startClock += dt;
      if (this.startClock >= this.lightsOutAt) this.lightsOut();
    } else if (this.phase === 'running') {
      this.time += dt;
    }

    // セーフティホース：出動・先導・帰還。出動中は全馬 50km/h・追い越し禁止
    if (this.phase === 'running') {
      this.safety.update(dt, this.runningField(), this.clock);
    }
    this.applySafetyRules();

    // STOP & GO を科された馬は、次のピット入口で必ずピットに入る
    for (const h of this.horses) if (h.stopGoPending && !h.pitRequested && !h.inPit && !h.retired) h.pitRequested = true;

    this.detectSlipstream();
    this.readGround();
    const ctx: AIContext = {
      horses: this.horses,
      laps: this.laps,
      condition: this.condition,
      time: this.time,
      wearAt: (s, lateral) => this.wearAt(s, lateral),
      safety: this.safety,
      packProgress: this.packProgress(),
    };
    for (const h of this.horses) {
      // ゲートを出るまでは真っすぐ走る（隣の枠にぶつからないように）
      h.steerLocked = h.lapsCompleted === 0 && h.lineCrossings === 0 && h.distance < GATE_STALL_LENGTH + 1.5;
      const ai = this.ai.get(h);
      const controls = h.retired ? NO_CONTROLS : ai ? ai.decide(dt, ctx) : playerControls;
      h.update(dt, controls, this.phase === 'running' && !h.finished, this.condition);
    }
    this.separate();
    this.checkRailCrashes();
    this.trampleTurf();
    this.recordSplits();
    const before = new Map(this.standings.map((h, i) => [h, i]));
    this.updateStandings();
    this.countOvertakes(before);
  }

  /** コース上を走っている馬（落馬・ゴール・ピットレーンの馬を除く）を順位順に */
  private runningField(): RaceHorse[] {
    return this.standings.filter((h) => !h.retired && !h.finished && !h.inPit);
  }

  /** 馬群の中心（コース上を走っている馬の進み具合の中央値）。AI が馬群に合わせてペースを調整するのに使う */
  private packProgress(): number {
    const f = this.runningField();
    if (f.length === 0) return 0;
    return f[Math.floor(f.length / 2)].progress;
  }

  /**
   * 追い抜きを数える：前のフレームより順位が上がった馬が、コース上で走っている馬を抜いた分だけ。
   * ピット・落馬・ゴールで順位が入れ替わった分と、スタート直後（3 秒）は数えない。
   */
  private countOvertakes(before: Map<RaceHorse, number>) {
    if (this.phase !== 'running' || this.time < 3) return;
    const racing = (h: RaceHorse) => !h.inPit && !h.retired && !h.finished && h.pitPhase !== 'approach';
    this.standings.forEach((h, now) => {
      const was = before.get(h)!;
      if (now >= was || !racing(h)) return;
      for (const o of this.standings) {
        if (o === h || !racing(o)) continue;
        // 前は o が上、今は h が上 → h が o を抜いた
        if (before.get(o)! < was && this.standings.indexOf(o) > now) h.overtakes++;
      }
    });
  }

  /**
   * 単勝オッズと人気を決める（レース前）。能力値と騎手の戦略値から強さを出し、勝つ確率に換算する。
   * 控除率 20%（払戻 80%）でオッズにする。毎レース少しだけ人気が揺れる。
   */
  private setOdds() {
    const strength = this.horses.map((h) => {
      const st = h.entry.horse.stats;
      const r = st.speed * 1.0 + st.stamina * 0.55 + st.power * 0.45 + st.intelligence * 0.35 + h.entry.jockey.strategy * 0.3;
      return r + (Math.random() - 0.5) * 0.8;
    });
    const weights = strength.map((r) => Math.exp(r / 1.1));
    const total = weights.reduce((a, b) => a + b, 0);
    this.horses.forEach((h, i) => {
      const p = weights[i] / total;
      h.odds = Math.max(1.1, Math.round((0.8 / p) * 10) / 10);
    });
    [...this.horses].sort((a, b) => a.odds - b.odds).forEach((h, i) => (h.popularity = i + 1));
  }

  /**
   * リザルト画面用のデータ（着順 → 途中順位 → 落馬の順）。次のフェーズでこれを表示する。
   */
  results(): RaceResultRow[] {
    const fastest = this.fastestLapHolder();
    return this.standings.map((h) => {
      const fl = h.fastestLap;
      return {
        position: h.retired ? null : (h.finishPosition ?? this.positionOf(h)),
        status: h.retired ? 'PIT RETURN' : h.finished ? 'FINISHED' : 'RUNNING',
        postNumber: h.postNumber,
        horseName: h.entry.horse.name,
        jockeyName: h.entry.jockey.name,
        constructorId: h.entry.constructorId,
        odds: h.odds,
        popularity: h.popularity,
        time: this.correctedTime(h),
        penaltySeconds: h.penaltySeconds,
        fastestLap: fl?.time ?? null,
        fastestLapNumber: fl?.lap ?? null,
        isFastestLap: h === fastest,
        overtakes: h.overtakes,
        pitStops: h.pitCount,
      };
    });
  }

  /** レース全体のファステストラップを出した馬 */
  fastestLapHolder(): RaceHorse | null {
    let best: RaceHorse | null = null;
    for (const h of this.horses) {
      const fl = h.fastestLap;
      if (fl && (!best || fl.time < best.fastestLap!.time)) best = h;
    }
    return best;
  }

  /** 出来事を記録して画面上部に警告を出す。注目している馬なら画面中央にも赤く出す */
  private report(horse: RaceHorse, text: string) {
    this.incidents.push({ horse, text, at: this.clock });
    if (horse === this.focus) this.notify(text, 3, 'penalty');
  }

  /**
   * セーフティホース中のルール：全馬 50km/h 制限、前の馬（または SC）に詰まったらそれ以上速く走れない（追い越し禁止）。
   * 後ろの馬は 50km/h で、先導する SC（38km/h）とその後ろの隊列に追いついて 1 列にまとまる。
   */
  private applySafetyRules() {
    for (const h of this.horses) h.speedCap = Infinity;
    if (!this.safety.restricting) return;
    const C = RACE_CONFIG;
    const mpb = this.track.def.metersPerBlock;
    const field = this.horses.filter((h) => !h.retired && !h.finished && !h.inPit);
    for (const h of field) {
      let nearest = Infinity;
      let aheadSpeed = 0;
      for (const o of field) {
        if (o === h) continue;
        const gap = this.track.diff(o.s, h.s) * mpb;
        if (gap > 0 && gap < nearest) {
          nearest = gap;
          aheadSpeed = o.speed;
        }
      }
      if (this.safety.onTrack) {
        const gap = this.track.diff(this.safety.s, h.s) * mpb;
        if (gap > 0 && gap < nearest) {
          nearest = gap;
          aheadSpeed = this.safety.speed;
        }
      }
      let cap = C.scSpeedLimit;
      // 詰まりすぎたら少し下がって間隔を空ける
      if (nearest < C.scQueueGap) cap = Math.min(cap, aheadSpeed * (nearest < C.scQueueGap * 0.6 ? 0.9 : 1));
      h.speedCap = cap;
    }
  }

  /**
   * ラチへの衝突 = 落馬。馬の中心がラチから（馬体の半幅＋支柱の半幅）より近づいたらリタイア。
   * 内ラチが開いているピット出入口では、コースの端で止まるだけ。
   * 直前に他馬に接触・押し出されていたら、その馬に STOP & GO。
   */
  private checkRailCrashes() {
    if (this.phase !== 'running') return;
    for (const h of this.horses) {
      if (h.retired || h.finished || (h.pitPhase !== 'none' && h.pitPhase !== 'approach')) continue;
      const lim = h.crashLimit;
      const innerOpen = this.track.innerRailOpenAt(h.s);
      if (h.lateral > lim && innerOpen) {
        h.lateral = Math.min(h.lateral, this.track.def.trackWidth / 2 - 0.2);
        continue;
      }
      if (h.lateral < -lim || h.lateral > lim) this.crash(h);
    }
  }

  private crash(h: RaceHorse) {
    const C = RACE_CONFIG;
    h.retire(this.time);
    this.report(h, `落馬 — ${h.postNumber}番 ${h.entry.horse.name} PIT RETURN`);
    // 接触・押し出しで落馬させた馬：STOP & GO（直前の接触ペナルティ +10s はこれに置き換える）
    const by = h.lastHitBy;
    if (by && !by.retired && this.clock - h.lastHitAt < C.crashBlameWindow) {
      const lp = by.lastContactPenalty;
      if (lp && lp.victim === h && this.clock - lp.at < C.crashBlameWindow) {
        by.penaltySeconds -= C.contactPenaltySeconds;
        by.lastContactPenalty = null;
      }
      by.giveStopAndGo();
      this.report(by, `STOP & GO: CAUSED CRASH — ${by.postNumber}番 ${by.entry.horse.name}`);
    }
    if (this.horses.every((x) => x.finished || x.retired)) this.endRace();
    else this.safety.deploy();
  }

  /** 全馬がゴール（またはリタイア）：レース終了。セーフティホースも引き上げる */
  private endRace() {
    this.phase = 'finished';
    this.safety.reset();
  }

  /** 接触：加害側に +10s。相手には「誰にぶつけられたか」を記録（ラチに押し出された時の判定用） */
  private contact(aggressor: RaceHorse, victim: RaceHorse) {
    const C = RACE_CONFIG;
    victim.lastHitBy = aggressor;
    victim.lastHitAt = this.clock;
    const key = pairKey(aggressor, victim);
    const last = this.contactTimes.get(key) ?? -Infinity;
    if (this.clock - last < C.contactCooldown) return;
    this.contactTimes.set(key, this.clock);
    aggressor.penaltySeconds += C.contactPenaltySeconds;
    aggressor.lastContactPenalty = { victim, at: this.clock };
    this.report(aggressor, `PENALTY +${C.contactPenaltySeconds}s: COLLISION — ${aggressor.postNumber}番 ${aggressor.entry.horse.name}`);
  }

  /** コース上の (s, lateral) 地点の荒れ度 */
  wearAt(s: number, lateral: number): number {
    if (!this.wear) return 0;
    const p = this.track.frameAt(s, lateral).position;
    return this.wear.at(p.x, p.z);
  }

  /**
   * スリップストリーム判定：前の馬の真後ろ（1.5〜14m 後ろ・横のずれ 1.6m 以内）にいるか。
   * ピットレーン・ゴール後・低速では発動しない。
   */
  private detectSlipstream() {
    const C = RACE_CONFIG;
    const mpb = this.track.def.metersPerBlock;
    const onTrack = this.horses.filter((h) => !h.inPit && !h.finished && !h.retired);
    for (const h of this.horses) {
      // セーフティホース中は速度制限があるので発動しない
      h.slipstreamTarget =
        this.phase === 'running' &&
        !this.safety.restricting &&
        h.pitPhase === 'none' &&
        !h.finished &&
        !h.retired &&
        h.speed > C.slipstreamMinSpeed &&
        onTrack.some((o) => {
          if (o === h) return false;
          const gap = this.track.diff(o.s, h.s) * mpb;
          return gap > C.slipstreamMinGap && gap < C.slipstreamMaxGap && Math.abs(o.lateral - h.lateral) * mpb < C.slipstreamWidth;
        });
    }
  }

  /** 各馬の足元の荒れ度を入れる（速度に影響） */
  private readGround() {
    for (const h of this.horses) h.groundWear = h.inPit ? 0 : this.wearAt(h.s, h.lateral);
  }

  /**
   * 走った跡を荒らす：馬が新しいマスに踏み込むたびに、そのマスの荒れ度を少し上げる。
   * 蹄は馬体の幅に広がるので、左右のマスも少し（60%）荒らす。
   */
  private trampleTurf() {
    const wear = this.wear;
    if (!wear || this.phase === 'countdown') return;
    const half = this.track.def.trackWidth / 2;
    const step = RACE_CONFIG.turfWearPerStep;
    for (const h of this.horses) {
      if (h.inPit || h.retired || h.speed < 0.5 || Math.abs(h.lateral) > half) continue;
      const f = this.track.frameAt(h.s, h.lateral);
      const cell = wear.index(f.position.x, f.position.z);
      if (cell === h.lastWearCell) continue;
      h.lastWearCell = cell;
      wear.add(cell, step);
      for (const side of [-0.75, 0.75]) {
        const x = f.position.x + f.right.x * side;
        const z = f.position.z + f.right.z * side;
        const c = wear.index(x, z);
        if (c !== cell && Math.abs(h.lateral + side) <= half) wear.add(c, step * 0.6);
      }
    }
  }

  /** ペナルティ込みのゴールタイム */
  correctedTime(h: RaceHorse): number | null {
    return h.finishTime === null ? null : h.finishTime + h.penaltySeconds;
  }

  /** ブラックアウト：ゲートが開き、各馬の発馬（好スタート／普通／出遅れ）が決まる */
  private lightsOut() {
    this.phase = 'running';
    for (const h of this.horses) h.rollStart(Math.random);
    const r = this.focus.startResult;
    this.notify(r === 'rocket' ? 'ロケットスタート！' : r === 'late' ? '出遅れ…！' : 'スタート！', 1.6);
  }

  /**
   * 馬同士が重ならないようにする（すり抜け防止）と、接触の判定。
   *  - 横に並んで重なった：左右に押し分ける。相手に向かって横に動いていた側が加害側
   *  - 後ろから追突した：後ろの馬が前の馬の速さまで落とす。速度差が大きければ追突した側が加害側
   * 押し分けはラチで止めない（ラチの外まで押し出されたら checkRailCrashes で落馬）。
   * ピットレーン走行中・ゴール後・落馬した馬は対象外。
   */
  private separate() {
    const C = RACE_CONFIG;
    const running = this.phase === 'running';
    const active = this.horses.filter(
      (h) => (h.pitPhase === 'none' || h.pitPhase === 'approach') && !h.finished && !h.retired,
    );
    // 接触ペナルティは「触れ始めた瞬間」だけ判定する（並走で触れ続けている間は数えない）
    const touching = new Set<string>();
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i];
        const b = active[j];
        const ds = this.track.diff(b.s, a.s);
        const dl = b.lateral - a.lateral;
        if (Math.abs(ds) >= HORSE_LENGTH || Math.abs(dl) >= HORSE_WIDTH) continue;
        const key = pairKey(a, b);
        touching.add(key);
        const newContact = !this.touchingPairs.has(key);
        const dir = dl !== 0 ? Math.sign(dl) : i % 2 === 0 ? 1 : -1;
        const overlap = HORSE_WIDTH - Math.abs(dl);
        if (Math.abs(ds) < HORSE_LENGTH * 0.55) {
          // 横からの接触：相手の方へ横に動いていた速さ（m/s）を比べる
          const aToward = a.lateralVelocity * dir;
          const bToward = -b.lateralVelocity * dir;
          const pusher = aToward >= bToward ? a : b;
          const victim = pusher === a ? b : a;
          const pushSpeed = Math.max(aToward, bToward);
          if (running && pushSpeed > 0.3) {
            victim.lastHitBy = pusher;
            victim.lastHitAt = this.clock;
          }
          if (running && newContact && pushSpeed >= C.contactSideSpeed) this.contact(pusher, victim);
          // ぶつけに行った側は押し返されにくい（相手が多く押し出される）
          const share = pushSpeed > 0.3 ? 0.7 : 0.5;
          const aMove = pusher === a ? 1 - share : share;
          a.lateral -= dir * overlap * aMove;
          b.lateral += dir * overlap * (1 - aMove);
        } else {
          const front = ds > 0 ? b : a;
          const rear = ds > 0 ? a : b;
          if (running && newContact && rear.speed - front.speed >= C.contactRearSpeed) this.contact(rear, front);
          rear.speed = Math.min(rear.speed, front.speed * 0.99);
          const away = rear === a ? -dir : dir;
          rear.lateral += away * overlap * 0.15;
        }
      }
    }
    this.touchingPairs = touching;
  }

  /** 計測点を通過した時刻を記録する（前の馬・トップとのタイム差に使う） */
  private recordSplits() {
    for (const h of this.horses) {
      if (h.finished || h.retired) continue;
      const list = this.splits.get(h)!;
      const idx = Math.floor((h.progress + CHECKPOINT_ORIGIN) / CHECKPOINT);
      while (list.length <= idx) list.push(this.time);
    }
  }

  private updateStandings() {
    this.standings.sort((a, b) => {
      // 落馬（リタイア）した馬は一番下。後から落馬した馬ほど上
      if (a.retired || b.retired) {
        if (!a.retired) return -1;
        if (!b.retired) return 1;
        return b.retireTime - a.retireTime;
      }
      if (a.finishTime !== null || b.finishTime !== null) {
        if (a.finishTime === null) return 1;
        if (b.finishTime === null) return -1;
        // ゴールした馬はペナルティを加えたタイム順
        return this.correctedTime(a)! - this.correctedTime(b)!;
      }
      return b.progress - a.progress;
    });
  }

  /**
   * ref（トップや前の馬）とのタイム差。
   * 同じ計測点を通過した時刻の差。周回遅れなら laps に周回数を入れて返す。
   */
  gapTo(h: RaceHorse, ref: RaceHorse): { seconds: number; laps: number } | null {
    if (h === ref || h.retired) return null;
    if (h.finishTime !== null && ref.finishTime !== null) {
      return { seconds: this.correctedTime(h)! - this.correctedTime(ref)!, laps: 0 };
    }
    const lapsBehind = Math.floor((ref.progress - h.progress) / this.track.length);
    if (lapsBehind >= 1 && ref.finishTime === null) return { seconds: 0, laps: lapsBehind };
    const mine = this.splits.get(h)!;
    const theirs = this.splits.get(ref)!;
    const idx = mine.length - 1;
    if (idx < 0 || idx >= theirs.length) return { seconds: 0, laps: 0 };
    return { seconds: Math.max(0, mine[idx] - theirs[idx]), laps: 0 };
  }

  private handleCrossLine(horse: RaceHorse) {
    // スタート直後の通過（ゲートがゴール板の手前）は周回に数えない
    if (horse.lapsCompleted === 0) return;

    horse.lapTimes.push(this.time - horse.lapStartTime);
    horse.lapStartTime = this.time;
    horse.startNewLap();

    if (horse.lapsCompleted >= this.laps) {
      horse.finished = true;
      horse.finishTime = this.time;
      // STOP & GO を消化しないままゴールしたら、タイムに加算
      if (horse.stopGoPending) {
        horse.stopGoPending = false;
        horse.pitRequested = false;
        horse.penaltySeconds += RACE_CONFIG.unservedStopGoPenalty;
        this.report(horse, `PENALTY +${RACE_CONFIG.unservedStopGoPenalty}s: STOP & GO NOT SERVED — ${horse.postNumber}番 ${horse.entry.horse.name}`);
      }
      // 着順はペナルティ込みのタイムで決める（後からゴールした馬に抜かれることもある）
      const finished = this.horses.filter((h) => h.finishTime !== null);
      finished.sort((a, b) => this.correctedTime(a)! - this.correctedTime(b)!);
      finished.forEach((h, i) => (h.finishPosition = i + 1));
      if (horse === this.focus) {
        const pen = horse.penaltySeconds > 0 ? `（ペナルティ +${horse.penaltySeconds}s 込み）` : '';
        this.notify(`FINISH! ${horse.finishPosition}着${pen}`, 4);
      }
      if (this.horses.every((h) => h.finished || h.retired)) this.endRace();
    } else if (horse === this.focus) {
      if (horse.lapsCompleted === this.laps - 1) this.notify('ファイナルラップ！', 2.5);
      else this.notify(`LAP ${horse.lapsCompleted + 1}/${this.laps}`, 2);
    }
  }
}


/** 2 頭の組を表すキー（順番によらない） */
function pairKey(a: RaceHorse, b: RaceHorse): string {
  return a.postNumber < b.postNumber ? `${a.postNumber}-${b.postNumber}` : `${b.postNumber}-${a.postNumber}`;
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
