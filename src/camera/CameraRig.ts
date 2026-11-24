import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { CourseTrack } from '../course/CourseTrack';
import type { CourseSpot } from '../course/types';

export type ViewId = 'overview' | 'hill' | 'pit' | 'finish';
/** manual = カメラを外から直接動かす（ゴール前リプレイの中継カメラなど）。リグは何もしない */
export type CameraMode = 'orbit' | 'transition' | 'preview' | 'follow' | 'manual';
/** chase = 後方視点（三人称）, jockey = 騎手視点（一人称）, broadcast = 中継俯瞰視点 */
/** stand = スタンドからの観戦（固定位置から馬を追ってズーム）, topdown = コース全体を真上から見下ろす鳥瞰 */
export type FollowStyle = 'chase' | 'jockey' | 'broadcast' | 'stand' | 'topdown';

export const FOLLOW_STYLE_LABEL: Record<FollowStyle, string> = {
  chase: '後方視点',
  jockey: '騎手視点',
  broadcast: '中継俯瞰',
  stand: 'スタンド',
  topdown: '鳥瞰',
};

/** 追従対象の情報 */
export interface FollowAnchor {
  /** 馬の足元 */
  position: THREE.Vector3;
  /** 進行方向（水平） */
  dir: THREE.Vector3;
  /** 少し先の注視点 */
  ahead: THREE.Vector3;
  /** 速度 m/s */
  speed: number;
  /** 走りの位相（カメラの揺れを脚の運びに合わせる） */
  gallopPhase: number;
}

interface View {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

const UP = (v: THREE.Vector3, y: number) => v.clone().setY(v.y + y);
const smoothstep = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** コース定義の視点（実寸 m で指定）をブロックに換算する */
function computeViews(track: CourseTrack): Record<ViewId, View> {
  const mpb = track.def.metersPerBlock;
  const m = (meters: number) => meters / mpb;
  const spot = (p: CourseSpot) => UP(track.frameAt(m(p.s), m(p.lateral)).position, p.up);
  const v = track.def.views;
  const vec = (a: [number, number, number]) => new THREE.Vector3(m(a[0]), m(a[1]), m(a[2]));
  return {
    overview: { position: vec(v.overview.position), target: vec(v.overview.target) },
    hill: { position: spot(v.hill.from), target: spot(v.hill.to) },
    pit: { position: spot(v.pit.from), target: spot(v.pit.to) },
    finish: { position: spot(v.finish.from), target: spot(v.finish.to) },
  };
}

// --- 視野角 ---
const BASE_FOV = 60;
/** 最高速度付近での視野角（速いほど広がり、周りが流れて見える） */
const MAX_FOV = 78;
/** この速度（km/h）から広がり始め、FOV_FULL_KMH で最大 */
const FOV_START_KMH = 15;
const FOV_FULL_KMH = 72;

// --- プレビュー ---
const PREVIEW_SPEED_MPS = 60;
const EYE_HEIGHT = 2.6;
const LOOK_AHEAD_M = 35;

// --- 後方視点（近め。速いほど少し寄る） ---
const CHASE_DISTANCE = 4.8;
const CHASE_DISTANCE_AT_SPEED = 4.2;
/** 後方視点の高さ。騎手の頭（約 2.3）より少し上から、馬全体と前方のコースが見える高さ */
const CHASE_HEIGHT = 2.6;
/** 注視点の高さ（カメラより少し低い = 馬の足元まで画面に収まるよう軽く見下ろす） */
const CHASE_LOOK_HEIGHT = 1.8;
/** 騎手の目の高さ・前後位置（馬の中心から。耳が画面下端に少し見える位置） */
const JOCKEY_EYE = 2.35;
const JOCKEY_FORWARD = 0.2;
/** 走りに合わせたカメラの上下の揺れ（最高速時） */
const BOB_CHASE = 0.05;
const BOB_JOCKEY = 0.07;
/** 別の視点から追従に切り替える時の補間時間 */
const ENTER_BLEND_SECONDS = 0.8;
/** 中継俯瞰：内馬場側・後ろ・上から（m）。ゆっくりパンしながら馬群とコースを広く映す */
const BROADCAST_SIDE_M = 60;
const BROADCAST_BACK_M = 25;
const BROADCAST_HEIGHT_M = 40;
const BROADCAST_FOV = 50;

/**
 * カメラ制御。
 *  - orbit     : OrbitControls で自由に操作
 *  - transition: 視点プリセットへ補間移動
 *  - preview   : コース（またはピット経由ルート）を馬の目線で周回
 *  - follow    : レース中の馬を追従（後方視点 / 騎手視点 / 中継俯瞰）。後方・騎手は速度に応じて視野角が広がる
 */
export class CameraRig {
  private readonly views: Record<ViewId, View>;
  private _mode: CameraMode = 'orbit';
  private from: View | null = null;
  private to: View | null = null;
  private t = 0;
  private previewS = 0;
  private previewViaPit = false;
  private followSource: (() => FollowAnchor) | null = null;
  private readonly followLook = new THREE.Vector3();
  /** コーナーで少し遅れて回り込むための、なめらかにした進行方向 */
  private readonly smoothDir = new THREE.Vector3(1, 0, 0);
  private followFresh = true;
  private enterBlend = 1;
  private readonly enterFrom = { position: new THREE.Vector3(), look: new THREE.Vector3() };
  /** 中継俯瞰カメラのなめらかにした位置・注視点 */
  private readonly broadcastPos = new THREE.Vector3();
  private readonly broadcastLook = new THREE.Vector3();
  followStyle: FollowStyle = 'chase';
  /** false の間（コース下見）はプレビューを終えても追従に戻らず全景へ */
  followEnabled = true;
  /** C キーで切り替える視点の順番（シンプルレースは後方⇔騎手、観戦モードは中継俯瞰も） */
  followStyles: FollowStyle[] = ['chase', 'jockey'];

