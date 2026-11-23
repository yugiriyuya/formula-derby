import type { CourseTrack } from '../course/CourseTrack';
import type { HorseshoeType } from '../data/horseshoes';
import { RACE_CONFIG as C } from './raceConfig';
import type { RaceHorse } from './RaceHorse';

/**
 * セーフティホースの状態
 *  idle      : 待機（出動していない）
 *  standby   : 出動。ピットレーン出口で先頭の馬が来るのを待つ（この時点から全馬 50km/h・追い越し禁止）
 *  leading   : コースに入り、先頭の馬の前で馬群を先導
 *  returning : 先導を終えてピット入口へ向かう（まだ追い越し禁止）
 *  pitIn     : ピットレーンに入った（GREEN FLAG。レース再開）。ピットの奥で消える
 */
export type SafetyState = 'idle' | 'standby' | 'leading' | 'returning' | 'pitIn';

/**
 * 芦毛のセーフティホース（SC）。落馬が起きると出動し、1〜2 周先導して馬群をまとめる。
 * 描画用に RaceHorse と同じ名前の位置・速度フィールドを持つ（HorseModel でそのまま描ける）。
 */
export class SafetyHorse {
  state: SafetyState = 'idle';
  s = 0;
  lateral = 0;
  lateralVelocity = 0;
  /** 速度 m/s */
  speed = 0;
  gallopPhase = 0;
  whipAnim = 0;
  shoe: HorseshoeType = 'HARD';
  slipstream = 0;
  fallen = 0;
  /** 先導した距離（ブロック） */
  private led = 0;
  /** GREEN FLAG を出した演出用の時刻 */
  greenFlagAt = -Infinity;

  constructor(private readonly track: CourseTrack) {}

  /** コース上で全馬に制限（50km/h・追い越し禁止）がかかっているか */
  get restricting(): boolean {
    return this.state === 'standby' || this.state === 'leading' || this.state === 'returning';
  }

  /** 馬群の前を走っていて、後ろの馬が抜けない障害物になっているか */
  get onTrack(): boolean {
    return this.state === 'leading' || this.state === 'returning';
  }

  get visible(): boolean {
    return this.state !== 'idle';
  }

  /** 落馬が起きた：出動してピット出口で待機する（すでに出動中なら何もしない） */
  deploy() {
    if (this.restricting) return;
    const p = this.track.def.pitLane;
    this.state = 'standby';
    this.s = this.track.wrap(p.exitEnd - 6 / this.track.def.metersPerBlock);
    this.lateral = this.track.pitLateralAt(this.s) ?? p.mergeLateral;
    this.speed = 0;
    this.led = 0;
  }

  reset() {
    this.state = 'idle';
    this.speed = 0;
    this.greenFlagAt = -Infinity;
  }

  /**
   * @param field 走っている馬（落馬・ゴール・ピットレーンの馬を除く）、先頭から順位順
   * @param clock 演出用の時刻
   */
  update(dt: number, field: readonly RaceHorse[], clock: number) {
    const track = this.track;
    const def = track.def;
    const mpb = def.metersPerBlock;
    const pit = def.pitLane;
    if (this.state === 'idle') return;

    if (this.state === 'standby') {
      // 先頭の馬がピット出口の手前まで来たらコースイン（先頭の前に入る）
      const leader = field[0];
      if (!leader) {
        this.state = 'idle';
        return;
      }
      const toExit = track.wrap(pit.exitEnd - leader.s) * mpb;
      if (toExit < C.scLaunchDistance) this.state = 'leading';
      else return;
    }

    // --- 走る ---
    const targetSpeed = this.state === 'pitIn' ? C.pitSpeedLimit : C.scLeadSpeed;
    this.speed = approach(this.speed, targetSpeed, 3 * dt);
    const k = track.curvatureAt(this.s);
    const ds = (this.speed * dt) / mpb / Math.max(0.5, 1 - k * this.lateral);
    const prevS = this.s;
    this.s = track.wrap(this.s + ds);
    this.gallopPhase += ds * mpb * C.gallopPhasePerMeter;

    // --- 横位置：ピット出口・入口ではピットレーンの道筋、コース上は内ラチから 3m ---
    const prevLat = this.lateral;
    const pitPath = track.pitLateralAt(this.s);
    const inExitRamp = pitPath !== null && track.pitOffset(this.s) >= track.pitOffset(pit.exitStart);
    let target = track.def.trackWidth / 2 - 3 / mpb;
    if (this.state === 'pitIn' && pitPath !== null) target = pitPath;
    else if (this.state === 'leading' && inExitRamp && this.led < 80 / mpb) target = pitPath;
    this.lateral = approach(this.lateral, target, (6 / mpb) * dt);
    this.lateralVelocity = ((this.lateral - prevLat) * mpb) / dt;

    if (this.state === 'leading') {
      this.led += ds;
      // ピット入口に差しかかった時に判断：十分先導して馬群がまとまっていればピットへ戻る。
      // まだなら（最長 scMaxLeadLaps 周まで）もう 1 周先導する
      const toEntry = track.wrap(pit.entryStart - this.s) * mpb;
      if (toEntry < 60) {
        // 馬群の前 75% がまとまっていれば OK（SC 中にピットへ入って大きく離れた馬は待たない）
        const n = Math.max(1, Math.ceil(field.length * 0.75));
        const bunched = field.length < 2 || (field[0].progress - field[n - 1].progress) * mpb <= C.scBunchLength;
        if ((this.led >= C.scMinLeadLaps * track.length && bunched) || this.led >= C.scMaxLeadLaps * track.length) {
          this.state = 'returning';
        }
      }
    } else if (this.state === 'returning') {
      // ピット入口を通過したらピットレーンへ：GREEN FLAG（レース再開）
      if (track.pitOffset(this.s) < track.pitOffset(prevS)) {
        this.state = 'pitIn';
        this.greenFlagAt = clock;
      }
    } else if (this.state === 'pitIn') {
      // ピットレーンの厩舎の手前で消える
      if (track.pitOffset(this.s) >= track.pitOffset(pit.garageStart)) this.state = 'idle';
    }
  }
}

function approach(value: number, target: number, maxStep: number): number {
  if (Math.abs(target - value) <= maxStep) return target;
  return value + Math.sign(target - value) * maxStep;
}
