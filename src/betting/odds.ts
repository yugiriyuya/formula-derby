import type { CourseTrack } from '../course/CourseTrack';
import type { Race } from '../race/Race';
import type { RaceHorse } from '../race/RaceHorse';
import { RACE_CONFIG } from '../race/raceConfig';

/** 控除率（払戻率 80%）と、オッズの最小・最大 */
export const TAKEOUT = 0.2;
export const MIN_ODDS = 1.1;
export const MAX_ODDS = 250;
/** 着順の分布を見積もるための試行回数 */
const SAMPLES = 20000;

/**
 * 全頭 × 着順（1 着〜最下位）＋ DNF のオッズ表。
 * odds[i][k]：horses[i] が k + 1 着になるオッズ（k = 0..n-1）、odds[i][n]：DNF のオッズ。
 */
export interface OddsMatrix {
  horses: RaceHorse[];
  /** 頭数（列は 1 着〜n 着 ＋ DNF） */
  n: number;
  /** 確率（オッズの元。同じ形） */
  probs: number[][];
  odds: number[][];
}

/** コースの特徴（能力値のどれが効くかを決める） */
export interface CourseProfile {
  /** 高低差（m） */
  hillM: number;
  /** 最後の直線（m） */
  homeM: number;
  /** 1 周で曲がる量（周） = 1 なら楕円、大きいほど曲がりくねっている */
  twist: number;
  /** コース幅（m） */
  widthM: number;
}

export function courseProfile(track: CourseTrack): CourseProfile {
  const def = track.def;
  const mpb = def.metersPerBlock;
  const last = def.segments[def.segments.length - 1];
  let turn = 0;
  for (const seg of def.segments) if (seg.type === 'arc') turn += seg.angleDeg;
  return {
    hillM: (Math.max(...def.elevation.map((k) => k.h)) - Math.min(...def.elevation.map((k) => k.h))) * mpb,
    homeM: (last.type === 'straight' ? last.length : 0) * mpb,
    twist: turn / 360,
    widthM: def.trackWidth * mpb,
  };
}

/**
 * 馬の実力（レース前の見立て）。能力値をコースの特徴で重み付けし、脚質・騎手・設定（AI の強さ）・枠を加える。
 *  - 長い直線：スピードが効き、差し・追込が届きやすい。短い直線：逃げ・先行が有利
 *  - 坂：パワー、曲がりくねったコース：賢さと騎手の戦略、長丁場：スタミナ
 */
export function horseRating(h: RaceHorse, p: CourseProfile, laps: number): number {
  const st = h.entry.horse.stats;
  const straight = Math.min(1.6, p.homeM / 400);
  let r =
    st.speed * (0.8 + 0.25 * straight) +
    st.stamina * 0.55 * Math.pow(laps / 5, 0.3) +
    st.power * (0.4 + 0.08 * Math.min(2, p.hillM / 8)) +
    st.intelligence * (0.3 + 0.08 * Math.min(3, p.twist - 1)) +
    h.entry.jockey.strategy * (0.28 + 0.05 * Math.min(3, p.twist - 1));
  r += (h.style.front ? 1 : -1) * 0.5 * (1 - straight);
  r += (h.abilityFactor - 1) * 40;
  r -= (h.postNumber - 1) * 0.02; // 内枠が少しだけ有利
  return r;
}

/**
 * 落馬（DNF）の確率：コースの危険度（狭さ・曲がりくねり方）× 馬の攻め気質（騎手の戦略値・逃げ・ムチを叩きすぎる騎手）
 */
export function dnfProbability(h: RaceHorse, p: CourseProfile, overWhipper: boolean): number {
  const narrow = Math.min(1, Math.max(0, (36 - p.widthM) / 10));
  const courseRisk = 0.004 + 0.008 * narrow + 0.004 * Math.max(0, p.twist - 1);
  const temper = 0.6 + (10 - h.entry.jockey.strategy) * 0.12 + (h.entry.horse.style === 'nige' ? 0.25 : 0) + (overWhipper ? 0.4 : 0);
  return Math.min(0.15, Math.max(0.002, courseRisk * temper));
}

const toOdds = (p: number) => {
  if (p <= 0) return MAX_ODDS;
  return Math.min(MAX_ODDS, Math.max(MIN_ODDS, Math.round(((1 - TAKEOUT) / p) * 10) / 10));
};

/** 標準ガンベル分布の乱数（実力 + これ で並べると、実力に応じた着順のばらつきになる） */
const gumbel = () => -Math.log(-Math.log(Math.random() * 0.999999 + 1e-9));

/**
 * ブックメーカーのオッズ表を作る。
 * 実力に応じた着順の分布を、レースを何万回も簡易に試行して数える（落馬する馬を先に決め、残りを実力 + 乱数で並べる）。
 * 強い馬は上位の着順、中堅は中団、下位の馬は後方の着順が低倍率になる山型の分布になる。
 */
export function computeOddsMatrix(race: Race): OddsMatrix {
  const horses = [...race.horses].sort((a, b) => a.postNumber - b.postNumber);
  const n = horses.length;
  const prof = courseProfile(race.track);
  const ratings = horses.map((h) => horseRating(h, prof, race.laps));
  // 実力差の効き方（大きいほど荒れる）。本命の単勝が 2 倍台になるくらい
  const T = 0.55;
  const dnf = horses.map((h) => {
    const ai = race.ai.get(h);
    return dnfProbability(h, prof, ai ? ai.whipLimit >= RACE_CONFIG.whipPenaltyCount : false);
  });
  const counts = horses.map(() => new Array(n + 1).fill(0));
  const score = new Array<number>(n);
  const order: number[] = [];
  for (let s = 0; s < SAMPLES; s++) {
    order.length = 0;
    for (let i = 0; i < n; i++) {
      if (Math.random() < dnf[i]) counts[i][n]++;
      else {
        score[i] = ratings[i] / T + gumbel();
        order.push(i);
      }
    }
    order.sort((a, b) => score[b] - score[a]);
    order.forEach((i, k) => counts[i][k]++);
  }
  const probs = counts.map((row) => row.map((c) => c / SAMPLES));
  const odds = probs.map((row) => row.map(toOdds));
  return { horses, n, probs, odds };
}