  /** モード・追従スタイルが変わった時に呼ばれる */
  onModeChange?: (mode: CameraMode, viaPit: boolean) => void;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly controls: OrbitControls,
    private readonly track: CourseTrack,
  ) {
    this.views = computeViews(track);
    this.camera.fov = BASE_FOV;
    this.camera.updateProjectionMatrix();
  }

  get mode(): CameraMode {
    return this._mode;
  }

  get previewing() {
    return this._mode === 'preview';
  }

  private setMode(mode: CameraMode, viaPit = false) {
    this._mode = mode;
    // 鳥瞰は上方向を変えているので、ほかのモードでは元に戻す
    if (mode !== 'follow') this.camera.up.set(0, 1, 0);
    // 自分で動かすモード（プレビュー・追従）の間はマウス操作を止める
    this.controls.enabled = mode === 'orbit' || mode === 'transition';
    this.onModeChange?.(mode, viaPit);
  }

  /** 視点をすぐに切り替える（初期化用） */
  snapTo(id: ViewId) {
    const v = this.views[id];
    this.camera.position.copy(v.position);
    this.controls.target.copy(v.target);
    this.controls.update();
    this.setMode('orbit');
  }

  goTo(id: ViewId) {
    this.from = { position: this.camera.position.clone(), target: this.controls.target.clone() };
    this.to = this.views[id];
    this.t = 0;
    this.setMode('transition');
  }

  startPreview(viaPit: boolean, startS?: number) {
    this.previewViaPit = viaPit;
    // ピット経由は淀の坂の下りから始めてすぐピットへ入る様子を見せる
    const before = 200 / this.track.def.metersPerBlock;
    this.previewS = startS ?? (viaPit ? this.track.def.pitLane.entryStart - before : this.track.def.finishS);
    this.setMode('preview', viaPit);
  }

  /** プレビューを終えて、レース追従（なければ全景）に戻る */
  stopPreview() {
    if (this._mode !== 'preview') return;
    if (this.followSource && this.followEnabled) this.follow();
    else this.goTo('overview');
  }

  setFollowSource(source: () => FollowAnchor) {
    this.followSource = source;
  }

  /** 追従カメラに切り替える。style を省略すると直前のスタイル */
  follow(style: FollowStyle = this.followStyle) {
    if (!this.followSource) return;
    if (style === 'broadcast' && this.followStyle !== 'broadcast') {
      // 中継俯瞰は今のカメラ位置からゆっくり引いていく
      this.broadcastPos.copy(this.camera.position);
      this.broadcastLook.copy(this.controls.target);
    }
    this.followStyle = style;
    // 別の視点から来た時は、今の位置から馬の後ろへ滑らかに寄っていく
    if (this._mode !== 'follow' && !this.followFresh) this.retarget();
    this.setMode('follow');
  }

  /** 追従する馬が変わった時：今のカメラ位置から新しい馬へ滑らかに移る */
  retarget() {
    this.enterFrom.position.copy(this.camera.position);
    this.enterFrom.look.copy(this.controls.target);
    this.enterBlend = 0;
  }

