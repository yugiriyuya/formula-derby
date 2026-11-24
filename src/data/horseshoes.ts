/** 蹄鉄（F1 のタイヤに相当）の種類と性能 */
export type HorseshoeType = 'SOFT' | 'HARD' | 'RAIN';

/** 馬場状態。芝の良 / 重（雨）と、ダートの良 / 重（雨） */
export type TrackCondition = 'good' | 'heavy' | 'dirt' | 'dirtHeavy';

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
  // ダートは芝より全体に遅く、蹄が深く沈むので硬い蹄鉄（HARD）がいちばん合う。雨のダートはレインが合う
  SOFT: { type: 'SOFT', label: 'ソフト', color: '#e8463a', grip: { good: 1.0, heavy: 0.9, dirt: 0.91, dirtHeavy: 0.88 }, wearPerLap: 0.32 },
  HARD: { type: 'HARD', label: 'ハード', color: '#f2f2f2', grip: { good: 0.97, heavy: 0.88, dirt: 0.96, dirtHeavy: 0.91 }, wearPerLap: 0.12 },
  RAIN: { type: 'RAIN', label: 'レイン', color: '#3a8de8', grip: { good: 0.93, heavy: 1.0, dirt: 0.92, dirtHeavy: 0.95 }, wearPerLap: 0.22 },
};

/** 馬場状態にいちばん合う蹄鉄 */
export function bestShoe(condition: TrackCondition): HorseshoeType {
  return condition === 'good' ? 'SOFT' : condition === 'dirt' ? 'HARD' : 'RAIN';
}

export const HORSESHOE_ORDER: HorseshoeType[] = ['SOFT', 'HARD', 'RAIN'];

/** 摩耗しきると最高速度がこの割合だけ落ちる */
export const MAX_WEAR_PENALTY = 0.1;
