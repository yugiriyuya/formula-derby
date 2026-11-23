import type { CourseTrack } from '../course/CourseTrack';
import type { TrackCondition } from '../data/horseshoes';
import { CONSTRUCTORS, teammateIndex, type EntryData } from '../data/roster';
import { AIController } from './AIController';
import { RACE_CONFIG } from './raceConfig';
import { RaceHorse, type HorseControls } from './RaceHorse';

export type RacePhase = 'countdown' | 'running' | 'finished';

/** HUD に一時的に出すお知らせ */
export interface RaceMessage {
  text: string;
  until: number;
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
  phase: RacePhase = 'countdown';
  /** レース経過時間（スタートからの秒） */
  time = 0;
  countdown: number = RACE_CONFIG.countdownSeconds;
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
  /** 演出用の経過時間（カウントダウン中も進む） */
  private clock = 0;
  private finishCount = 0;
  /** 計測点ごとの通過時刻（ギャップ計算用） */
  private readonly splits = new Map<RaceHorse, number[]>();
  private readonly posts = new Map<RaceHorse, number>();

  constructor(
    readonly track: CourseTrack,
    readonly laps: number,
    entries: readonly EntryData[],
    playerEntryId: string | null,
  ) {
    for (const e of entries) {
      const garageIndex = CONSTRUCTORS.findIndex((c) => c.id === e.constructorId);
      // 僚馬は同じ厩舎の前で、少し前後にずらして止まる
      const boxOffset = (teammateIndex(e) === 0 ? -1 : 1) * (3.5 / track.def.metersPerBlock);
      const h = new RaceHorse(track, e, garageIndex, CONSTRUCTORS.length, boxOffset);
      h.onCrossLine = (horse) => this.handleCrossLine(horse);
      h.onPitComplete = (horse, from, to) => {
        if (horse === this.focus) this.notify(`蹄鉄交換完了 ${from} → ${to}`, 2.5);
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
    return this.player === null;
  }

  restart() {
    this.phase = 'countdown';
    this.countdown = RACE_CONFIG.countdownSeconds;
    this.time = 0;
    this.message = null;
    this.finishCount = 0;
    this.buildGate();

    // 枠順は毎レース抽選
    const order = shuffle([...this.horses], Math.random);
    this.posts.clear();
    order.forEach((h, i) => {
      const slot = this.gate[i];
      h.reset(slot.frontS - GATE_STALL_LENGTH / 2, slot.lateral);
      this.posts.set(h, slot.post);
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
    return this.posts.get(h) ?? 0;
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

  notify(text: string, seconds: number) {
    this.message = { text, until: this.clock + seconds };
  }

  get activeMessage(): string | null {
    return this.message && this.message.until > this.clock ? this.message.text : null;
  }

  update(dt: number, playerControls: HorseControls) {
    this.clock += dt;
    if (this.phase === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.phase = 'running';
        this.notify('GO!', 1);
      }
    } else if (this.phase === 'running') {
      this.time += dt;
    }

    const ctx = { horses: this.horses, laps: this.laps, condition: this.condition, time: this.time };
    for (const h of this.horses) {
      // ゲートを出るまでは真っすぐ走る（隣の枠にぶつからないように）
      h.steerLocked = h.lapsCompleted === 0 && h.lineCrossings === 0 && h.distance < GATE_STALL_LENGTH + 1.5;
      const ai = this.ai.get(h);
      const controls = ai ? ai.decide(dt, ctx) : playerControls;
      h.update(dt, controls, this.phase === 'running' && !h.finished, this.condition);
    }
    this.separate();
    this.recordSplits();
    this.updateStandings();
  }

  /**
   * 馬同士が重ならないようにする（すり抜け防止）。
   *  - 横に並んで重なった：左右に押し分ける
   *  - 後ろから追突しそう：後ろの馬が前の馬の速さまで落とす
   * ピットレーン走行中・ゴール後の馬は対象外。
   */
  private separate() {
    const def = this.track.def;
    const limit = def.trackWidth / 2 - RACE_CONFIG.railMargin / def.metersPerBlock;
    const active = this.horses.filter((h) => (h.pitPhase === 'none' || h.pitPhase === 'approach') && !h.finished);
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i];
        const b = active[j];
        const ds = this.track.diff(b.s, a.s);
        const dl = b.lateral - a.lateral;
        if (Math.abs(ds) >= HORSE_LENGTH || Math.abs(dl) >= HORSE_WIDTH) continue;
        const dir = dl !== 0 ? Math.sign(dl) : i % 2 === 0 ? 1 : -1;
        const overlap = HORSE_WIDTH - Math.abs(dl);
        if (Math.abs(ds) < HORSE_LENGTH * 0.55) {
          a.lateral = clamp(a.lateral - (dir * overlap) / 2, -limit, limit);
          b.lateral = clamp(b.lateral + (dir * overlap) / 2, -limit, limit);
        } else {
          const front = ds > 0 ? b : a;
          const rear = ds > 0 ? a : b;
          rear.speed = Math.min(rear.speed, front.speed * 0.99);
          const away = rear === a ? -dir : dir;
          rear.lateral = clamp(rear.lateral + away * overlap * 0.15, -limit, limit);
        }
      }
    }
  }

  /** 計測点を通過した時刻を記録する（前の馬・トップとのタイム差に使う） */
  private recordSplits() {
    for (const h of this.horses) {
      if (h.finished) continue;
      const list = this.splits.get(h)!;
      const idx = Math.floor((h.progress + CHECKPOINT_ORIGIN) / CHECKPOINT);
      while (list.length <= idx) list.push(this.time);
    }
  }

  private updateStandings() {
    this.standings.sort((a, b) => {
      if (a.finishTime !== null || b.finishTime !== null) {
        if (a.finishTime === null) return 1;
        if (b.finishTime === null) return -1;
        return a.finishTime - b.finishTime;
      }
      return b.progress - a.progress;
    });
  }

  /**
   * ref（トップや前の馬）とのタイム差。
   * 同じ計測点を通過した時刻の差。周回遅れなら laps に周回数を入れて返す。
   */
  gapTo(h: RaceHorse, ref: RaceHorse): { seconds: number; laps: number } | null {
    if (h === ref) return null;
    if (h.finishTime !== null && ref.finishTime !== null) return { seconds: h.finishTime - ref.finishTime, laps: 0 };
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
      horse.finishPosition = ++this.finishCount;
      if (horse === this.focus) this.notify(`FINISH! ${horse.finishPosition}着`, 4);
      if (this.horses.every((h) => h.finished)) this.phase = 'finished';
    } else if (horse === this.focus) {
      if (horse.lapsCompleted === this.laps - 1) this.notify('ファイナルラップ！', 2.5);
      else this.notify(`LAP ${horse.lapsCompleted + 1}/${this.laps}`, 2);
    }
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function shuffle<T>(arr: T[], rand: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
