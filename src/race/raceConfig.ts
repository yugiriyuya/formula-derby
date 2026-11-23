/**
 * レースと走行の調整値。
 * 速度・距離は実寸（m/s・m）で持ち、ワールドの縮尺（metersPerBlock）とは独立させている。
 * 表示の km/h = m/s × 3.6。能力値（1〜10）がどう効くかもここで決める。
 */
export const RACE_CONFIG = {
  laps: 5,
  countdownSeconds: 3,
  /** スタート位置（ゴール板の何 m 手前か） */
  startBehindLine: 6,

  // --- 速度（m/s, m/s²） ---
  /** 最高速度 = base + speed能力 × perStat （能力 7 で約 70km/h） */
  topSpeedBase: 17.6,
  topSpeedPerStat: 0.28,
  /** 加速度 = base + power能力 × perStat */
  accelBase: 3.6,
  accelPerStat: 0.24,
  brakeDecel: 12,
  /** 何も押していない時の減速 */
  coastDecel: 0.6,
  /** 最高速度を上回っている時（ムチ切れ・スタミナ切れ）に落ちていく減速度 */
  overSpeedDecel: 6,

  // --- 進路取り（m/s, m） ---
  steerRate: 8,
  /** 外ラチ・内ラチとの最小間隔 */
  railMargin: 1.0,

  // --- 坂 ---
  /** 勾配による最高速度の変化 = slope × (base - power能力 × perStat) */
  slopeEffectBase: 2.2,
  slopeEffectPerStat: 0.12,

  // --- スタミナ（0〜100） ---
  /** 最高速度に対してこの割合を超えるとスタミナを消耗、下回ると回復 */
  staminaCruiseRatio: 0.85,
  staminaDrainBase: 4.0,
  /** 登り坂での追加消耗 = 勾配 × この値 × (1.2 - power能力 × 0.05) */
  staminaHillDrain: 8,
  staminaDrainPerStat: 0.3,
  staminaRecoverMax: 1.5,
  /** スタミナがこの値を下回ると最高速度が落ち始める */
  staminaTiredThreshold: 30,
  staminaTiredPenalty: 0.2,

  // --- ムチ ---
  whipDuration: 1.5,
  whipCooldown: 0.6,
  whipStaminaCost: 5,
  /** 最高速度の上乗せ = base + 賢さ能力 × perStat */
  whipBoostBase: 0.06,
  whipBoostPerStat: 0.006,
  /** 1 周でこの回数以上使うとペナルティ対象（ペナルティ処理は次のステップ） */
  whipPenaltyCount: 5,

  // --- ピット（m/s, m） ---
  /** ピットレーン速度制限（50km/h） */
  pitSpeedLimit: 50 / 3.6,
  pitLimiterDecel: 12,
  /** ピット入口の何 m 手前から内側へ自動で寄せるか */
  pitApproachDistance: 140,
  pitApproachSteerRate: 6,
  pitLaneSteerRate: 12,
  /** 蹄鉄交換の作業時間 = base - 騎手の戦略値 × perStat（秒） */
  pitWorkBase: 4.5,
  pitWorkPerStat: 0.25,
  /** ピット停止中のスタミナ回復（/秒） */
  pitStaminaRecover: 3,

  // --- 演出 ---
  /** 走りのアニメーション：1m 進むごとの脚の位相（完歩 約 7m） */
  gallopPhasePerMeter: 0.9,
};
