import type { TrackCondition } from '../data/horseshoes';
import { PACE_LEVELS, PACE_ORDER } from './raceConfig';
import type { HorseControls, RaceHorse } from './RaceHorse';

/**
 * 目標速度に向けて自動で加速・抑えるための操作を作る（プレイヤーの自動前進と AI で共通）。
 * 目標を上回った時は強くブレーキをかけず、惰性でゆっくり目標に戻す（ムチで伸びた分が生きる）。
 */
export function cruiseControls(h: RaceHorse, targetSpeed: number, steer: number, whip: boolean): HorseControls {
  return {
    accelerate: h.speed < targetSpeed - 0.15,
    brake: h.speed > targetSpeed + 2.5,
    steer,
    whip,
  };
}

/** プレイヤーの馬：今のペースの巡航速度で自動前進。進路とムチだけ操作する */
export function playerControls(h: RaceHorse, steer: number, whip: boolean, condition: TrackCondition): HorseControls {
  const target = h.topSpeed(condition) * PACE_LEVELS[h.paceLevel].ratio;
  return cruiseControls(h, target, steer, whip);
}

/** ペースを 1 段階上げる（+1）/ 下げる（-1） */
export function shiftPace(h: RaceHorse, dir: 1 | -1) {
  const i = PACE_ORDER.indexOf(h.paceLevel);
  h.paceLevel = PACE_ORDER[Math.max(0, Math.min(PACE_ORDER.length - 1, i + dir))];
}
