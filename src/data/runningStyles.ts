/**
 * 脚質（レースの運び方の個性）。
 *  逃げ・先行 … 前で運ぶ。ハイペースでもスタミナを使いにくいが、ムチの伸びは控えめ
 *  差し・追込 … 後ろで脚をためる。道中はスタミナを使いやすいが、ムチを打った時の加速・伸びが大きい
 */
export type RunningStyle = 'nige' | 'senko' | 'sashi' | 'oikomi';

export interface RunningStyleSpec {
  label: string;
  /** 前で運ぶタイプか（逃げ・先行） */
  front: boolean;
  /** ハイペースで走っている時のスタミナ消耗の倍率 */
  highPaceDrain: number;
  /** 道中（ハイペース以外）のスタミナ消耗の倍率 */
  cruiseDrain: number;
  /** ムチの効き（最高速度の上乗せ・加速・叩いた瞬間の伸び）の倍率 */
  whipPower: number;
  /** AI：馬群の中心から何 m 前（+）／後ろ（−）を走りたいか */
  aiPosition: number;
  /** AI：ゴールまで残り何 m からスパートするか */
  aiSpurt: number;
  /** AI：最後の直線用にさらに温存するスタミナ */
  aiExtraReserve: number;
}

export const RUNNING_STYLES: Record<RunningStyle, RunningStyleSpec> = {
  nige: { label: '逃げ', front: true, highPaceDrain: 0.8, cruiseDrain: 0.92, whipPower: 0.85, aiPosition: 15, aiSpurt: 650, aiExtraReserve: 0 },
  senko: { label: '先行', front: true, highPaceDrain: 0.87, cruiseDrain: 0.96, whipPower: 0.95, aiPosition: 10, aiSpurt: 700, aiExtraReserve: 0 },
  sashi: { label: '差し', front: false, highPaceDrain: 1.1, cruiseDrain: 1.12, whipPower: 1.3, aiPosition: -8, aiSpurt: 850, aiExtraReserve: 6 },
  oikomi: { label: '追込', front: false, highPaceDrain: 1.2, cruiseDrain: 1.2, whipPower: 1.45, aiPosition: -20, aiSpurt: 950, aiExtraReserve: 10 },
};
