import type { CourseTrack } from '../course/CourseTrack';
import type { TrackCondition } from '../data/horseshoes';
import { CONSTRUCTORS, type EntryData } from '../data/roster';
import { RACE_CONFIG } from './raceConfig';
import { NO_CONTROLS, RaceHorse, type HorseControls } from './RaceHorse';

export type RacePhase = 'countdown' | 'running' | 'finished';

/** HUD に一時的に出すお知らせ */
export interface RaceMessage {
  text: string;
  until: number;
}

/**
 * シンプルレース（規定周回）の進行管理。
 * 現状はプレイヤー 1 頭。AI 馬は horses に追加していく想定。
 */
export class Race {
  phase: RacePhase = 'countdown';
  /** レース経過時間（スタートからの秒） */
  time = 0;
  countdown: number = RACE_CONFIG.countdownSeconds;
  condition: TrackCondition = 'good';
  readonly player: RaceHorse;
  readonly horses: RaceHorse[] = [];
  lapTimes: number[] = [];
  private lapStartTime = 0;
  message: RaceMessage | null = null;
  /** 演出用の経過時間（カウントダウン中も進む） */
  private clock = 0;

  constructor(
    readonly track: CourseTrack,
    readonly laps: number,
    playerEntry: EntryData,
  ) {
    const garageIndex = CONSTRUCTORS.findIndex((c) => c.id === playerEntry.constructorId);
    this.player = new RaceHorse(track, playerEntry, garageIndex, CONSTRUCTORS.length);
    this.horses.push(this.player);
    for (const h of this.horses) {
      h.onCrossLine = (horse) => this.handleCrossLine(horse);
      h.onPitComplete = (horse, from, to) => {
        if (horse === this.player) this.notify(`蹄鉄交換完了 ${from} → ${to}`, 2.5);
      };
    }
    this.restart();
  }

  restart() {
    this.phase = 'countdown';
    this.countdown = RACE_CONFIG.countdownSeconds;
    this.time = 0;
    this.lapTimes = [];
    this.lapStartTime = 0;
    this.message = null;
    const startS = this.track.def.finishS - RACE_CONFIG.startBehindLine / this.track.def.metersPerBlock;
    for (const h of this.horses) h.reset(startS, 0);
  }

  /** 表示用の現在周回（1〜laps） */
  get currentLap(): number {
    return Math.min(this.laps, this.player.lapsCompleted + 1);
  }

  get lastLapTime(): number | null {
    return this.lapTimes.length ? this.lapTimes[this.lapTimes.length - 1] : null;
  }

  get bestLapTime(): number | null {
    return this.lapTimes.length ? Math.min(...this.lapTimes) : null;
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

    for (const h of this.horses) {
      const controls = h === this.player ? playerControls : NO_CONTROLS;
      h.update(dt, controls, this.phase === 'running' && !h.finished, this.condition);
    }
  }

  private handleCrossLine(horse: RaceHorse) {
    if (horse !== this.player) return;
    // スタート直後の通過（スタート位置がゴール板の手前）は周回に数えない
    if (horse.lapsCompleted === 0) return;

    this.lapTimes.push(this.time - this.lapStartTime);
    this.lapStartTime = this.time;
    horse.startNewLap();

    if (horse.lapsCompleted >= this.laps) {
      horse.finished = true;
      this.phase = 'finished';
    } else if (horse.lapsCompleted === this.laps - 1) {
      this.notify('ファイナルラップ！', 2.5);
    } else {
      this.notify(`LAP ${horse.lapsCompleted + 1}/${this.laps}`, 2);
    }
  }
}
