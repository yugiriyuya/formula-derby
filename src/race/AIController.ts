import type { HorseshoeType, TrackCondition } from '../data/horseshoes';
import { cruiseControls } from './pace';
import { PACE_LEVELS, RACE_CONFIG as C, type PaceLevel, type RaceFormat } from './raceConfig';
import type { HorseControls, RaceHorse } from './RaceHorse';
import type { SafetyHorse } from './SafetyHorse';

/** 追い比べ：この距離（m）以内の前・横にライバルがいたら競りかける */
const DUEL_RANGE_M = 10;

/** 他馬との位置関係を見る距離（m） */
const LOOK_AHEAD_M = 12;
/** 並走・追い越しに必要な横の間隔（m） */
const PASS_GAP_M = 2.2;
/** 2 列の馬群：1 列目（ラチ沿い）と 2 列目の、ラチからの距離（m） */
const LANE_RAIL_M = 1.8;
const LANE_SECOND_M = 3.6;
/** 馬群の中心から 1m 離れるごとのペースの補正（前にいれば抑え、後ろなら押す） */
const PACK_PULL_PER_M = 1 / 220;
const PACK_PULL_MAX_SLOW = 0.1;
const PACK_PULL_MAX_PUSH = 0.06;

export interface AIContext {
  horses: readonly RaceHorse[];
  laps: number;
  condition: TrackCondition;
  time: number;
  /** コース上の (s, lateral) の荒れ度（0〜1） */
  wearAt: (s: number, lateral: number) => number;
  /** セーフティホース（出動中は追い越し禁止・1 列で走る・ムチを使わない） */
  safety: SafetyHorse;
  /** 走っている馬群の中心（進み具合の中央値, ブロック） */
  packProgress: number;
}

/**
 * AI 騎手。プレイヤーと同じ HorseControls を毎フレーム作って馬を動かす。
 *  - ペース：スタミナ残量と残り距離から ハイペース／標準／折り合い を選ぶ。
 *            さらに馬群の中心との位置関係で補正（前に出すぎたら抑え、離されたら押す）して接戦を保つ。
 *            位置取りは脚質で変わる（逃げは前、追込は後ろ）。最終盤は脚質ごとの距離からスパート
 *  - 進路：ラチ沿いの 1 列目か、そのすぐ外の 2 列目を走る（2 列の馬群）。抜く時だけ外へ持ち出す
 *  - ムチ：最終周のホームストレッチは連打、追い比べでは競りかける。
 *          ふだんは 1 周 4 回までに抑えるが、攻めすぎる騎手は 5 回以上叩いてペナルティを受けることがある
 *  - ピット：5 周ではレース中に 1 回、予定した周の終わりにピットインして蹄鉄を替える。
 *            20 周などの長丁場では、1 ストップ（ハード中心）か 2 ストップ（ソフト中心）の作戦を選ぶ
 * 騎手の戦略値（strategy）が高いほど、ペース配分・進路取りが上手く、ムチの叩きすぎも少ない。
 */
