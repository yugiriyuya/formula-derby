import type { TrackCondition } from '../data/horseshoes';
import { RACE_CONFIG as C } from './raceConfig';
import type { HorseControls, RaceHorse } from './RaceHorse';

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
}

/**
 * AI 騎手。プレイヤーと同じ HorseControls を毎フレーム作って馬を動かす。
 *  - ペース：スタミナ残量と残り距離から目標速度を決め、最終周はスパート（ムチは 1 周 4 回まで）
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

  constructor(readonly horse: RaceHorse) {}

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
    this.whipTimer = 2 + rand() * 4;
  }

  decide(dt: number, ctx: AIContext): HorseControls {
    const h = this.horse;
    const track = h.track;
    const def = track.def;
    const mpb = def.metersPerBlock;
    const half = def.trackWidth / 2;
    const strategy = h.entry.jockey.strategy;

    // --- ピット要求 ---
    if (this.pitLap > 0 && h.pitCount === 0 && !h.pitRequested && h.lapsCompleted === this.pitLap - 1) {
      h.togglePitRequest();
    }

    // --- 目標ペース ---
    const top = h.topSpeed(ctx.condition);
    const remainingM = (ctx.laps * track.length - h.progress) * mpb;
    const finalSpurt = remainingM < SPURT_M;
    let ratio: number;
    if (h.finished) ratio = 0.35;
    else if (finalSpurt) ratio = h.stamina > 8 ? 1.05 : 0.96;
    else {
      // スタミナを残り距離に合わせて使う：余裕があれば速く、足りなければ抑える
      // 全力で 1 周走ると約 30 消耗する。1 周あたりの予算に余裕があれば全力、なければ抑える
      const lapsLeft = remainingM / (track.length * mpb);
      const budget = h.stamina / Math.max(0.5, lapsLeft);
      ratio = budget > 24 ? 1.0 : budget > 17 ? 0.96 : 0.91;
      ratio += (this.aggression - 0.5) * 0.03;
    }
    let targetSpeed = top * Math.min(1.05, ratio);

    // --- 進路取り ---
    // 基本は内ラチ沿い。外へ持ち出すのは「前の馬を抜きたい時」と「内が塞がっている時」だけ
    let wanted = this.preferredLateral;
    if (h.finished) wanted = -half + 1.5; // ゴール後は外へ避けて邪魔にならないように

    const others = ctx.horses.filter((o) => o !== h && !o.inPit && !o.finished);
    const look = LOOK_AHEAD_M / mpb;
    const gap = PASS_GAP_M / mpb;
    const ahead = (lat: number, back: number, front: number) =>
      others.find((o) => {
        const ds = track.diff(o.s, h.s);
        return ds > back && ds < front && Math.abs(o.lateral - lat) < gap;
      });

    if (!h.finished && h.pitPhase === 'none') {
      const blocker = ahead(this.targetLateral, 0, look);
      // 前の馬より速く走りたい時だけ追い越しを狙う
      const wantsToPass = blocker !== undefined && targetSpeed > blocker.speed + 0.3;
      if (blocker && wantsToPass) {
        // 空いている側へ持ち出す（内が空いていれば内、なければ外）
        const limit = half - 1;
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
      } else if (ahead(wanted, -look * 0.4, look)) {
        // 内へ戻りたいが、内側に馬がいる間は今の位置を保つ（追い越した後は空いたら内へ戻る）
        wanted = this.targetLateral;
      }
    }
    // 目標位置はゆっくり動かす（ふらつき防止）
    this.targetLateral += (wanted - this.targetLateral) * Math.min(1, dt * 1.5);
    const latError = this.targetLateral - h.lateral;
    const steer = Math.max(-1, Math.min(1, latError / 1.2));

    // --- ムチ（最終周のスパートで。1 周 4 回までに抑えてペナルティを避ける） ---
    this.whipTimer -= dt;
    let whip = false;
    if (finalSpurt && !h.finished && h.stamina > 12 && h.whipsThisLap < C.whipPenaltyCount - 1 && this.whipTimer <= 0) {
      whip = true;
      this.whipTimer = 3.5 + (10 - strategy) * 0.3;
    }

    return {
      accelerate: h.speed < targetSpeed - 0.15,
      brake: h.speed > targetSpeed + 1.2,
      steer,
      whip,
    };
  }
}
