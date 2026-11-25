/**
 * レースと走行の調整値。
 * 速度・距離は実寸（m/s・m）で持ち、ワールドの縮尺（metersPerBlock）とは独立させている。
 * 表示の km/h = m/s × 3.6。能力値（1〜10）がどう効くかもここで決める。
 */
export const RACE_CONFIG = {
  laps: 5,
  /** スタート位置（ゴール板の何 m 手前か） */
  startBehindLine: 6,

  // --- F1 式 5 レッドライト ---
  /** 最初の赤ランプが点くまでの時間と、1 つずつ点灯する間隔（秒） */
  startLightsDelay: 1.0,
  startLightsInterval: 1.0,
  /** 5 つ点灯してからブラックアウト（ゲート開放）までのランダムな待ち時間（秒） */
  lightsOutHoldMin: 0.5,
  lightsOutHoldMax: 1.8,

  // --- 発馬（ゲートが開いた瞬間の反応） ---
  /** 発馬の良し悪しの判定 = 運 × luckWeight + (賢さ + パワー) / 20 × (1 - luckWeight) */
  startLuckWeight: 0.75,
  /** この値以上でロケットスタート、lateStartThreshold 未満で出遅れ（どちらも能力 6〜7 で約 15%） */
  rocketStartThreshold: 0.78,
  lateStartThreshold: 0.28,
  /** 反応の遅れ（秒）：普通 / 出遅れ */
  normalReaction: [0.08, 0.25] as const,
  lateReaction: [0.5, 0.95] as const,
  /** ロケットスタート：最初の数秒だけ加速が増す */
  rocketDuration: 2.5,
  rocketAccelMultiplier: 1.8,

  // --- 速度（m/s, m/s²） ---
  /** 最高速度 = base + speed能力 × perStat （能力 7 で約 70km/h） */
  topSpeedBase: 17.6,
  topSpeedPerStat: 0.14,
  /** 加速度 = base + power能力 × perStat */
  accelBase: 3.6,
  accelPerStat: 0.24,
  brakeDecel: 12,
  /** ペースを落とした時、目標の巡航速度まで落としていく減速度（m/s²） */
  paceEaseDecel: 2.0,
  /** 何も押していない時の減速 */
  coastDecel: 0.6,
  /** 最高速度を上回っている時（ムチ切れ・スタミナ切れ）に落ちていく減速度 */
  overSpeedDecel: 6,

  // --- 進路取り（m/s, m） ---
  steerRate: 8,

  // --- ラチ（柵）への衝突 = 落馬 ---
  /** 馬体の半幅とラチの支柱の半幅（m）。馬の中心がラチからこの合計より近づくと柵に衝突して落馬 */
  horseHalfWidth: 0.4,
  railPostHalfWidth: 0.12,
  /** ラチからこの距離（m）以内に寄ると HUD で注意を出す */
  railWarningDistance: 1.2,
  /** 落馬した馬が倒れている時間（秒）。その後コース脇（ラチの外 retireClearOffset m）へ退避 */
  retireFallSeconds: 3,
  retireClearOffset: 3,

  // --- 馬同士の接触 ---
  /** 横からぶつかりに行った速さ（m/s）がこれ以上なら加害側にペナルティ */
  contactSideSpeed: 1.0,
  /** 後ろから追突した時の速度差（m/s）がこれ以上なら追突した側にペナルティ */
  contactRearSpeed: 2.0,
  /** 通常の接触のペナルティ（秒）。落馬させた時は STOP & GO（stopGoSeconds） */
  contactPenaltySeconds: 2,
  /** 同じ 2 頭の接触で続けてペナルティを出さない間隔（秒） */
  contactCooldown: 4,
  /** 接触・押し出しの後この秒数以内に相手がラチに衝突したら「落馬させた」と判定 */
  crashBlameWindow: 1.5,
  /** STOP & GO：次のピットインでピットボックスに完全停止する時間（秒）。消化しないままゴールしたら加算する秒数 */
  stopGoSeconds: 10,
  unservedStopGoPenalty: 20,

  // --- セーフティホース（SC） ---
  /** SC 中の全馬の最高速度（50km/h）と、SC が先導する速さ */
  scSpeedLimit: 50 / 3.6,
  scLeadSpeed: 40 / 3.6,
  /** 先頭の馬がピット出口の手前この距離（m）まで来たら、SC がコースインして前に入る */
  scLaunchDistance: 130,
  /** 追い越し禁止：前の馬（または SC）とこの距離（m）以内に詰まったら、それ以上速く走れない */
  scQueueGap: 9,
  /** ピット入口に差しかかった時、最低この周回数を先導済みで馬群が scBunchLength（m）以内なら戻る（最長 scMaxLeadLaps 周） */
  scMinLeadLaps: 0.7,
  scMaxLeadLaps: 1.5,
  scBunchLength: 220,
  /** GREEN FLAG の表示時間（秒） */
  greenFlagSeconds: 3,

  // --- 坂 ---
  /** 勾配による最高速度の変化 = slope × (base - power能力 × perStat) */
  slopeEffectBase: 2.2,
  slopeEffectPerStat: 0.12,

  // --- スタミナ（0〜100） ---
  /**
   * 最高速度に対してこの割合を超えると速さに応じて消耗が増える。
   * レース中の回復はない（ピットイン完了時の pitStaminaBonus だけ）。どんなにゆっくりでも staminaMinDrain（/秒）は減り続け、
   * 例外は「折り合い＋スリップストリーム中」だけ（±0）
   */
  staminaCruiseRatio: 0.85,
  staminaMinDrain: 0.035,
  /** スタミナの減り方の基準にする 1 周の長さ（m）。これより長いコースは 1 秒あたりの減りを小さくする */
  staminaRefLapM: 1800,
  /** スタミナが 0 になると脚がもつれて落馬（DNF） */
  staminaCollapse: true,
  staminaDrainBase: 4.0,
  /** 登り坂での追加消耗 = 勾配 × この値 × (1.2 - power能力 × 0.05) */
  staminaHillDrain: 8,
  staminaDrainPerStat: 0.3,
  staminaRecoverMax: 1.5,
  /** 消耗全体にかける倍率。最終ラップの直線でムチを打てるだけ残るよう、以前（1.0）より軽くしている */
  staminaDrainScale: 0.7,
  /** スタミナがこの値を下回ると最高速度が落ち始める */
  staminaTiredThreshold: 15,
  staminaTiredPenalty: 0.05,
  /** AI が最後の直線のムチ用に温存しておくスタミナ */
  aiStaminaReserve: 28,
  /**
   * AI のスタミナの読み違い：読み違える騎手の割合 = chance + (10 − 戦略値) × perStat。
   * 読み違える量 = min + 乱数 × range ×（0.5 + 攻め気）。スタミナ切れ落馬（終盤の波乱）の起きやすさ
   */
  aiMisreadChance: 0.15,
  aiMisreadPerStat: 0.03,
  aiMisreadMin: 6,
  aiMisreadRange: 12,

  // --- 馬群の接戦（ラバーバンド） ---
  /**
   * 先頭から離された馬ほど最高速度が上がる（馬群が追いつく流れ）：
   * 上乗せ = (先頭との差 m − rubberBandFreeM) × rubberBandPerM、最大 rubberBandMax。この上乗せの分はスタミナを使わない
   */
  rubberBandFreeM: 24,
  /** 最終周は馬群をさらに詰める（この距離より離された分から上乗せ） */
  rubberBandFinalLapFreeM: 20,
  rubberBandPerM: 0.006,
  rubberBandMax: 0.14,
  /** 先頭（または前に風よけのいない逃げ馬）は空気抵抗をまともに受け、スタミナの減りがこの倍率 */
  leadDragDrain: 1.12,

  // --- 差し・追込の末脚 ---
  /**
   * 最終周の残り kickDistanceM（最後の直線が長ければ直線の入口から）で、スタミナが kickMinStamina 以上残っている
   * 差し・追込は最高速度・加速・ムチの効きが上がる（脚質ごとの kick × コースの直線の長さ）
   */
  kickDistanceM: 600,
  kickMinStamina: 18,
  /** 直線の長さによる末脚の効き = 直線(m) / kickStraightRefM（0.45〜1.5） */
  kickStraightRefM: 380,
  kickAccelMultiplier: 1.6,

  // --- スリップストリーム（前の馬の真後ろで風よけ） ---
  /** 前の馬との距離（m）と横のずれ（m）がこの範囲なら発動 */
  slipstreamMinGap: 1.5,
  slipstreamMaxGap: 14,
  slipstreamWidth: 1.6,
  /** これより遅い時（m/s）は発動しない */
  slipstreamMinSpeed: 8,
  /** 最高速度の上乗せ（m/s。+3km/h）と、スタミナ消耗の軽減率 */
  slipstreamSpeedBonus: 3 / 3.6,
  slipstreamDrainCut: 0.75,

  // --- 馬場の荒れ ---
  /** 1 頭が 1 回ブロックを踏むごとに増える荒れ度（0〜1。約 17 回で土が見えるほど荒れる。5 周で主なラインが茶色くなる程度） */
  turfWearPerStep: 0.06,
  /** 荒れきった（荒れ度 1）馬場での最高速度の低下率。蹄鉄が硬いほど影響が小さい */
  roughPenalty: { SOFT: 0.09, RAIN: 0.05, HARD: 0.03 } as Record<'SOFT' | 'HARD' | 'RAIN', number>,

  // --- ムチ（直線での追い抜き・差し切りの決め手） ---
  whipDuration: 2.2,
  whipCooldown: 1.0,
  whipStaminaCost: 6,
  /** 最高速度の上乗せ = base + 賢さ能力 × perStat（能力 7 で約 +21%） */
  whipBoostBase: 0.09,
  whipBoostPerStat: 0.008,
  /** 叩いた瞬間の速度の上乗せ（m/s）と、効いている間の加速度の倍率 */
  whipImpulse: 1.5,
  whipAccelMultiplier: 2.5,
  /** スタミナが 0 の時のムチの効き（1 = 満タン時と同じ）。疲れた馬ほど反応が鈍い */
  whipTiredEffect: 0.5,
  /** 1 周でこの回数目以降のムチは、1 回ごとに whipPenaltySeconds のタイムペナルティ */
  whipPenaltyCount: 5,
  whipPenaltySeconds: 5,

  // --- ピット（m/s, m） ---
  /** ピットレーン速度制限（50km/h） */
  pitSpeedLimit: 50 / 3.6,
  pitLimiterDecel: 12,
  /** ピット入口の何 m 手前から内側へ自動で寄せるか */
  pitApproachDistance: 140,
  pitApproachSteerRate: 6,
  pitLaneSteerRate: 12,
  /**
   * 蹄鉄交換（4 人のクルー）の作業時間。ピットクルーの腕（1〜10）と運で 3 段階に分かれる（pitWorkTime を参照）。
   *  - 成功（FAST PIT）：約 2.0 秒（1.8〜2.4）
   *  - 普通：約 3.0 秒（2.6〜3.4）
   *  - 遅い／ミス（SLOW PIT）：4.0 秒以上、最悪のミスで 10.0 秒
   * 確率は腕 1 → 成功 5% / ミス 45%、腕 10 → 成功 60% / ミス 6% のあいだを直線で結ぶ
   */
  pitFastChance: [0.05, 0.6] as const,
  pitSlowChance: [0.45, 0.06] as const,
  pitFastTime: [1.8, 2.4] as const,
  pitNormalTime: [2.6, 3.4] as const,
  pitSlowMin: 4.0,
  pitSlowMax: 10.0,
  /** 騎手の戦略値 1 につき作業時間を何秒縮めるか（5 が基準） */
  pitWorkPerStat: 0.03,
  /** ピットイン完了時のスタミナ回復（レース中にスタミナが回復するのはここだけ） */
  pitStaminaBonus: 30,

  // --- 演出 ---
  /** 走りのアニメーション：1m 進むごとの脚の位相（完歩 約 7m） */
  gallopPhasePerMeter: 0.9,

  // --- 天候・風 ---
  /** 雨の日は芝が湿って荒れやすい（芝の荒れる速さの倍率） */
  rainTurfWear: 1.4,
  /** 風：進行方向の風速 1m/s あたりの最高速度の変化（m/s。追い風で +、向かい風で -） */
  windTopSpeedPerMs: 0.06,
  /** 風：進行方向の風速 1m/s あたりのムチの伸び（上乗せの速さ・叩いた瞬間の伸び）の変化の割合 */
  windWhipPerMs: 0.05,
  /** AI が雨の日にあえて晴れ用の蹄鉄で出る（ギャンブル）割合 */
  aiDryGambleChance: 0.15,

  // --- 実況 ---
  /** 実況の 1 馬身（m） */
  horseLengthMeters: 2.4,
  /** 先頭が 2 番手をこれだけ（m）離したら「大逃げ」 */
  breakawayGapMeters: 20,
  /** 最後方がすぐ前の馬からこれだけ（m）離されたら「離された追走」 */
  tailOffGapMeters: 18,
};

