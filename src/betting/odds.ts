import type { CourseTrack } from '../course/CourseTrack';
import type { Race } from '../race/Race';
import type { RaceHorse } from '../race/RaceHorse';
import { RACE_CONFIG } from '../race/raceConfig';

/** 控除率（払戻率 80%）と、オッズの最小・最大 */
export const TAKEOUT = 0.2;
export const MIN_ODDS = 1.1;
export const MAX_ODDS = 250;

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
  /** 着順の分布の元にした実力（ガンベル尺度）と、落馬の確率 */
  ratings: number[];
  dnf: number[];
  /** 混ぜた事前シミュレーション（試走）の回数（0 = 能力評価だけ） */
  trials: number;
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
 * 馬の実力（レース前の見立て）。実際のレース処理を 10 コース × 12 / 16 頭で数百レース走らせた着順に
 * Plackett-Luce モデルを当てはめた係数（ガンベル乱数 1 の尺度。差 1.0 で「先着しやすさ」が約 e 倍）。
 *  - いちばん効くのはスピード。脚質は直線の長さしだい（短い直線・小回りは逃げ・先行、長い直線は差し・追込）
 *  - 馬群の接戦（ラバーバンド）があるので、能力差の効き方は小さめ
 */
export function horseRating(h: RaceHorse, p: CourseProfile, laps: number): number {
  const st = h.entry.horse.stats;
  const straight = Math.min(1.6, p.homeM / 400);
  const hill = Math.min(2, p.hillM / 8);
  const twist = Math.min(3, Math.max(0, p.twist - 1));
  const style = h.entry.horse.style;
  let r =
    st.speed * 0.34 +
    st.stamina * 0.012 * Math.max(0, laps / 5 - 1) -
    st.intelligence * 0.1 +
    h.entry.jockey.strategy * 0.01 * twist +
    st.power * 0.03 * hill;
  r += style === 'nige' ? -0.29 : style === 'senko' ? -0.33 : style === 'oikomi' ? 0.51 : 0;
  // 直線が短い・小回りのコースでは先行勢が粘り、直線が長いコースでは差し・追込が届く
  if (h.style.front) r += 0.7 * (1 - straight);
  r += (h.abilityFactor - 1) * 14;
  r -= (h.postNumber - 1) * 0.005; // 内枠がほんの少しだけ有利
  return r;
}

/**
 * 落馬（DNF）の確率。実レースの結果に当てはめた見立て：
 *  - スタミナ切れ（主な原因）：スタミナの低い馬、戦略値の低い（脚を読み違えやすい）騎手、逃げ馬
 *  - ラチへの衝突：コースの狭さ・曲がりくねり方 × 攻め気（ムチを叩きすぎる騎手）
 */
export function dnfProbability(h: RaceHorse, p: CourseProfile, overWhipper: boolean, laps = 5): number {
  const st = h.entry.horse.stats;
  // 10 周・20 周は最終周のスタミナ切れが 5 周より少し多い
  const longRace = laps > 6 ? 1.6 : 1;
  // 逃げ馬は空気抵抗をまともに受けるので、スタミナが低いと最終周に脚が尽きやすい
  const lowStamina = Math.max(0, 7 - st.stamina);
  const exhaustion =
    longRace * (h.entry.horse.style === 'nige' ? 0.015 + 0.01 * lowStamina : 0.002 + 0.003 * lowStamina + 0.001 * Math.max(0, 5 - h.entry.jockey.strategy));
  const narrow = Math.min(1, Math.max(0, (36 - p.widthM) / 10));
  const rail = (0.001 + 0.003 * narrow + 0.001 * Math.max(0, p.twist - 1)) * (overWhipper ? 1.5 : 1);
  return Math.min(0.3, Math.max(0.003, exhaustion + rail));
}

const toOdds = (p: number) => {
  if (p <= 0) return MAX_ODDS;
  return Math.min(MAX_ODDS, Math.max(MIN_ODDS, Math.round(((1 - TAKEOUT) / p) * 10) / 10));
};