export class AIController {
  /** この周回を走り終える直前（4コーナー出口のピット入口）でピットに入る（1 回目） */
  pitLap = 2;
  /** ピットに入る周（全部）と、各スティントで履く蹄鉄（stints[i] = i 回目のピットの後。stints[0] はスタート） */
  pitLaps: number[] = [];
  stints: HorseshoeType[] = [];
  /** 直線で好んで走る横位置（ブロック）と、ペースの性格 */
  private preferredLateral = 0;
  private aggression = 0;
  private targetLateral = 0;
  private whipTimer = 0;
  /** 荒れを避けて選んだ今のライン（ブロック）と、選び直すまでの時間 */
  private cleanLine = 0;
  private lineTimer = 0;
  /** 逆向きのカーブへの切り返し中（秒）。この間は横移動を速くする */
  private switchTimer = 0;
  /** 1 周に叩くムチの上限（ふつうは 4 = ペナルティの手前。攻めすぎる騎手は 5〜6） */
  whipLimit = C.whipPenaltyCount - 1;

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
    // グリーンベルト（コースの端から 1.3m。ラチに触れないだけの余裕を残す）と、いつもの列から外へ 2.5m まで。
    // それ以上外へは行かない（馬群がバラけないように）
    const candidates = [half - 1.3 / mpb, this.preferredLateral];
    candidates.push(this.preferredLateral - 2.5 / mpb);
    const score = (lat: number) => {
      let wear = 0;
      for (let d = 5; d <= 40; d += 7) wear += ctx.wearAt(h.s + d / mpb, lat);
      wear /= 6;
      // 外を回るロス・馬群から離れる不利：いつもの列から 1m 外へ出るごとに不利
      const outsideM = (this.preferredLateral - lat) * mpb;
      return wear * 6 * sensitivity + Math.max(0, outsideM) * 0.12;
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

  /**
   * この先（約 70m）で曲がる向きと量（ラジアン。内ラチ側へ曲がるのが +）。近いカーブほど重く数える。
   * 右回りのコースでは常に 0 以上。左回りのインテルラゴスのように逆向き（外ラチ側へ曲がる）カーブがあると負になる。
   */
  private bendAhead(): number {
    const h = this.horse;
    const track = h.track;
    const mpb = track.def.metersPerBlock;
    const STEP = 5;
    let total = 0;
    for (let d = 0; d <= 70; d += STEP) {
      const w = 1 - d / 90;
      total += track.curvatureAt(h.s + d / mpb) * (STEP / mpb) * w;
    }
    return total;
  }

  /** レース開始時に作戦を決める */
  plan(laps: number, rand: () => number, teammatePitLaps: readonly number[], format?: RaceFormat) {
    const half = this.horse.track.def.trackWidth / 2;
    const strategy = this.horse.entry.jockey.strategy;
    if (format && format.maxStops >= 2) {
      this.planLongRace(laps, rand, teammatePitLaps, format);
    } else {
      // 1 回ピットの周：レースの中盤。僚馬とは同じ周に入らない（ピットボックスが空くように）
      const teammatePitLap = teammatePitLaps.length ? teammatePitLaps[0] : null;
      const first = Math.max(1, Math.floor(laps * 0.3));
      const last = Math.max(first, laps - 1);
      let lap = first + Math.floor(rand() * (last - first + 1));
      if (teammatePitLap !== null && lap === teammatePitLap && last > first) lap = lap === last ? lap - 1 : lap + 1;
      this.pitLap = laps >= 2 ? lap : 0;
      this.pitLaps = this.pitLap > 0 ? [this.pitLap] : [];
      this.stints = [];
    }
    // 2 列の馬群：ラチ沿いの 1 列目か、そのすぐ外の 2 列目を受け持つ（半々）
    const lane = rand() < 0.5 ? LANE_RAIL_M : LANE_SECOND_M;
    const railGapM = lane + rand() * 0.6;
    this.preferredLateral = half - railGapM / this.horse.track.def.metersPerBlock;
    this.aggression = rand();
    // 攻めすぎる騎手（戦略値が低いほど多い）は、最後の直線でムチを 5〜6 回叩いてペナルティを受ける
    const overWhipChance = 0.05 + (10 - strategy) * 0.025;
    this.whipLimit = rand() < overWhipChance ? C.whipPenaltyCount + (rand() < 0.3 ? 1 : 0) : C.whipPenaltyCount - 1;
    this.targetLateral = this.horse.lateral;
    this.whipTimer = 0;
    this.cleanLine = this.preferredLateral;
    this.lineTimer = 0;
  }

  /**
   * 長丁場の作戦：1 ストップか 2 ストップか。
   *  1 ストップ：ハード → ハード（中盤でピット）か、ソフト → ハード（早めにピットして後半をハードで引っ張る）
   *  2 ストップ：ソフト → ソフト → ハード（ソフトの速さを活かして、こまめに替える）
   * 戦略値の高い騎手ほど、蹄鉄が摩耗しきる前に替える周を選ぶ。僚馬とは同じ周に入らない。
   */
  private planLongRace(laps: number, rand: () => number, teammatePitLaps: readonly number[], format: RaceFormat) {
    const twoStop = rand() < format.twoStopChance;
    const jitter = () => Math.round((rand() - 0.5) * laps * 0.12);
    let fractions: number[];
    if (twoStop) {
      this.stints = ['SOFT', 'SOFT', 'HARD'];
      fractions = [0.28, 0.56];
    } else if (rand() < 0.5) {
      this.stints = ['HARD', 'HARD'];
      fractions = [0.5];
    } else {
      this.stints = ['SOFT', 'HARD'];
      fractions = [0.33];
    }
    const laps2: number[] = [];
    for (const f of fractions) {
      let lap = Math.min(laps - 1, Math.max(2, Math.round(laps * f) + jitter()));
      while (laps2.includes(lap) || (laps2.length && lap <= laps2[laps2.length - 1])) lap++;
      // 僚馬と同じ周ならずらす（ピットボックスが空くように）
      if (teammatePitLaps.includes(lap)) lap = lap + 1 < laps ? lap + 1 : lap - 1;
      laps2.push(Math.min(laps - 1, lap));
    }
    this.pitLaps = laps2;
    this.pitLap = laps2[0];
    const h = this.horse;
    h.startShoeOverride = this.stints[0];
    h.shoe = this.stints[0];
    h.nextShoe = this.stints[1];
  }

  /** 作戦の説明（例「2ストップ S→S→H」） */
  get strategyLabel(): string {
    if (this.pitLaps.length === 0) return 'ノーピット';
    const shoes = this.stints.length ? ` ${this.stints.map((s) => s[0]).join('→')}` : '';
    return `${this.pitLaps.length}ストップ${shoes}`;
  }

  decide(dt: number, ctx: AIContext): HorseControls {
    const h = this.horse;
    const track = h.track;
    const def = track.def;
    const mpb = def.metersPerBlock;
    const half = def.trackWidth / 2;

    // --- ピット要求 ---
    const nextPit = this.pitLaps[h.pitCount];
    if (nextPit !== undefined && !h.pitRequested && h.lapsCompleted === nextPit - 1) {
      // 次のスティントの蹄鉄（作戦がなければ RaceHorse の既定 = ソフト ⇔ ハード）
      const shoe = this.stints[h.pitCount + 1];
      if (shoe) h.nextShoe = shoe;
      h.togglePitRequest();
    }

    // --- 目標ペース ---
    const top = h.topSpeed(ctx.condition);
    const style = h.style;
    const remainingM = (ctx.laps * track.length - h.progress) * mpb;
    // スパートを始める距離は脚質で変わる（差し・追込ほど早めに仕掛ける）
    const finalSpurt = remainingM < style.aiSpurt;
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
      // 最後の直線のムチ用のスタミナ（aiStaminaReserve＋脚質ごとの上乗せ）は温存し、残りを残り周回に割り振る。
      // 1 周あたりの予算：ハイペースは約 23、標準は約 11 消耗する
      const lapsLeft = remainingM / (track.length * mpb);
      const reserve = C.aiStaminaReserve + style.aiExtraReserve;
      const budget = Math.max(0, h.stamina - reserve) / Math.max(0.5, lapsLeft);
      const maxPace: PaceLevel = budget > 23 ? 'high' : budget > 11 ? 'normal' : 'relaxed';
      ratio = PACE_LEVELS[maxPace].ratio + (this.aggression - 0.5) * 0.02;
      // 馬群に合わせる：脚質ごとの「いたい位置」（馬群の中心から前後何 m）より前なら抑え、後ろなら押す。
      // 押す時もスタミナの予算で決まるペース以上にはしない（最終盤の追い比べの余力を残す）
      const offsetM = (h.progress - ctx.packProgress) * mpb - style.aiPosition;
      const pull = offsetM > 0 ? -Math.min(PACK_PULL_MAX_SLOW, offsetM * PACK_PULL_PER_M) : Math.min(PACK_PULL_MAX_PUSH, -offsetM * PACK_PULL_PER_M);
      // 大きく離された時（20m 以上）はスタミナを使ってでも追いつく
      const cap = offsetM < -20 || maxPace !== 'relaxed' ? 1.0 : PACE_LEVELS.normal.ratio;
      ratio = Math.min(ratio + pull, cap);
      pace = ratio >= 0.985 ? 'high' : ratio <= 0.88 ? 'relaxed' : 'normal';
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
    // 外ラチ側へ曲がるカーブ（左回りコースの右コーナーなど）が近い時は、そのカーブのイン = 外ラチ側へ渡る。
    // いつもの列（ラチから 1.8m / 3.6m）を外ラチ側に映した位置を走り、エイペックスを突いて最短距離で抜ける
    const bend = this.bendAhead();
    const cornerLine = bend < -0.25;
    if (cornerLine) wanted = -this.preferredLateral;
    // 逆向きのカーブの前後 2 秒は、コースを横切る切り返しなので横移動を速くする
    this.switchTimer = cornerLine ? 2 : Math.max(0, this.switchTimer - dt);
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
      // 前の馬よりはっきり速く走りたい時だけ追い越しを狙う（道中は抜き合いを減らして馬群を保つ。最終盤は積極的に）
      const passMargin = finalSpurt ? 0.25 : 0.7;
      const wantsToPass = blocker !== undefined && targetSpeed > blocker.speed + passMargin;
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
      if (blockedSide) {
        this.targetLateral = h.lateral;
        // 内へ入りたいのに横に馬がいる：少し控えて、その馬の後ろに入る（馬群に収まる）
        const wantsInside = sideDir > 0 && (wanted - h.lateral) * mpb > 1.5;
        if (wantsInside && !finalSpurt && !ctx.safety.restricting) targetSpeed = Math.max(0, targetSpeed - 0.5);
      }
    }
    const latError = this.targetLateral - h.lateral;
    // 横移動はふだん穏やかに（急な進路変更は接触の元）。ラチに近い時だけ強く戻す
    const urgent = h.railDistance < 0.8;
    // 切り返し（コースを横切ってカーブのインへ渡る）の時は素早く動く
    const maxSteer = urgent ? 1 : this.switchTimer > 0 ? 0.8 : 0.45;
    const steer = Math.max(-maxSteer, Math.min(maxSteer, latError / 1.2));

    return cruiseControls(h, targetSpeed, steer, this.decideWhip(dt, ctx, finalSpurt));
  }

  /**
   * ムチを入れるか。1 周 whipLimit 回まで（ふつうは 4 回 = ペナルティの手前。攻めすぎる騎手は 5〜6 回）。
   *  - 最終周のホームストレッチ：効き目が切れる直前に次を入れて、ゴールまで追い続ける
   *  - どの周でもホームストレッチの追い比べ：横・すぐ前にライバルがいて余力があれば競りかける
   *  - 最終盤（残り 800m〜直線入口）：要所で入れて位置を上げる
   */
  private decideWhip(dt: number, ctx: AIContext, finalSpurt: boolean): boolean {
    const h = this.horse;
    this.whipTimer -= dt;
    if (h.finished || ctx.safety.restricting || h.pitPhase !== 'none' || h.whipsThisLap >= this.whipLimit || this.whipTimer > 0) {
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
