import { Race } from '../race/Race';
import { NO_CONTROLS } from '../race/RaceHorse';
import { raceFormat } from '../race/raceConfig';

/** 事前シミュレーション（試走）の設定 */
export const TRIAL_CONFIG = {
  /** 試走の周回数（本番が短ければその周回数）。スタミナと蹄鉄の減りは本番と同じだけ効くように縮める */
  laps: 2,
  /** 1 ステップの時間（秒）。本番（1/60）より粗くして速く回す */
  dt: 1 / 30,
  /** 試走の回数（目標）と、時間が足りない時でも最低限回す回数 */
  target: 16,
  minimum: 8,
  /** 全体の時間の上限（ミリ秒）。これを過ぎたら minimum 回以上で打ち切る */
  budgetMs: 4500,
};

/**
 * レース前の事前シミュレーション：本番と同じ枠順・馬場・風・設定で、実際のレース処理（AI・接触・ムチ・スタミナ）を
 * 短縮した試走として何十回か走らせ、着順を数える。ブラウザが固まらないよう、少しずつ（step）進める。
 */
export class OddsTrials {
  /** 試走ごとの着順（本番の oddsMatrix.horses の添字を 1 着から。落馬した馬は入れない） */
  readonly orders: number[][] = [];
  private readonly trial: Race;
  private readonly index: number[];
  private running = false;
  private readonly startedAt = performance.now();
  private steps = 0;

  constructor(main: Race) {
    const m = main.oddsMatrix;
    const laps = Math.min(main.laps, TRIAL_CONFIG.laps);
    // 試走用のレース（画面・リプレイ・芝の荒れとは無関係。オッズも作らない）
    const trial = new Race(main.track, laps, m.horses.map((h) => h.entry), null, { trial: true });
    trial.setWeather(main.weather);
    trial.setWind(main.wind.fromDeg, main.wind.speed);
    trial.aiAbility = main.aiAbility;
    trial.shoeWearMultiplier = main.shoeWearMultiplier;
    trial.noPitStops = true;
    // 本番の周回数ぶんのスタミナ・蹄鉄の消耗を、短い試走に詰め込む（ピットに入らない分、蹄鉄は半分）
    const full = raceFormat(main.laps);
    const k = main.laps / laps;
    trial.format = { ...raceFormat(laps), stamina: full.stamina * k, shoeWear: full.shoeWear * k * 0.5 };
    // 本番と同じ枠順
    const byEntry = new Map(trial.horses.map((h) => [h.entry.id, h]));
    trial.gridOrder = [...m.horses].sort((a, b) => a.postNumber - b.postNumber).map((h) => byEntry.get(h.entry.id)!);
    this.index = trial.horses.map((h) => m.horses.findIndex((x) => x.entry.id === h.entry.id));
    this.trial = trial;
  }

  /** 目標の回数を走り終えた（または時間切れ） */
  get finished(): boolean {
    if (this.done >= TRIAL_CONFIG.target) return true;
    return this.done >= TRIAL_CONFIG.minimum && performance.now() - this.startedAt > TRIAL_CONFIG.budgetMs;
  }

  /** sliceMs ミリ秒だけ試走を進める。終わったら true */
  step(sliceMs: number): boolean {
    const t0 = performance.now();
    const dt = TRIAL_CONFIG.dt;
    while (!this.finished && performance.now() - t0 < sliceMs) {
      if (!this.running) {
        this.trial.restart();
        this.running = true;
        this.steps = 0;
      }
      for (let i = 0; i < 30 && this.trial.phase !== 'finished'; i++) this.trial.update(dt, NO_CONTROLS);
      this.steps += 30;
      // 長引いた試走（安全のため 15 分相当で打ち切り）
      if (this.trial.phase === 'finished' || this.steps * dt > 900) {
        this.record();
        this.running = false;
      }
    }
    return this.finished;
  }

  get done(): number {
    return this.orders.length;
  }

  private record() {
    // 着順の並び（打ち切った試走では、まだ走っている馬はその時の順位）
    const j = this.trial.horses.map((_, k) => k).filter((k) => !this.trial.horses[k].retired);
    const pos = (k: number) => this.trial.horses[k].finishPosition ?? 100 + this.trial.standings.indexOf(this.trial.horses[k]);
    j.sort((a, b) => pos(a) - pos(b));
    this.orders.push(j.map((k) => this.index[k]));
  }
}