/** 標準ガンベル分布の乱数（実力 + これ で並べると、実力に応じた着順のばらつきになる） */
const gumbel = () => -Math.log(-Math.log(Math.random() * 0.999999 + 1e-9));

/**
 * オッズの形を整える調整値（ブックメーカーの「見立て」）。
 *  - 本命の 1 着の確率は favoriteMax まで（オッズ 2.5 倍くらいから）。それより偏る時は分布をならす
 *  - 馬群の紛れ・展開のブレとして、どの馬のどの着順にも少しずつ確率を残す（floor）。最下位人気でも 150 倍くらいまで
 */
export const ODDS_SHAPE = {
  /** 能力評価で着順を見積もる試行回数 */
  samples: 12000,
  /**
   * 能力差の効き方（小さいほど実力どおりに決まる見立て）。実レースの上位の着順に当てはめた値（勝ち馬だけなら 0.77、
   * 上位 2〜3 着なら 1.0）。強い馬への偏りは shape で favoriteMax まで抑える
   */
  temperature: 0.85,
  /** 事前シミュレーションで実力を補正する時の、能力評価への引き戻しの強さ（大きいほど能力評価寄り） */
  trialPrior: 4,
  /** 本命の 1 着確率の上限（控除 20% でオッズ約 2.5 倍） */
  favoriteMax: 0.31,
  /** 一様な分布を混ぜる割合（紛れ） */
  floor: 0.1,
};

/** 着順の確率（行 = 馬、列 = 1 着〜n 着）を、行の和 rows・列の和 cols に合うように反復で揃える */
function sinkhorn(q: number[][], rows: number[], cols: number[], iterations = 40) {
  const n = q.length;
  const m = cols.length;
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < n; i++) {
      const sum = q[i].reduce((a, b) => a + b, 0);
      if (sum > 0) for (let k = 0; k < m; k++) q[i][k] *= rows[i] / sum;
    }
    for (let k = 0; k < m; k++) {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += q[i][k];
      if (sum > 0) for (let i = 0; i < n; i++) q[i][k] *= cols[k] / sum;
    }
  }
}

/**
 * 着順の確率 place[i][k]（落馬しない場合の分は rows[i] = 1 − DNF 確率）を、オッズ向けの滑らかな分布にする。
 * 確率を γ 乗してならし（γ は本命の 1 着が favoriteMax を超えないように二分探索）、行・列の和を揃え直し、
 * 最後に「紛れ」として行と列の和に比例した一様分布を少し混ぜる。
 */
function shape(place: number[][], rows: number[]): number[][] {
  const n = place.length;
  const cols = Array.from({ length: n }, (_, k) => place.reduce((a, r) => a + r[k], 0));
  const total = rows.reduce((a, b) => a + b, 0);
  const f = ODDS_SHAPE.floor;
  const build = (gamma: number) => {
    const q = place.map((r) => r.map((p) => Math.pow(Math.max(p, 1e-6), gamma)));
    sinkhorn(q, rows, cols);
    return q.map((r, i) => r.map((p, k) => (1 - f) * p + (f * rows[i] * cols[k]) / total));
  };
  const maxWin = (q: number[][]) => Math.max(...q.map((r) => r[0]));
  let q = build(1);
  if (maxWin(q) > ODDS_SHAPE.favoriteMax) {
    let lo = 0.2;
    let hi = 1;
    for (let it = 0; it < 18; it++) {
      const mid = (lo + hi) / 2;
      if (maxWin(build(mid)) > ODDS_SHAPE.favoriteMax) hi = mid;
      else lo = mid;
    }
    q = build(lo);
  }
  return q;
}

/** 確率（着順 + DNF）からオッズ表を作る */
function finalize(horses: RaceHorse[], place: number[][], dnf: number[], ratings: number[], trials: number): OddsMatrix {
  const shaped = shape(place, dnf.map((d) => 1 - d));
  const probs = shaped.map((r, i) => [...r, dnf[i]]);
  const odds = probs.map((row) => row.map(toOdds));
  return { horses, n: horses.length, probs, odds, ratings, dnf, trials };
}

