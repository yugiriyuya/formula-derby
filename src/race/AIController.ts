import type { TrackCondition } from '../data/horseshoes';
import { cruiseControls } from './pace';
import { PACE_LEVELS, RACE_CONFIG as C, type PaceLevel } from './raceConfig';
import type { HorseControls, RaceHorse } from './RaceHorse';
import type { SafetyHorse } from './SafetyHorse';

/** 追い比べ：この距離（m）以内の前・横にライバルがいたら競りかける */
const DUEL_RANGE_M = 10;

/** 他馬との位置関係を見る距離（m） */
const LOOK_AHEAD_M = 12;
/** 並走・追い越しに必要な横の間隔（m） */
const PASS_GAP_M = 2.2;
/** ラストスパートを始める残り距離（m） */
const SPURT_M = 800;

export interface AIContext {
  horses: readonly RaceHorse[];
  laps: number;
  condition: TrackCondition;
  time: number;
  /** コース上の (s, lateral) の荒れ度（0〜1） */
  wearAt: (s: number, lateral: number) => number;
  /** セーフティホース（出動中は追い越し禁止・1 列で走る・ムチを使わない） */
  safety: SafetyHorse;
}

/**
 * AI 騎手。プレイヤーと同じ HorseControls を毎フレーム作って馬を動かす。
 *  - ペース：スタミナ残量と残り距離から ハイペース／標準／折り合い を選び、最終盤はスパート
 *  - ムチ：最終周のホームストレッチは連打、追い比べでは競りかける（1 周 4 回までに抑えてペナルティを避ける）
 *  - 進路：コーナーでは内ラチ寄り、直線では各騎手の好みの位置。前が詰まったら空いている側へ
 *  - ピット：レース中に 1 回、予定した周の終わりにピットインして蹄鉄を替える
 * 騎手の戦略値（strategy）が高いほど、ペース配分・進路取りが上手い。
 */
export class AIController {
  /** この周回を走り終える直前（4コーナー出口のピット入口）でピットに入る */
  pitLap = 2;
  /** 直線で好んで走る横位置（ブロック）と、ペースの性格 */
  private preferredLateral = 0;
  private aggression = 0;
  private targetLateral = 0;
  private whipTimer = 0;
  /** 荒れを避けて選んだ今のライン（ブロック）と、選び直すまでの時間 */
  private cleanLine = 0;
  private lineTimer = 0;

  constructor(readonly horse: RaceHorse) {}

  /**
   * 荒れていない芝のラインを選ぶ。
   * 候補：ラチぎりぎりのグリーンベルト／いつものライン／2.5m ずつ外のライン。
   * 「この先の荒れ度 × 蹄鉄の荒れへの弱さ」と「外を回る距離のロス」を比べて一番よいもの。
   * 蹄鉄が柔らかい（SOFT）ほど荒れを嫌う。違いが小さい時は今のラインを続ける（ふらつき防止）。
   */
  private chooseCleanLine(ctx: AIContext): number {
    const h = this.horse;
    const track = h.track;
    const mpb = track.def.metersPerBlock;
    const half = track.def.trackWidth / 2;
    const sensitivity = C.roughPenalty[h.shoe] / C.roughPenalty.SOFT;
    // グリーンベルト（コースの端から 1.3m。ラチに触れないだけの余裕を残す）
    const candidates = [half - 1.3 / mpb, this.preferredLateral];
    for (let k = 1; k <= 4; k++) candidates.push(this.preferredLateral - (k * 2.5) / mpb);
    const score = (lat: number) => {
      let wear = 0;
      for (let d = 5; d <= 40; d += 7) wear += ctx.wearAt(h.s + d / mpb, lat);
      wear /= 6;
      // 外を回るロス：ラチから 1m 離れるごとに少しずつ不利
      const outsideM = (this.preferredLateral - lat) * mpb;
      return wear * 10 * sensitivity + Math.max(0, outsideM) * 0.04;
    };
    let best = this.cleanLine || this.preferredLateral;
    let bestScore = score(best) - 0.05; // 今のラインを少し優先
    for (const lat of candidates) {
      if (Math.abs(lat) > h.crashLimit - 1 / mpb) continue;
      const sc = score(lat);
      if (sc < bestScore) {
        best = lat;
        bestScore = sc;
      }
    }
    return best;
  }

  /** レース開始時に作戦を決める */
  plan(laps: number, rand: () => number, teammatePitLap: number | null) {
    const half = this.horse.track.def.trackWidth / 2;
    const strategy = this.horse.entry.jockey.strategy;
    // 1 回ピットの周：レースの中盤。僚馬とは同じ周に入らない（ピットボックスが空くように）
    const first = Math.max(1, Math.floor(laps * 0.3));
    const last = Math.max(first, laps - 1);
    let lap = first + Math.floor(rand() * (last - first + 1));
    if (teammatePitLap !== null && lap === teammatePitLap && last > first) lap = lap === last ? lap - 1 : lap + 1;
    this.pitLap = laps >= 2 ? lap : 0;
    // 基本は内ラチ沿い（距離が最短）。戦略値が高いほどラチぎりぎりを回る
    const railGapM = 1.6 + rand() * 0.8 + (10 - strategy) * 0.08;
    this.preferredLateral = half - railGapM / this.horse.track.def.metersPerBlock;
    this.aggression = rand();
    this.targetLateral = this.horse.lateral;
    this.whipTimer = 0;
    this.cleanLine = this.preferredLateral;
    this.lineTimer = 0;
  }