  /** C キー：追従中なら次の視点へ（followStyles の順）、それ以外なら追従に戻る */
  toggleFollowStyle() {
    if (this._mode !== 'follow') {
      this.follow();
      return;
    }
    const i = this.followStyles.indexOf(this.followStyle);
    this.follow(this.followStyles[(i + 1) % this.followStyles.length]);
  }

  /** 追従カメラを補間なしで馬の位置へ合わせる（初期化・リスタート用） */
  snapFollow() {
    this.followFresh = true;
    this.enterBlend = 1;
  }

  /** プレビュー中の進路（ピット経由ならピットレーン上を通る） */
  private lateralAt(s: number): number {
    if (this.previewViaPit) return this.track.pitLateralAt(s) ?? 0;
    return 0;
  }

  /** 視野角をなめらかに目標値へ */
  private updateFov(dt: number, target: number) {
    const fov = this.camera.fov + (target - this.camera.fov) * (1 - Math.exp(-dt * 3));
    if (Math.abs(fov - this.camera.fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** カメラを外から直接動かす（リグは止める）。戻す時は follow() や goTo() を呼ぶ */
  hold() {
    this.setMode('manual');
  }

  update(dt: number) {
    if (this._mode === 'manual') return;
    let targetFov = BASE_FOV;

    if (this._mode === 'transition' && this.from && this.to) {
      this.t = Math.min(1, this.t + dt / 1.2);
      const e = this.t < 0.5 ? 2 * this.t * this.t : 1 - (-2 * this.t + 2) ** 2 / 2;
      this.camera.position.lerpVectors(this.from.position, this.to.position, e);
      this.controls.target.lerpVectors(this.from.target, this.to.target, e);
      if (this.t >= 1) this.setMode('orbit');
    }

    if (this._mode === 'preview') {
      const mpb = this.track.def.metersPerBlock;
      this.previewS = this.track.wrap(this.previewS + (PREVIEW_SPEED_MPS / mpb) * dt);
      const s = this.previewS;
      const lookAhead = LOOK_AHEAD_M / mpb;
      const eye = this.track.frameAt(s, this.lateralAt(s)).position;
      const ahead = this.track.frameAt(s + lookAhead, this.lateralAt(s + lookAhead)).position;
      this.camera.position.set(eye.x, eye.y + EYE_HEIGHT, eye.z);
      this.camera.lookAt(ahead.x, ahead.y + EYE_HEIGHT * 0.7, ahead.z);
      // プレビュー終了時に自然に戻れるよう注視点も更新しておく
      this.controls.target.set(ahead.x, ahead.y, ahead.z);
      targetFov = MAX_FOV - 4;
    } else if (this._mode === 'follow' && this.followSource) {
      targetFov = this.updateFollow(dt, this.followSource());
    } else {
      this.controls.update();
    }

    this.updateFov(dt, targetFov);
  }

  /** スタンド最上段あたり（ゴール板の少し手前・外側の高い所）の位置 */
  private standEye(): THREE.Vector3 {
    const def = this.track.def;
    const mpb = def.metersPerBlock;
    const st = def.stands;
    const p = this.track.frameAt(st.centerS, -(st.offset + 18 / mpb)).position;
    p.y = this.track.elevationAt(st.centerS) + 34 / mpb;
    return p;
  }

  /** 追従カメラを動かし、その時の目標視野角を返す */
  private updateFollow(dt: number, a: FollowAnchor): number {
    if (this.followStyle !== 'topdown') this.camera.up.set(0, 1, 0);
    if (this.followStyle === 'stand') {
      // スタンドから：位置は固定、注目している馬を首を振って追い、遠い時はズームで寄る
      const eye = this.standEye();
      const target = a.position.clone().setY(a.position.y + 1.2);
      if (this.followFresh) this.followLook.copy(target);
      else this.followLook.lerp(target, 1 - Math.exp(-dt * 5));
      this.camera.position.copy(eye);
      this.camera.lookAt(this.followLook);
      this.controls.target.copy(this.followLook);
      this.followFresh = false;
      this.enterBlend = 1;
      const dist = eye.distanceTo(this.followLook);
      // 画面の縦に約 24m（馬群）が入る視野角。遠いほど狭く（ズーム）
      return THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(10 / dist)), 6, 55);
    }
    if (this.followStyle === 'topdown') {
      // 鳥瞰：コース全体の真上から真下を見る（北が画面の上）
      const ext = this.track.extent();
      const cx = (ext.minX + ext.maxX) / 2;
      const cz = (ext.minZ + ext.maxZ) / 2;
      const span = Math.max(ext.maxX - ext.minX, (ext.maxZ - ext.minZ) * this.camera.aspect) + this.track.def.trackWidth * 2;
      const fov = 40;
      const height = (span / this.camera.aspect / 2 / Math.tan(THREE.MathUtils.degToRad(fov / 2))) * 1.22;
      // 視野角はなめらかに変えず、すぐに合わせる（コース全体がぴったり収まるように）
      if (this.camera.fov !== fov) {
        this.camera.fov = fov;
        this.camera.updateProjectionMatrix();
      }
      this.camera.up.set(0, 0, -1);
      this.camera.position.set(cx, height, cz + 0.01);
      this.followLook.set(cx, 0, cz);
      this.camera.lookAt(this.followLook);
      this.controls.target.copy(this.followLook);
      this.followFresh = false;
      this.enterBlend = 1;
      return fov;
    }
    const kmh = a.speed * 3.6;
    const speedRatio = smoothstep(clamp01((kmh - FOV_START_KMH) / (FOV_FULL_KMH - FOV_START_KMH)));
    const bob = Math.sin(a.gallopPhase * 2) * speedRatio;

    if (this.followFresh) this.smoothDir.copy(a.dir);
    // 進行方向だけ少し遅れて追う（位置は遅らせないので高速でも離されない）
    this.smoothDir.lerp(a.dir, 1 - Math.exp(-dt * 4)).normalize();

    const desired = new THREE.Vector3();
    const look = new THREE.Vector3();
    if (this.followStyle === 'broadcast') {
      // 内馬場側（右回りなら進行方向の右、左回りなら左）の高い所から、馬とその周りのコースを見下ろす。
      // 外側にはスタンドがあり、ホームストレッチで屋根にかぶるため内側に置く
      const mpb = this.track.def.metersPerBlock;
      const side = this.track.side;
      const inward = new THREE.Vector3(-this.smoothDir.z * side, 0, this.smoothDir.x * side);
      desired
        .copy(a.position)
        .addScaledVector(inward, BROADCAST_SIDE_M / mpb)
        .addScaledVector(this.smoothDir, -BROADCAST_BACK_M / mpb);
      desired.y = a.position.y + BROADCAST_HEIGHT_M / mpb;
      look.copy(a.position).addScaledVector(this.smoothDir, 10 / mpb);
      // ゆっくりパンする（中継カメラらしく）。切り替え直後は位置を合わせる
      const k = this.followFresh ? 1 : 1 - Math.exp(-dt * 1.8);
      this.broadcastPos.lerp(desired, k);
      this.broadcastLook.lerp(look, Math.min(1, k * 2));
      this.camera.position.copy(this.broadcastPos);
      this.followLook.copy(this.broadcastLook);
      this.camera.lookAt(this.followLook);
      this.controls.target.copy(this.followLook);
      this.followFresh = false;
      this.enterBlend = 1;
      return BROADCAST_FOV;
    }
    if (this.followStyle === 'jockey') {
      desired.copy(a.position).addScaledVector(a.dir, JOCKEY_FORWARD);
      desired.y = a.position.y + JOCKEY_EYE + bob * BOB_JOCKEY;
      look.copy(a.ahead).setY(a.ahead.y + 1.2);
    } else {
      const dist = CHASE_DISTANCE + (CHASE_DISTANCE_AT_SPEED - CHASE_DISTANCE) * speedRatio;
      desired.copy(a.position).addScaledVector(this.smoothDir, -dist);
      desired.y = a.position.y + CHASE_HEIGHT + bob * BOB_CHASE;
      look.copy(a.position).lerp(a.ahead, 0.35);
      look.y = a.position.y + CHASE_LOOK_HEIGHT;
    }

    if (this.enterBlend < 1) {
      this.enterBlend = Math.min(1, this.enterBlend + dt / ENTER_BLEND_SECONDS);
      const e = smoothstep(this.enterBlend);
      desired.lerpVectors(this.enterFrom.position, desired, e);
      look.lerpVectors(this.enterFrom.look, look, e);
    }

    this.camera.position.copy(desired);
    this.followLook.copy(look);
    this.camera.lookAt(this.followLook);
    this.followFresh = false;
    this.controls.target.copy(this.followLook);

    return BASE_FOV + (MAX_FOV - BASE_FOV) * speedRatio;
  }
}
