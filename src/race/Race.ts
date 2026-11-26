import type { CourseTrack } from '../course/CourseTrack';
import { bestShoe, type TrackCondition } from '../data/horseshoes';
import { teammateIndex, teamsOf, type ConstructorData, type EntryData } from '../data/roster';
import { AIController, type AIContext } from './AIController';
import type { TurfWear } from './TurfWear';
import { RACE_CONFIG, raceFormat, type RaceFormat } from './raceConfig';
import { NO_CONTROLS, RaceHorse, type HorseControls, type PitWorkResult } from './RaceHorse';
import { SafetyHorse, type SafetyState } from './SafetyHorse';
import { ReplayRecorder } from './ReplayRecorder';
import { computeOddsMatrix, type OddsMatrix } from '../betting/odds';

export type RacePhase = 'countdown' | 'running' | 'finished';
export type Weather = 'sunny' | 'rain';

/** HUD に一時的に出すお知らせ */
export interface RaceMessage {
  text: string;
  until: number;
  /** penalty = 赤い警告として表示 */
  kind?: 'penalty';
}

/** ペナルティ・落馬などの出来事（画面上部に警告として出す） */
/**
 * レースの節目の出来事（実況テロップ・効果音が読む）。
 *  start: スタート / crash: 落馬 / safety: セーフティホース出動 / green: レース再開 / final400: 最後の直線・残り 400m
 *  leadChange: ファイナルラップの先頭交代 / finish: ゴール（position = 着順） / penalty: ペナルティ
 *  lapLeader: 周回ごとのゴール板通過（先頭の馬） / breakaway: 大逃げ（先頭が 2 番手を大きく離す）
 *  tailOff: 最後方の馬が馬群から離された / mark1000: 先頭が残り 1000m 標識を通過（value = 先頭〜最後方の馬身）
 */
export type RaceEventType =
  | 'start' | 'crash' | 'safety' | 'green' | 'final400' | 'leadChange' | 'finish' | 'penalty'
  | 'lapLeader' | 'breakaway' | 'tailOff' | 'mark1000' | 'pitStop';
