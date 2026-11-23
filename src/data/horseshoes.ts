/** 蹄鉄（F1 のタイヤに相当）の種類と性能 */
export type HorseshoeType = 'SOFT' | 'HARD' | 'RAIN';

/** 馬場状態。現状は良馬場固定（天候は今後追加） */
export type TrackCondition = 'good' | 'heavy';

export interface HorseshoeSpec {
  type: HorseshoeType;
  label: string;
  /** HUD と蹄の色 */
  color: string;
  /** 馬場状態ごとのグリップ（最高速度への倍率） */
  grip: Record<TrackCondition, number>;
  /** 1 周あたりの摩耗量（0〜1。1 で摩耗しきり） */
  wearPerLap: number;
}

export const HORSESHOES: Record<HorseshoeType, HorseshoeSpec> = {
  SOFT: { type: 'SOFT', label: 'ソフト', color: '#e8463a', grip: { good: 1.0, heavy: 0.9 }, wearPerLap: 0.32 },
  HARD: { type: 'HARD', label: 'ハード', color: '#f2f2f2', grip: { good: 0.97, heavy: 0.88 }, wearPerLap: 0.12 },
  RAIN: { type: 'RAIN', label: 'レイン', color: '#3a8de8', grip: { good: 0.93, heavy: 1.0 }, wearPerLap: 0.22 },
};

export const HORSESHOE_ORDER: HorseshoeType[] = ['SOFT', 'HARD', 'RAIN'];

/** 摩耗しきると最高速度がこの割合だけ落ちる */
export const MAX_WEAR_PENALTY = 0.1;
