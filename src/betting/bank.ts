import type { Race } from '../race/Race';
import type { RaceHorse } from '../race/RaceHorse';

/** 初期資金（100 万円） */
export const INITIAL_BANKROLL = 1_000_000;
const KEY = 'formula-derby-bankroll';

/** 所持金（ブラウザに自動保存） */
export class Bankroll {
  private value: number;
  /** 所持金が変わった時に呼ばれる（表示の更新用） */
  onChange?: (value: number) => void;

  constructor() {
    let v = NaN;
    try {
      v = Number(localStorage.getItem(KEY));
    } catch {
      v = NaN;
    }
    this.value = localStorage.getItem(KEY) !== null && Number.isFinite(v) ? Math.max(0, Math.round(v)) : INITIAL_BANKROLL;
  }

  get balance(): number {
    return this.value;
  }

  private set(v: number) {
    this.value = Math.max(0, Math.round(v));
    try {
      localStorage.setItem(KEY, String(this.value));
    } catch {
      // 保存できなくても、このページの中では続けられる
    }
    this.onChange?.(this.value);
  }

  /** 賭け金を差し引く（足りなければ false） */
  withdraw(amount: number): boolean {
    if (amount > this.value) return false;
    this.set(this.value - amount);
    return true;
  }

  deposit(amount: number) {
    this.set(this.value + amount);
  }

  /** 資金リセット（再融資）：初期資金に戻す */
  reset() {
    this.set(INITIAL_BANKROLL);
  }
}

/** 1 つの買い目：horse が position 着（'DNF' = 落馬）になる、に stake 円 */
export interface Bet {
  entryId: string;
  horseName: string;
  postNumber: number;
  /** 予想の着順（1〜頭数）か DNF */
  pick: number | 'DNF';
  odds: number;
  stake: number;
}

/** 的中判定の結果 */
export interface SettledBet extends Bet {
  /** 実際の着順か DNF */
  actual: number | 'DNF';
  hit: boolean;
  payout: number;
}

export interface BetReport {
  bets: SettledBet[];
  totalStake: number;
  totalPayout: number;
  /** 今回のレースの収支（払戻 − 賭け金） */
  profit: number;
}

/** 実際の結果：着順、落馬は DNF */
export function actualResult(h: RaceHorse): number | 'DNF' {
  return h.retired || h.finishPosition === null ? 'DNF' : h.finishPosition;
}

/** レース後の的中判定。払戻 = 賭け金 × オッズ（円未満は切り捨て） */
export function settleBets(bets: readonly Bet[], race: Race): BetReport {
  const settled = bets.map((b) => {
    const h = race.horses.find((x) => x.entry.id === b.entryId);
    const actual = h ? actualResult(h) : 'DNF';
    const hit = actual === b.pick;
    return { ...b, actual, hit, payout: hit ? Math.floor(b.stake * b.odds) : 0 };
  });
  const totalStake = settled.reduce((a, b) => a + b.stake, 0);
  const totalPayout = settled.reduce((a, b) => a + b.payout, 0);
  return { bets: settled, totalStake, totalPayout, profit: totalPayout - totalStake };
}

export const yen = (v: number) => `¥${Math.round(v).toLocaleString('ja-JP')}`;
export const signedYen = (v: number) => `${v >= 0 ? '+' : '-'}¥${Math.abs(Math.round(v)).toLocaleString('ja-JP')}`;