export interface RaceEvent {
  type: RaceEventType;
  horse?: RaceHorse;
  /** finish の着順、final400 の 2 番手との差（秒）、mark1000 の馬身、breakaway / tailOff の差（m）など */
  value?: number;
  /** lapLeader：何周目を通過したか・その周のラップ・スタートからの経過（秒） */
  lap?: number;
  lapTime?: number;
  elapsed?: number;
  /** crash：落馬の原因（rail = ラチに衝突、stamina = スタミナ切れ） */
  cause?: 'rail' | 'stamina';
  /** pitStop：蹄鉄交換の出来（value = 作業時間 秒） */
  pit?: PitWorkResult;
  /** 演出用の時刻（Race.clock） */
  at: number;
}

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
  /** DNF = 柵に接触して落馬・リタイア */
  status: 'FINISHED' | 'RUNNING' | 'DNF';
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
  /** ピットで消化したペナルティ（秒。タイムには含まない） */
  penaltyServed: number;
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
  /** 天候（雨なら芝が湿って condition = heavy） */
  weather: Weather = 'sunny';
  /** 風（fromDeg = 吹いてくる方角, speed = m/s, x / z = 風が吹いていく向きの速度ベクトル） */
  wind = { fromDeg: 0, speed: 0, x: 0, z: 0 };
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
  /** 節目の出来事（実況・効果音用）と、ゴール前リプレイの記録 */
  events: RaceEvent[] = [];
  readonly replay = new ReplayRecorder();
  private lastLeader: RaceHorse | null = null;
  private lastLeadChangeAt = -Infinity;
  private final400Fired = false;
  private lastSafetyState: SafetyState = 'idle';
  /** 周回通過の実況を出した周回数・残り 1000m 標識を何回通過したか */
  private lapAnnounced = 0;
  private mark1000Index: number | null = null;
  /** 大逃げ・最後方が離された実況：出している間（差が縮むまで再び出さない）と最後に出した時刻 */
  private breakawayOn = false;
  private tailOffOn = false;
  private lastBreakawayAt = -Infinity;
  private lastTailOffAt = -Infinity;
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

  /** 周回数に合わせた調整（蹄鉄の摩耗・芝の荒れ・スタミナ・AI のピット作戦） */
  format: RaceFormat;
  /**
   * 予選の結果で決めた枠順（先頭 = 1 枠 = 最内）。null なら毎レース抽選。
   * 同じ条件で再レースした時もこの並びを使う。
   */
  gridOrder: RaceHorse[] | null = null;
  /** 出走しているコンストラクター（並び = ピットボックスの並び） */
  readonly teams: ConstructorData[];
  /** 設定（エディット）：AI が走らせる馬の能力の倍率と、蹄鉄の摩耗の倍率 */
  aiAbility = 1;
  shoeWearMultiplier = 1;
  /** レース前のオッズ表（ベッティング用。restart のたびに作り直す） */
  oddsMatrix!: OddsMatrix;
  /** 予選のタイムアタック用：AI はピットに入らない */
  noPitStops = false;

  constructor(
    readonly track: CourseTrack,
    public laps: number,
    entries: readonly EntryData[],
    playerEntryId: string | null,
    /** trial = オッズ用の事前シミュレーション（試走）：オッズ表もリプレイも作らない */
    readonly options: { trial?: boolean } = {},
  ) {
    this.format = raceFormat(laps);
    this.safety = new SafetyHorse(track);
    // ピットボックスは出走しているチームの数だけ（並びは CONSTRUCTORS の順）
    this.teams = teamsOf(entries);
    for (const e of entries) {
      const garageIndex = this.teams.findIndex((c) => c.id === e.constructorId);
      // 僚馬は同じ厩舎の前で、少し前後にずらして止まる
      const boxOffset = (teammateIndex(e) === 0 ? -1 : 1) * (3.5 / track.def.metersPerBlock);
      const h = new RaceHorse(track, e, garageIndex, this.teams.length, boxOffset);
      h.onCrossLine = (horse) => this.handleCrossLine(horse);
      h.onPitComplete = (horse, from, to) => {
        const r = horse.pitWorkResult;
        this.emit('pitStop', horse, horse.pitWork, { pit: r ?? undefined });
        if (horse === this.focus) {
          const t = horse.pitWork.toFixed(1);
          const text = r === 'fast' ? `FAST PIT! ${t}秒` : r === 'slow' ? `SLOW PIT… ${t}秒` : `ピット作業 ${t}秒（${from}→${to}）`;
          this.notify(text, 2.8, r === 'slow' ? 'penalty' : undefined);
        }
      };
      h.onPenalty = (horse, seconds, reason) =>
        this.report(horse, `PENALTY +${seconds}s: ${reason} — ${horse.postNumber}番 ${horse.entry.horse.name}`);
      h.onPenaltyServed = (horse, seconds) => {
        if (horse === this.focus) this.notify(`ペナルティ +${seconds}s をピットで消化`, 2.5);
      };
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

  /** 天候を変える（次の restart から有効）。雨は重馬場：RAIN 以外の蹄鉄はグリップが落ちる */
  setWeather(weather: Weather) {
    this.weather = weather;
    const dirt = this.track.def.surface === 'dirt';
    this.condition = dirt ? (weather === 'rain' ? 'dirtHeavy' : 'dirt') : weather === 'rain' ? 'heavy' : 'good';
  }

  /** 風を変える。fromDeg = 風が吹いてくる方角（0 = 北 = -z, 90 = 東 = +x） */
  setWind(fromDeg: number, speed: number) {
    const rad = (fromDeg * Math.PI) / 180;
    // 吹いてくる方角の逆向きへ吹く
    this.wind = { fromDeg: ((fromDeg % 360) + 360) % 360, speed, x: -Math.sin(rad) * speed, z: Math.cos(rad) * speed };
  }

  /** 進行方向の風速（m/s。追い風が +） */
  windAlongAt(s: number): number {
    const d = this.track.frameAt(s).dir;
    return this.wind.x * d.x + this.wind.z * d.z;
  }

  /** 周回数を変える（次の restart から有効）。周回数に合わせて摩耗・スタミナを調整する */
  setLaps(laps: number) {
    this.laps = laps;
    this.format = raceFormat(laps);
    for (const h of this.horses) {
      h.shoeWearScale = this.format.shoeWear * this.shoeWearMultiplier;
      h.staminaScale = this.format.stamina * this.lapLengthStaminaFactor();
    }
  }

  /**
   * 1 周の長さによるスタミナの減り方の補正。スタミナは時間で減るので、長いコース（スパ・バクー）ほど
   * 同じ周回数でも消耗が大きくなる。基準（約 1.8km）の 1 周と同じ割合で減るようにそろえる
   */
  private lapLengthStaminaFactor(): number {
    const lapM = this.track.length * this.track.def.metersPerBlock;
    return Math.min(1.5, Math.max(0.7, RACE_CONFIG.staminaRefLapM / lapM));
  }

  /**
   * ピットボックスの割り当て。garageOrder[i] = ピットレーンの入口側から i 番目のボックスを使うコンストラクター。
   * null なら出走表のコンストラクター順（既定）。予選ありでは、予選の速いチームほど出口に近いボックスになる。
   */
  assignGarages(garageOrder: readonly string[] | null) {
    for (const h of this.horses) {
      const i = garageOrder ? garageOrder.indexOf(h.entry.constructorId) : -1;
      h.assignGarage(i >= 0 ? i : this.teams.findIndex((c) => c.id === h.entry.constructorId));
    }
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
    this.events = [];
    this.replay.reset();
    this.lastLeader = null;
    this.lastLeadChangeAt = -Infinity;
    this.final400Fired = false;
    this.lastSafetyState = 'idle';
    this.lapAnnounced = 0;
    this.mark1000Index = null;
    this.breakawayOn = false;
    this.tailOffOn = false;
    this.lastBreakawayAt = -Infinity;
    this.lastTailOffAt = -Infinity;
    this.contactTimes.clear();
    this.touchingPairs.clear();
    this.safety.reset();
    this.wear?.reset();
    this.buildGate();

    // 枠順（馬番）：予選ありなら予選の順、なしなら毎レース抽選
    const order = this.gridOrder && this.gridOrder.length === this.horses.length ? [...this.gridOrder] : shuffle([...this.horses], Math.random);
    for (const h of this.horses) {
      h.startShoeOverride = null;
      h.shoeWearScale = this.format.shoeWear * this.shoeWearMultiplier;
      h.staminaScale = this.format.stamina * this.lapLengthStaminaFactor();
      // 設定の「AI の強さ」：自分の馬以外（観戦モードでは全頭）
      h.abilityFactor = h === this.player ? 1 : this.aiAbility;
    }
    order.forEach((h, i) => {
      const slot = this.gate[i];
      h.reset(slot.frontS - GATE_STALL_LENGTH / 2, slot.lateral);
      h.postNumber = slot.post;
    });

    // AI の作戦（ピットに入る周など）。僚馬同士は別の周にピットインする
    const pitLaps = new Map<string, number[]>();
    for (const [h, ai] of this.ai) {
      ai.plan(this.laps, Math.random, pitLaps.get(h.entry.constructorId) ?? [], this.format, this.condition);
      if (this.noPitStops) {
        ai.pitLap = 0;
        ai.pitLaps = [];
      }
      pitLaps.set(h.entry.constructorId, ai.pitLaps);
    }
    // 雨の日・ダート：自分の馬は馬場に合う蹄鉄でスタート（次の蹄鉄も同じ。T キーで変えられる）
    if (this.player && this.condition !== 'good') {
      const shoe = bestShoe(this.condition);
      this.player.startShoeOverride = shoe;
      this.player.shoe = shoe;
      this.player.nextShoe = shoe;
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
    this.applyPackDynamics();
    this.readGround();
    for (const h of this.horses) h.windAlong = h.inPit ? 0 : this.windAlongAt(h.s);
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
    this.detectMilestones();
    this.detectFieldShape();
    if (!this.options.trial) this.replay.update(this, dt);
  }

  private emit(type: RaceEventType, horse?: RaceHorse, value?: number, extra?: Partial<RaceEvent>) {
    this.events.push({ type, horse, value, at: this.clock, ...extra });
  }

  /**
   * 展開の実況：残り 1000m 標識の通過（毎周）、大逃げ、最後方が離された追走。
   * 大逃げ・最後方は、差が縮むまで（と 90 秒間）は繰り返さない。
   */
  private detectFieldShape() {
    if (this.phase !== 'running') return;
    const field = this.runningField();
    const leader = field[0];
    if (!leader || this.horses.some((h) => h.finished)) return;
    const mpb = this.track.def.metersPerBlock;
    const L = this.track.length;

    // 残り 1000m 標識：先頭の進み具合が「ゴール板の 1000m 手前」を越えるたび
    const d = 1000 / mpb;
    const idx = Math.floor((leader.progress + d) / L);
    if (this.mark1000Index === null) this.mark1000Index = idx;
    else if (idx > this.mark1000Index) {
      this.mark1000Index = idx;
      const last = field[field.length - 1];
      const meters = (leader.progress - last.progress) * mpb;
      if (field.length > 1) this.emit('mark1000', leader, meters / RACE_CONFIG.horseLengthMeters);
    }

    // セーフティホース中とスタート直後は展開の実況をしない
    if (this.safety.state !== 'idle' || this.time < 15 || field.length < 3) return;
    const C = RACE_CONFIG;
    const second = field[1];
    // ピットの戦略の違い（片方だけピットに入った）で開いた差は「大逃げ」「離された」とは言わない
    const leadGap = second.pitCount === leader.pitCount ? (leader.progress - second.progress) * mpb : 0;
    if (!this.breakawayOn && leadGap > C.breakawayGapMeters && leadGap < 80 && this.clock - this.lastBreakawayAt > 90) {
      this.breakawayOn = true;
      this.lastBreakawayAt = this.clock;
      this.emit('breakaway', leader, leadGap);
    } else if (this.breakawayOn && leadGap < C.breakawayGapMeters * 0.5) this.breakawayOn = false;

    const last = field[field.length - 1];
    const ahead = field[field.length - 2];
    const tailGap = ahead.pitCount === last.pitCount ? (ahead.progress - last.progress) * mpb : 0;
    if (!this.tailOffOn && tailGap > C.tailOffGapMeters && tailGap < 60 && this.clock - this.lastTailOffAt > 90) {
      this.tailOffOn = true;
      this.lastTailOffAt = this.clock;
      this.emit('tailOff', last, tailGap);
    } else if (this.tailOffOn && tailGap < C.tailOffGapMeters * 0.5) this.tailOffOn = false;
  }

  /** 節目の検出：セーフティホースの出動・解除、最後の直線（残り 400m）、ファイナルラップの先頭交代 */
  private detectMilestones() {
    if (this.phase !== 'running') return;
    const sc = this.safety.state;
    if (sc === 'standby' && this.lastSafetyState !== 'standby') this.emit('safety');
    if (sc === 'pitIn' && this.lastSafetyState === 'returning') this.emit('green');
    this.lastSafetyState = sc;

    const leader = this.standings.find((h) => !h.retired && !h.finished);
    if (!leader || this.horses.some((h) => h.finished)) return;
    const finalLap = leader.lapsCompleted === this.laps - 1;
    if (!finalLap) {
      this.lastLeader = leader;
      return;
    }
    const mpb = this.track.def.metersPerBlock;
    const toLineM = -this.track.diff(leader.s, this.track.def.finishS) * mpb;
    if (!this.final400Fired && toLineM > 0 && toLineM <= 400) {
      this.final400Fired = true;
      const second = this.standings.find((h) => h !== leader && !h.retired && !h.finished);
      const gap = second ? this.gapTo(second, leader)?.seconds : undefined;
      this.emit('final400', leader, gap);
    }
    // 先頭交代（連続しないよう 3 秒あける）
    if (this.lastLeader && leader !== this.lastLeader && this.clock - this.lastLeadChangeAt > 3) {
      this.lastLeadChangeAt = this.clock;
      this.emit('leadChange', leader);
    }
    this.lastLeader = leader;
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
    if (this.options.trial) return;
    // ブックメーカーのオッズ表（全頭 × 着順 ＋ DNF）。単勝オッズと人気はその 1 着の列
    this.useOdds(computeOddsMatrix(this));
  }

  /** オッズ表を差し替える（事前シミュレーションの結果を混ぜた時など）。単勝オッズと人気も付け直す */
  useOdds(m: OddsMatrix) {
    this.oddsMatrix = m;
    m.horses.forEach((h, i) => (h.odds = m.odds[i][0]));
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
        status: h.retired ? 'DNF' : h.finished ? 'FINISHED' : 'RUNNING',
        postNumber: h.postNumber,
        horseName: h.entry.horse.name,
        jockeyName: h.entry.jockey.name,
        constructorId: h.entry.constructorId,
        odds: h.odds,
        popularity: h.popularity,
        time: this.correctedTime(h),
        penaltySeconds: h.penaltySeconds,
        penaltyServed: h.penaltyServed,
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
    if (text.startsWith('PENALTY') || text.startsWith('STOP')) this.emit('penalty', horse);
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
   * 馬群の接戦（ラバーバンド）と差し・追込の末脚。
   *  - 先頭から離された馬ほど最高速度が上がる（rubberBand*）。先頭の馬には空気抵抗（スタミナ）の印を付ける
   *  - 最終周の残り kickDistanceM（直線が長いコースは直線の入口から）で、脚を残した差し・追込に末脚（直線が長いほど大きい）
   */
  private applyPackDynamics() {
    const C = RACE_CONFIG;
    const mpb = this.track.def.metersPerBlock;
    const running = this.phase === 'running';
    const field = this.standings.filter((h) => !h.retired && !h.finished);
    const leader = field[0] ?? null;
    const last = this.track.def.segments[this.track.def.segments.length - 1];
    const homeM = (last.type === 'straight' ? last.length : 0) * mpb;
    // 直線が長いほど差し・追込が届きやすく（末脚が大きい・先頭の消耗が大きい）、短い小回りでは先行・逃げが粘る
    const straightK = Math.min(1.7, Math.max(0.3, homeM / C.kickStraightRefM));
    const leadDrag = 1 + (C.leadDragDrain - 1) * straightK * 1.4;
    const kickFromM = Math.max(C.kickDistanceM, homeM + 60);
    const totalM = this.laps * this.track.length * mpb;
    for (const h of this.horses) {
      h.leading = running && h === leader;
      h.leadDrag = leadDrag;
      h.catchUp = 0;
      h.finalKick = 0;
      if (!running || !leader || h.retired || h.finished || h.inPit) continue;
      const gapM = (leader.progress - h.progress) * mpb;
      const free = h.lapsCompleted >= this.laps - 1 ? C.rubberBandFinalLapFreeM : C.rubberBandFreeM;
      h.catchUp = Math.min(C.rubberBandMax, Math.max(0, (gapM - free) * C.rubberBandPerM));
      const remainingM = totalM - h.progress * mpb;
      // 末脚は直線の長さしだい：短い直線（ムーニーバレー・モナコ）ではほぼ効かず、東京のような長い直線で大きい
      const kickK = Math.max(0, straightK - 0.55) * 2;
      if (h.style.kick > 0 && remainingM < kickFromM && h.stamina >= C.kickMinStamina) h.finalKick = h.style.kick * kickK;
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
    // スタミナ切れ：脚がもつれてバランスを崩し、落馬（DNF）
    for (const h of this.horses) if (h.exhausted) this.crash(h, 'stamina');
  }

  private crash(h: RaceHorse, cause: 'rail' | 'stamina' = 'rail') {
    const C = RACE_CONFIG;
    h.retire(this.time);
    this.emit('crash', h, undefined, { cause });
    this.report(h, `落馬 DNF${cause === 'stamina' ? '（スタミナ切れ）' : ''} — ${h.postNumber}番 ${h.entry.horse.name}（PIT RETURN）`);
    // 接触・押し出しで落馬させた馬：STOP & GO（直前の接触ペナルティ +10s はこれに置き換える）。スタミナ切れは誰のせいでもない
    const by = h.lastHitBy;
    if (cause === 'rail' && by && !by.retired && this.clock - h.lastHitAt < C.crashBlameWindow) {
      const lp = by.lastContactPenalty;
      if (lp && lp.victim === h && this.clock - lp.at < C.crashBlameWindow) {
        by.addPenalty(-lp.seconds);
        by.lastContactPenalty = null;
      }
      by.giveStopAndGo();
      this.report(by, `STOP & GO: CAUSED CRASH — ${by.postNumber}番 ${by.entry.horse.name}`);
    }
    if (this.horses.every((x) => x.finished || x.retired)) this.endRace();
    // 先頭がファイナルラップに入ってからの落馬では、セーフティホースは出さない（落馬した馬はコース脇へ退避する）。
    // 終盤のスタミナ切れ落馬で全馬が 50km/h に抑えられて、ゴール前の追い比べが台無しにならないように
    else if (!this.finalLapUnderway()) this.safety.deploy();
  }

  /** 先頭（落馬していない馬で最も前）がファイナルラップ以降を走っている */
  private finalLapUnderway(): boolean {
    return this.horses.some((h) => !h.retired && (h.finished || h.lapsCompleted >= this.laps - 1));
  }

  /** 全馬がゴール（またはリタイア）：レース終了。セーフティホースも引き上げる */
  private endRace() {
    this.phase = 'finished';
    this.safety.reset();
  }

  /**
   * 接触：加害側にタイムペナルティ（その馬の k 回目の接触で +0.1 × k 秒。等差で累積）。
   * 相手には「誰にぶつけられたか」を記録（ラチに押し出された時の判定用）
   */
  private contact(aggressor: RaceHorse, victim: RaceHorse) {
    const C = RACE_CONFIG;
    victim.lastHitBy = aggressor;
    victim.lastHitAt = this.clock;
    const key = pairKey(aggressor, victim);
    const last = this.contactTimes.get(key) ?? -Infinity;
    if (this.clock - last < C.contactCooldown) return;
    this.contactTimes.set(key, this.clock);
    aggressor.contactCount++;
    const seconds = Math.round(C.contactPenaltyStep * aggressor.contactCount * 10) / 10;
    aggressor.addPenalty(seconds);
    aggressor.lastContactPenalty = { victim, at: this.clock, seconds };
    this.report(
      aggressor,
      `PENALTY +${seconds.toFixed(1)}s: COLLISION（${aggressor.contactCount}回目）— ${aggressor.postNumber}番 ${aggressor.entry.horse.name}`,
    );
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
    const step = RACE_CONFIG.turfWearPerStep * this.format.turfWear * (this.weather === 'rain' ? RACE_CONFIG.rainTurfWear : 1);
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
    this.emit('start');
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
    // ゴール後にキャンターで 1 周してきた通過は数えない（ゴールタイム・ラップが書き換わらないように）
    if (horse.finished) return;

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
        horse.addPenalty(RACE_CONFIG.unservedStopGoPenalty);
        this.report(horse, `PENALTY +${RACE_CONFIG.unservedStopGoPenalty}s: STOP & GO NOT SERVED — ${horse.postNumber}番 ${horse.entry.horse.name}`);
      }
      // 着順はペナルティ込みのタイムで決める（後からゴールした馬に抜かれることもある）
      const finished = this.horses.filter((h) => h.finishTime !== null);
      finished.sort((a, b) => this.correctedTime(a)! - this.correctedTime(b)!);
      finished.forEach((h, i) => (h.finishPosition = i + 1));
      this.emit('finish', horse, horse.finishPosition ?? undefined);
      if (horse === this.focus) {
        const pen = horse.penaltySeconds > 0 ? `（ペナルティ +${horse.penaltySeconds}s 込み）` : '';
        this.notify(`FINISH! ${horse.finishPosition}着${pen}`, 4);
      }
      if (this.horses.every((h) => h.finished || h.retired)) this.endRace();
    } else {
      // 周回ごとのゴール板通過：その周回を最初に終えた馬（＝先頭）を実況する
      if (horse.lapsCompleted > this.lapAnnounced) {
        this.lapAnnounced = horse.lapsCompleted;
        this.emit('lapLeader', horse, undefined, {
          lap: horse.lapsCompleted,
          lapTime: horse.lapTimes[horse.lapTimes.length - 1],
          elapsed: this.time,
        });
      }
    }
    if (horse.finished) return;
    if (horse === this.focus) {
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
