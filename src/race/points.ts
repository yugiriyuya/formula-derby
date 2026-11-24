import type { Race } from './Race';
import type { RaceHorse } from './RaceHorse';

/** F1 方式：1〜10 着のポイント */
export const F1_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
/** ファステストラップ（レース最速のラップ）と、オーバーテイク数最多の追加点 */
export const FASTEST_LAP_BONUS = 1;
export const MOST_OVERTAKES_BONUS = 1;

/** 1 頭ぶんの獲得ポイントと内訳 */
export interface RacePoints {
  /** 着順のポイント（11 着以下・落馬は 0） */
  base: number;
  /** ファステストラップの +1 */
  fastestLap: boolean;
  /** オーバーテイク数最多の +1 */
  mostOvertakes: boolean;
  total: number;
}

/**
 * レースの獲得ポイント。
 *  - 着順：25-18-15-12-10-8-6-4-2-1
 *  - ファステストラップ：+1（ゴールした馬だけ）
 *  - オーバーテイク数最多：+1（ゴールした馬の中で。同数なら着順が上の馬）
 * リザルト画面とシリーズ戦の集計の両方でこれを使う。
 */
export function racePoints(race: Race): Map<RaceHorse, RacePoints> {
  const finished = race.horses.filter((h) => !h.retired && h.finishPosition !== null);
  const fastest = race.fastestLapHolder();
  let topOvertaker: RaceHorse | null = null;
  for (const h of finished) {
    if (h.overtakes <= 0) continue;
    if (!topOvertaker || h.overtakes > topOvertaker.overtakes || (h.overtakes === topOvertaker.overtakes && h.finishPosition! < topOvertaker.finishPosition!)) {
      topOvertaker = h;
    }
  }
  const out = new Map<RaceHorse, RacePoints>();
  for (const h of race.horses) {
    const pos = h.retired ? null : h.finishPosition;
    const base = pos !== null && pos <= F1_POINTS.length ? F1_POINTS[pos - 1] : 0;
    const fastestLap = h === fastest && pos !== null;
    const mostOvertakes = h === topOvertaker;
    out.set(h, {
      base,
      fastestLap,
      mostOvertakes,
      total: base + (fastestLap ? FASTEST_LAP_BONUS : 0) + (mostOvertakes ? MOST_OVERTAKES_BONUS : 0),
    });
  }
  return out;
}

/** ポイントの内訳の表示（例「25 + FL1 + OT1」） */
export function pointsBreakdown(p: RacePoints): string {
  const parts = [String(p.base)];
  if (p.fastestLap) parts.push(`FL${FASTEST_LAP_BONUS}`);
  if (p.mostOvertakes) parts.push(`OT${MOST_OVERTAKES_BONUS}`);
  return parts.join(' + ');
}