/** 実力 ratings（ガンベル尺度）から、落馬しなかった場合の着順の分布を簡易に何千回も試行して数える */
function placeDistribution(ratings: readonly number[]): number[][] {
  const n = ratings.length;
  const S = ODDS_SHAPE.samples;
  const counts = ratings.map(() => new Array(n).fill(0));
  const score = ratings.map(() => 0);
  const order = ratings.map((_, i) => i);
  for (let s = 0; s < S; s++) {
    for (let i = 0; i < n; i++) score[i] = ratings[i] + gumbel();
    order.sort((a, b) => score[b] - score[a]);
    order.forEach((i, k) => counts[i][k]++);
  }
  return counts.map((row) => row.map((c) => c / S));
}

function fromRatings(horses: RaceHorse[], ratings: number[], dnf: number[], trials: number): OddsMatrix {
  const place = placeDistribution(ratings).map((r, i) => r.map((p) => p * (1 - dnf[i])));
  return finalize(horses, place, dnf, ratings, trials);
}

/**
 * ブックメーカーのオッズ表（能力評価だけの見立て）。
 * 能力値をコースで重み付けした実力に乱数を足して並べる試行を何千回もして、着順の分布を数える（落馬は別に見積もる）。
 * レース前の画面では、この後に事前シミュレーション（試走）の結果で実力を補正する（blendTrials）。
 */
export function computeOddsMatrix(race: Race): OddsMatrix {
  const horses = [...race.horses].sort((a, b) => a.postNumber - b.postNumber);
  const prof = courseProfile(race.track);
  const ratings = horses.map((h) => horseRating(h, prof, race.laps) / ODDS_SHAPE.temperature);
  const dnf = horses.map((h) => {
    const ai = race.ai.get(h);
    return dnfProbability(h, prof, ai ? ai.whipLimit >= RACE_CONFIG.whipPenaltyCount : false, race.laps);
  });
  return fromRatings(horses, ratings, dnf, 0);
}

/**
 * 事前シミュレーション（試走）の着順で、能力評価の実力を補正してオッズを作り直す。
 * 試走の着順の並びに Plackett-Luce モデルを当てはめる（能力評価の値を中心にした事前分布つき。
 * 試走が少ないうちは能力評価に近く、試走で何度も先着した馬ほど実力を上げる）。
 * 着順ごとの分布は補正した実力から作り直すので、試走の回数が少なくても山型のなめらかな形になる。
 * @param orders 試走ごとの着順（horses の添字を 1 着から並べたもの。落馬した馬は入れない）
 */
const TRIAL_TOP = 3;

export function blendTrials(m: OddsMatrix, orders: readonly number[][]): OddsMatrix {
  const n = m.n;
  const prior = m.ratings;
  const r = [...prior];
  const lambda = ODDS_SHAPE.trialPrior;
  const step = 0.6 / Math.max(1, orders.length);
  for (let it = 0; it < 150; it++) {
    const g = r.map((x, i) => -lambda * (x - prior[i]));
    for (const order of orders) {
      // 1 着から順に「残りの中で先着する」確率の勾配
      const ex = order.map((i) => Math.exp(r[i]));
      let tail = ex.reduce((a, b) => a + b, 0);
      const acc = new Array(n).fill(0);
      let inv = 0;
      // 上位 TRIAL_TOP 着までの並びだけを使う（能力評価と同じ「上位の決まり方」の尺度で補正するため）
      const top = Math.min(TRIAL_TOP, order.length - 1);
      for (let k = 0; k < top; k++) {
        inv += 1 / tail;
        g[order[k]] += 1;
        acc[order[k]] = inv;
        tail -= ex[k];
      }
      for (let k = top; k < order.length; k++) acc[order[k]] = inv;
      order.forEach((i, k) => (g[i] -= ex[k] * acc[i]));
    }
    for (let i = 0; i < n; i++) r[i] += step * g[i];
  }
  return fromRatings(m.horses, r, m.dnf, orders.length);
}