  decide(dt: number, ctx: AIContext): HorseControls {
    const h = this.horse;
    const track = h.track;
    const def = track.def;
    const mpb = def.metersPerBlock;
    const half = def.trackWidth / 2;

    // --- ピット要求 ---
    if (this.pitLap > 0 && h.pitCount === 0 && !h.pitRequested && h.lapsCompleted === this.pitLap - 1) {
      h.togglePitRequest();
    }

    // --- 目標ペース ---
    const top = h.topSpeed(ctx.condition);
    const remainingM = (ctx.laps * track.length - h.progress) * mpb;
    const finalSpurt = remainingM < SPURT_M;
    // ペースはプレイヤーと同じ 3 段階（スタミナの減り方もペースで変わる）
    let pace: PaceLevel;
    let ratio: number;
    if (h.finished) {
      pace = 'relaxed';
      ratio = 0.35;
    } else if (finalSpurt) {
      pace = 'high';
      ratio = h.stamina > 8 ? 1.05 : 0.97;
    } else {
      // 最後の直線のムチ用のスタミナ（aiStaminaReserve）は温存し、残りを残り周回に割り振る。
      // 1 周あたりの予算：ハイペースは約 23、標準は約 11 消耗する
      const lapsLeft = remainingM / (track.length * mpb);
      const budget = Math.max(0, h.stamina - C.aiStaminaReserve) / Math.max(0.5, lapsLeft);
      pace = budget > 23 ? 'high' : budget > 11 ? 'normal' : 'relaxed';
      ratio = PACE_LEVELS[pace].ratio + (this.aggression - 0.5) * 0.03;
    }
    h.paceLevel = pace;
    let targetSpeed = top * Math.min(1.05, ratio);

    // --- 進路取り ---
    // 基本は内ラチ沿い（荒れてきたらきれいな芝のライン）。外へ持ち出すのは「抜きたい時」と「内が塞がっている時」だけ
    this.lineTimer -= dt;
    if (this.lineTimer <= 0) {
      this.lineTimer = 0.5;
      this.cleanLine = this.chooseCleanLine(ctx);
    }
    let wanted = this.cleanLine;
    if (h.finished) wanted = -half + 1.5; // ゴール後は外へ避けて邪魔にならないように

    const others = ctx.horses.filter((o) => o !== h && !o.inPit && !o.finished && !o.retired);
    const look = LOOK_AHEAD_M / mpb;
    const gap = PASS_GAP_M / mpb;
    const ahead = (lat: number, back: number, front: number) =>
      others.find((o) => {
        const ds = track.diff(o.s, h.s);
        return ds > back && ds < front && Math.abs(o.lateral - lat) < gap;
      });

    if (!h.finished && h.pitPhase === 'none' && ctx.safety.restricting) {
      // セーフティホース中：追い越し禁止。前の馬（または SC）の真後ろについて 1 列になる
      const sc = ctx.safety;
      let aheadLat: number | null = null;
      let nearest = 40 / mpb;
      for (const o of others) {
        const ds = track.diff(o.s, h.s);
        if (ds > 0 && ds < nearest) {
          nearest = ds;
          aheadLat = o.lateral;
        }
      }
      if (sc.onTrack) {
        const ds = track.diff(sc.s, h.s);
        if (ds > 0 && ds < nearest) aheadLat = sc.lateral;
      }
      if (aheadLat !== null) wanted = aheadLat;
    } else if (!h.finished && h.pitPhase === 'none') {
      const blocker = ahead(this.targetLateral, 0, look);
      // 前の馬より速く走りたい時だけ追い越しを狙う
      const wantsToPass = blocker !== undefined && targetSpeed > blocker.speed + 0.3;
      if (blocker && wantsToPass) {
        // 空いている側へ持ち出す（内が空いていれば内、なければ外）
        const limit = h.crashLimit - 1 / mpb;
        const candidates = [blocker.lateral + gap * 1.1, blocker.lateral - gap * 1.1]
          .filter((l) => Math.abs(l) < limit && !ahead(l, -look * 0.5, look))
          .sort((a, b) => Math.abs(a - wanted) - Math.abs(b - wanted));
        if (candidates.length > 0) wanted = candidates[0];
        else {
          // 両側とも塞がっている：前の馬の後ろで控える
          wanted = this.targetLateral;
          targetSpeed = Math.min(targetSpeed, blocker.speed);
        }
      } else if (blocker) {
        // 抜く必要がなければ、同じラインのまま前の馬の後ろにつける（馬群になる）
        wanted = this.targetLateral;
        if (track.diff(blocker.s, h.s) < look * 0.5) targetSpeed = Math.min(targetSpeed, blocker.speed);
      } else {
        // 少し前・少し横に馬がいれば、その真後ろに入ってスリップストリームを使う
        // （そのラインが選んだラインより大きく荒れていなければ）。速くなれば上の追い越しで抜きにかかる
        const draftTarget = others.find((o) => {
          const ds = track.diff(o.s, h.s) * mpb;
          return ds > 3 && ds < 25 && Math.abs(o.lateral - h.lateral) * mpb < 3.5;
        });
        const lineWear = (lat: number) => ctx.wearAt(h.s + 10 / mpb, lat);
        if (draftTarget && lineWear(draftTarget.lateral) < lineWear(wanted) + 0.15) {
          wanted = draftTarget.lateral;
        } else if (ahead(wanted, -look * 0.4, look)) {
          // 内へ戻りたいが、内側に馬がいる間は今の位置を保つ（追い越した後は空いたら内へ戻る）
          wanted = this.targetLateral;
        }
      }
    }
    // ラチに触れたら落馬なので、目標は衝突限界から 1m 以上内側に収める
    const safe = h.crashLimit - 1 / mpb;
    wanted = Math.max(-safe, Math.min(safe, wanted));
    // 目標位置はゆっくり動かす（ふらつき防止）
    this.targetLateral += (wanted - this.targetLateral) * Math.min(1, dt * 1.5);
    // 寄りたい方向のすぐ横に馬がいれば、そちらへは動かない（幅寄せ＝接触ペナルティを避ける）
    const sideDir = Math.sign(this.targetLateral - h.lateral);
    if (sideDir !== 0 && h.railDistance >= 0.8) {
      const blockedSide = others.some((o) => {
        const along = Math.abs(track.diff(o.s, h.s)) * mpb;
        const across = (o.lateral - h.lateral) * sideDir * mpb;
        return along < 3.2 && across > 0 && across < 1.9;
      });
      if (blockedSide) this.targetLateral = h.lateral;
    }
    const latError = this.targetLateral - h.lateral;
    // 横移動はふだん穏やかに（急な進路変更は接触の元）。ラチに近い時だけ強く戻す
    const urgent = h.railDistance < 0.8;
    const maxSteer = urgent ? 1 : 0.45;
    const steer = Math.max(-maxSteer, Math.min(maxSteer, latError / 1.2));

    return cruiseControls(h, targetSpeed, steer, this.decideWhip(dt, ctx, finalSpurt));
  }