/** ペース（巡航速度とスタミナの使い方）。プレイヤーは W / S で切り替え、AI も同じ段階で走る */
export type PaceLevel = 'relaxed' | 'normal' | 'high';
export const PACE_ORDER: PaceLevel[] = ['relaxed', 'normal', 'high'];
export const PACE_LEVELS: Record<PaceLevel, { label: string; ratio: number; drain: number; recover: number }> = {
  /** 折り合い：最高速度の 84%。消耗が少ない（スリップストリーム中は ±0。レース中の回復はない） */
  relaxed: { label: '折り合い', ratio: 0.84, drain: 0.8, recover: 1.5 },
  /** 標準：最高速度の 93% */
  normal: { label: '標準', ratio: 0.93, drain: 1.0, recover: 1.0 },
  /** ハイペース：最高速度いっぱい。消耗が増える */
  high: { label: 'ハイペース', ratio: 1.0, drain: 1.15, recover: 1.0 },
};

/**
 * 周回数に合わせた調整。基準は 5 周（すべて 1 倍）。
 * 20 周では、蹄鉄の摩耗・芝の荒れ・スタミナの消耗を緩めて、長丁場でも
 * 「1 ストップ（ハード中心で長く引っ張る）」と「2 ストップ（ソフトで速く走ってこまめに替える）」の両方が成り立つようにする。
 *   - 蹄鉄：ハード 1 本で約 10 周（摩耗 約 6%/周）、ソフトは約 6 周で摩耗しきる
 *   - 芝：20 周走り終えた時の荒れ方が 5 周の時と同じくらいになる
 *   - スタミナ：レースの長さに応じて消耗を薄める（ピットでの回復もある）
 */
export interface RaceFormat {
  shoeWear: number;
  turfWear: number;
  stamina: number;
  /** AI のピット回数の候補（1 = 1 ストップ, 2 = 2 ストップ）と、2 ストップを選ぶ割合 */
  maxStops: 1 | 2;
  twoStopChance: number;
}

export function raceFormat(laps: number): RaceFormat {
  // 5 周：スタミナはピットでしか回復しないので、最後の直線で脚を使い切るかどうかの勝負になる消耗（1.3）
  if (laps <= 6) return { shoeWear: 1, turfWear: 1, stamina: 1.2, maxStops: 1, twoStopChance: 0 };
  const k = 5 / laps;
  return {
    // 10 周で 0.7（ソフト約 4.5 周・ハード約 12 周）、20 周で 0.5
    shoeWear: laps >= 12 ? Math.min(1, 10 / laps) : 0.7,
    turfWear: Math.max(0.25, k * 1.15),
    stamina: Math.max(0.3, Math.sqrt(k) * 0.68),
    maxStops: laps >= 12 ? 2 : 1,
    twoStopChance: laps >= 12 ? 0.5 : 0,
  };
}
