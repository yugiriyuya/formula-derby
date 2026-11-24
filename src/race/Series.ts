import { COURSES } from '../course/courses';
import { fieldEntries, teamsOf } from '../data/roster';
import type { Race, Weather } from './Race';

/** 着順ごとのポイント（1〜10 着）と、ファステストラップの追加点（10 着以内でゴールした馬だけ） */
export const SERIES_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
export const FASTEST_LAP_BONUS = 1;

export interface SeriesResult {
  entryId: string;
  /** 着順（落馬は null） */
  position: number | null;
  points: number;
  fastestLap: boolean;
}

export interface SeriesRound {
  courseId: string;
  weather: Weather;
  wind: { fromDeg: number; speed: number };
  /** レースが終わったら入る */
  results?: SeriesResult[];
}

/** シリーズ戦の進み具合（ブラウザに保存。コースを切り替える読み込み直しをまたいで続く） */
export interface SeriesState {
  version: 1;
  /** race = 自分で騎乗, spectate = 観戦 */
  mode: 'race' | 'spectate';
  /** 出走頭数（12 / 16。古い保存データにはないので 12 とみなす） */
  fieldSize?: number;
  laps: number;
  qualifying: boolean;
  /** 次に走る（または走っている）ラウンドの番号（0〜9）。全戦終わったら rounds.length */
  round: number;
  rounds: SeriesRound[];
}

export interface HorseStanding {
  entryId: string;
  points: number;
  wins: number;
  podiums: number;
  /** 最高着順（同点の時の順位付け用） */
  best: number;
  /** 直近のラウンドで取ったポイント */
  last: number;
}

export interface TeamStanding {
  constructorId: string;
  points: number;
  wins: number;
  last: number;
}

const KEY = 'formula-derby-series';

export function loadSeries(): SeriesState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SeriesState;
    return s && s.version === 1 && Array.isArray(s.rounds) ? s : null;
  } catch {
    return null;
  }
}

export function saveSeries(s: SeriesState | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    // 保存できなくても、このページの中では続けられる
  }
}

/** 新しいシリーズ：全 10 コースを順に。天候と風はコースごとの傾向から最初に決めておく */
export function newSeries(mode: 'race' | 'spectate', laps: number, qualifying: boolean, fieldSize = 12): SeriesState {
  return {
    version: 1,
    mode,
    fieldSize,
    laps,
    qualifying,
    round: 0,
    rounds: COURSES.map((c) => ({
      courseId: c.id,
      weather: Math.random() < c.rainChance ? 'rain' : 'sunny',
      wind: randomWind(c.wind),
    })),
  };
}

/** コースの基本の風から、そのレースの風を決める（向き ±30°、強さ ±35%） */
export function randomWind(base: { fromDeg: number; speed: number }) {
  return {
    fromDeg: Math.round((base.fromDeg + (Math.random() - 0.5) * 60 + 360) % 360),
    speed: Math.round(base.speed * (0.65 + Math.random() * 0.7) * 10) / 10,
  };
}

export function isFinished(s: SeriesState): boolean {
  return s.round >= s.rounds.length;
}

/** レースの結果からポイントを付けて、今のラウンドに記録する（同じラウンドに 2 回は記録しない） */
export function recordRound(s: SeriesState, race: Race): boolean {
  const round = s.rounds[s.round];
  if (!round || round.results) return false;
  const fastest = race.fastestLapHolder();
  round.results = race.horses.map((h) => {
    const position = h.retired ? null : h.finishPosition;
    let points = position !== null && position <= SERIES_POINTS.length ? SERIES_POINTS[position - 1] : 0;
    const fl = h === fastest;
    if (fl && position !== null && position <= 10) points += FASTEST_LAP_BONUS;
    return { entryId: h.entry.id, position, points, fastestLap: fl };
  });
  return true;
}

/** 馬（ドライバー）とコンストラクターの順位。同点なら優勝回数、次に最高着順 */
export function standings(s: SeriesState): { horses: HorseStanding[]; teams: TeamStanding[] } {
  const done = s.rounds.filter((r) => r.results);
  const lastRound = done[done.length - 1];
  const entries = fieldEntries(s.fieldSize ?? 12);
  const horses: HorseStanding[] = entries.map((e) => {
    let points = 0;
    let wins = 0;
    let podiums = 0;
    let best = 99;
    for (const r of done) {
      const res = r.results!.find((x) => x.entryId === e.id);
      if (!res) continue;
      points += res.points;
      if (res.position === 1) wins++;
      if (res.position !== null && res.position <= 3) podiums++;
      if (res.position !== null) best = Math.min(best, res.position);
    }
    const last = lastRound?.results!.find((x) => x.entryId === e.id)?.points ?? 0;
    return { entryId: e.id, points, wins, podiums, best, last };
  }).sort((a, b) => b.points - a.points || b.wins - a.wins || a.best - b.best);

  const teams: TeamStanding[] = teamsOf(entries).map((c) => {
    const mine = horses.filter((h) => entries.find((e) => e.id === h.entryId)!.constructorId === c.id);
    return {
      constructorId: c.id,
      points: mine.reduce((a, h) => a + h.points, 0),
      wins: mine.reduce((a, h) => a + h.wins, 0),
      last: mine.reduce((a, h) => a + h.last, 0),
    };
  }).sort((a, b) => b.points - a.points || b.wins - a.wins);
  return { horses, teams };
}