  /**
   * ムチを入れるか。1 周 4 回まで（5 回目からペナルティ）に抑える。
   *  - 最終周のホームストレッチ：効き目が切れる直前に次を入れて、ゴールまで追い続ける
   *  - どの周でもホームストレッチの追い比べ：横・すぐ前にライバルがいて余力があれば競りかける
   *  - 最終盤（残り 800m〜直線入口）：要所で入れて位置を上げる
   */
  private decideWhip(dt: number, ctx: AIContext, finalSpurt: boolean): boolean {
    const h = this.horse;
    this.whipTimer -= dt;
    if (h.finished || ctx.safety.restricting || h.pitPhase !== 'none' || h.whipsThisLap >= C.whipPenaltyCount - 1 || this.whipTimer > 0) {
      return false;
    }
    const track = h.track;
    const def = track.def;
    const mpb = def.metersPerBlock;
    const strategy = h.entry.jockey.strategy;
    // ホームストレッチ（最後の直線）にいるか
    const last = def.segments[def.segments.length - 1];
    const homeLength = last.type === 'straight' ? last.length : 0;
    const toLine = -track.diff(h.s, def.finishS);
    const inHomeStretch = toLine > 0 && toLine < homeLength;
    const finalLap = h.lapsCompleted === ctx.laps - 1;
    // 前のムチの効き目が切れかけているか（重ねて叩いても無駄にしない）
    const ready = h.whipBoost < 0.4;

    // 追い比べ：すぐ横か少し前にライバル
    const rival = ctx.horses.some((o) => {
      if (o === h || o.inPit || o.finished) return false;
      const ds = track.diff(o.s, h.s) * mpb;
      return ds > -2 && ds < DUEL_RANGE_M && Math.abs(o.lateral - h.lateral) * mpb < 6;
    });

    let whip = false;
    if (finalLap && inHomeStretch && h.stamina > 4 && ready) whip = true;
    else if (inHomeStretch && rival && h.stamina > 45 && h.whipsThisLap < 2 && ready) whip = Math.random() < dt * (0.3 + strategy * 0.05);
    else if (finalSpurt && h.stamina > 20 && ready) whip = Math.random() < dt * 0.35;

    if (whip) this.whipTimer = 1.2 + (10 - strategy) * 0.08;
    return whip;
  }
}
