import type { CourseTrack } from '../course/CourseTrack';
import type { HorseshoeType } from '../data/horseshoes';
import type { Race } from './Race';

/** 1 頭ぶんの記録（描画に必要なものだけ。HorseModel.sync にそのまま渡せる形） */
export interface ReplayHorseFrame {
  s: number;
  lateral: number;
  speed: number;
  lateralVelocity: number;
  gallopPhase: number;
  whipAnim: number;
  shoe: HorseshoeType;
  slipstream: number;
  fallen: number;
  /** その時点で走っていない（ピットレーン・落馬して退避済み）なら描かない */
  hidden: boolean;
}

export interface ReplayFrame {
  /** 記録開始からの秒 */
  t: number;
  horses: ReplayHorseFrame[];
}

/** 記録する間隔（秒）と、ゴール後に記録を続ける秒数・最長の記録時間 */
const FRAME_INTERVAL = 1 / 30;
const AFTER_FINISH = 5;
const MAX_DURATION = 45;

/**
 * ゴール前リプレイの記録。
 * ファイナルラップで先頭の馬が最後の直線（4コーナー出口）に入った時から、1 着の馬がゴールして 5 秒後まで、
 * 全馬の位置・向き・脚の動き・ムチを 30 コマ/秒で記録する。
 */
export class ReplayRecorder {
  frames: ReplayFrame[] = [];
  private recording = false;
  private done = false;
  private startTime = 0;
  private acc = 0;
  private endAt: number | null = null;
  /** 記録中にゴールした馬（race.horses の番号）と、ゴールした時刻（記録開始からの秒） */
  finishes: { index: number; t: number; speed: number }[] = [];

  reset() {
    this.frames = [];
    this.finishes = [];
    this.recording = false;
    this.done = false;
    this.acc = 0;
    this.endAt = null;
  }

  /** 再生できるだけの記録があるか */
  get available(): boolean {
    return this.frames.length > 10;
  }

  get duration(): number {
    return this.frames.length ? this.frames[this.frames.length - 1].t : 0;
  }

  update(race: Race, dt: number) {
    if (this.done || race.phase === 'countdown') return;
    const track = race.track;
    const def = track.def;
    if (!this.recording) {
      // ファイナルラップの先頭が最後の直線に入ったら記録開始
      const leader = race.standings.find((h) => !h.retired);
      const last = def.segments[def.segments.length - 1];
      const homeLength = last.type === 'straight' ? last.length : 0;
      if (!leader || leader.finished || leader.lapsCompleted !== race.laps - 1) return;
      const toLine = -track.diff(leader.s, def.finishS);
      if (toLine <= 0 || toLine > homeLength + 15 / def.metersPerBlock) return;
      this.recording = true;
      this.startTime = race.time;
      this.acc = FRAME_INTERVAL;
    }
    this.acc += dt;
    if (this.acc >= FRAME_INTERVAL) {
      this.acc = 0;
      this.frames.push({
        t: race.time - this.startTime,
        horses: race.horses.map((h) => ({
          s: h.s,
          lateral: h.lateral,
          speed: h.speed,
          lateralVelocity: h.lateralVelocity,
          gallopPhase: h.gallopPhase,
          whipAnim: h.whipAnim,
          shoe: h.shoe,
          slipstream: h.slipstream,
          fallen: h.fallen,
          hidden: h.inPit || (h.retired && h.fallen === 0),
        })),
      });
    }
    // ゴールした時刻（写真判定の演出に使う）
    race.horses.forEach((h, index) => {
      if (h.finishTime !== null && !this.finishes.some((f) => f.index === index)) {
        this.finishes.push({ index, t: h.finishTime - this.startTime, speed: h.speed });
      }
    });
    // 1 着がゴールしてから 5 秒後（または全馬ゴール）で記録終了
    if (this.endAt === null && race.horses.some((h) => h.finishPosition !== null)) this.endAt = race.time + AFTER_FINISH;
    const tooLong = race.time - this.startTime > MAX_DURATION;
    if ((this.endAt !== null && race.time >= this.endAt) || tooLong) this.done = true;
  }

  /** t 秒の時点の全馬の状態（前後のコマを補間） */
  sample(t: number, track: CourseTrack): ReplayHorseFrame[] {
    const f = this.frames;
    if (f.length === 0) return [];
    if (t <= f[0].t) return f[0].horses;
    if (t >= f[f.length - 1].t) return f[f.length - 1].horses;
    let lo = 0;
    let hi = f.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (f[mid].t <= t) lo = mid;
      else hi = mid;
    }
    const a = f[lo];
    const b = f[hi];
    const k = (t - a.t) / Math.max(1e-6, b.t - a.t);
    const lerp = (x: number, y: number) => x + (y - x) * k;
    return a.horses.map((ha, i) => {
      const hb = b.horses[i];
      return {
        // ゴール板（s = 0）をまたぐ時も正しく補間する
        s: track.wrap(ha.s + track.diff(hb.s, ha.s) * k),
        lateral: lerp(ha.lateral, hb.lateral),
        speed: lerp(ha.speed, hb.speed),
        lateralVelocity: lerp(ha.lateralVelocity, hb.lateralVelocity),
        gallopPhase: lerp(ha.gallopPhase, hb.gallopPhase),
        whipAnim: Math.max(ha.whipAnim, hb.whipAnim) > 0 ? lerp(ha.whipAnim, hb.whipAnim) : 0,
        shoe: k < 0.5 ? ha.shoe : hb.shoe,
        slipstream: lerp(ha.slipstream, hb.slipstream),
        fallen: lerp(ha.fallen, hb.fallen),
        hidden: k < 0.5 ? ha.hidden : hb.hidden,
      };
    });
  }
}
