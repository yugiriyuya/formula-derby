/**
 * 脚質（レースの運び方の個性）。
 *  逃げ・先行 … 前で運ぶ。風よけ（スリップストリーム）を使えないぶんスタミナを使いやすく、ムチの伸びも控えめ
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
  /** 最終盤の末脚：最高速度の上乗せ率（差し・追込のみ。コースの直線が長いほど大きい） */
  kick: number;
}

export const RUNNING_STYLES: Record<RunningStyle, RunningStyleSpec> = {
  // 逃げ・先行：前で風を受け、スリップストリームを使えないぶん消耗しやすい
  nige: { label: '逃げ', front: true, highPaceDrain: 1.05, cruiseDrain: 1.06, whipPower: 0.85, aiPosition: 12, aiSpurt: 650, aiExtraReserve: 0, kick: 0 },
  senko: { label: '先行', front: true, highPaceDrain: 0.97, cruiseDrain: 1.0, whipPower: 1.02, aiPosition: 7, aiSpurt: 700, aiExtraReserve: 0, kick: 0 },
  // 差し・追込：道中は後ろで脚をためる（巡航の消耗は控えめ）。ハイペースで動くと消耗が大きい。最後の直線用に多めに温存
  sashi: { label: '差し', front: false, highPaceDrain: 1.05, cruiseDrain: 0.96, whipPower: 1.28, aiPosition: -6, aiSpurt: 850, aiExtraReserve: 10, kick: 0.025 },
  oikomi: { label: '追込', front: false, highPaceDrain: 1.1, cruiseDrain: 0.9, whipPower: 1.52, aiPosition: -14, aiSpurt: 950, aiExtraReserve: 16, kick: 0.04 },
};
