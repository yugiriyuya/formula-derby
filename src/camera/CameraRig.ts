import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { CourseTrack } from '../course/CourseTrack';

export type ViewId = 'overview' | 'hill' | 'pit' | 'finish';

interface View {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

const UP = (v: THREE.Vector3, y: number) => v.clone().setY(v.y + y);

/** コース上の位置から各視点を計算する（コース定義が変わっても追従する） */
function computeViews(track: CourseTrack): Record<ViewId, View> {
  const at = (s: number, lat = 0) => track.frameAt(s, lat).position;
  return {
    overview: { position: new THREE.Vector3(0, 150, 135), target: new THREE.Vector3(0, 0, 8) },
    hill: { position: UP(at(232, -38), 14), target: UP(at(282, 0), 2) },
    pit: { position: UP(at(398, -16), 34), target: at(414, 10) },
    finish: { position: UP(at(22, -2.5), 4), target: UP(at(430, 1), 2) },
  };
}

const PREVIEW_SPEED = 22; // ブロック/秒
const EYE_HEIGHT = 2.6;
const LOOK_AHEAD = 12;

/**
 * カメラ制御。
 *  - orbit     : OrbitControls で自由に操作
 *  - transition: 視点プリセットへ補間移動
 *  - preview   : コース（またはピット経由ルート）を馬の目線で周回
 */
export class CameraRig {
  private readonly views: Record<ViewId, View>;
  private mode: 'orbit' | 'transition' | 'preview' = 'orbit';
  private from: View | null = null;
  private to: View | null = null;
  private t = 0;
  private previewS = 0;
  private previewViaPit = false;

  onModeChange?: (previewing: boolean, viaPit: boolean) => void;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly controls: OrbitControls,
    private readonly track: CourseTrack,
  ) {
    this.views = computeViews(track);
  }

  get previewing() {
    return this.mode === 'preview';
  }

  /** 視点をすぐに切り替える（初期化用） */
  snapTo(id: ViewId) {
    const v = this.views[id];
    this.camera.position.copy(v.position);
    this.controls.target.copy(v.target);
    this.controls.update();
  }

  goTo(id: ViewId) {
    this.endPreview();
    this.from = { position: this.camera.position.clone(), target: this.controls.target.clone() };
    this.to = this.views[id];
    this.t = 0;
    this.mode = 'transition';
  }

  startPreview(viaPit: boolean, startS?: number) {
    this.previewViaPit = viaPit;
    // ピット経由は淀の坂の下りから始めてすぐピットへ入る様子を見せる
    this.previewS = startS ?? (viaPit ? this.track.def.pitLane.entryStart - 50 : this.track.def.finishS);
    this.mode = 'preview';
    this.controls.enabled = false;
    this.onModeChange?.(true, viaPit);
  }

  stopPreview() {
    if (this.mode !== 'preview') return;
    this.goTo('overview');
  }

  private endPreview() {
    if (this.mode !== 'preview') return;
    this.controls.enabled = true;
    this.onModeChange?.(false, false);
  }

  /** プレビュー中の進路（ピット経由ならピットレーン上を通る） */
  private lateralAt(s: number): number {
    if (this.previewViaPit) return this.track.pitLateralAt(s) ?? 0;
    return 0;
  }

  update(dt: number) {
    if (this.mode === 'transition' && this.from && this.to) {
      this.t = Math.min(1, this.t + dt / 1.2);
      const e = this.t < 0.5 ? 2 * this.t * this.t : 1 - (-2 * this.t + 2) ** 2 / 2;
      this.camera.position.lerpVectors(this.from.position, this.to.position, e);
      this.controls.target.lerpVectors(this.from.target, this.to.target, e);
      if (this.t >= 1) this.mode = 'orbit';
    }

    if (this.mode === 'preview') {
      this.previewS = this.track.wrap(this.previewS + PREVIEW_SPEED * dt);
      const s = this.previewS;
      const eye = this.track.frameAt(s, this.lateralAt(s)).position;
      const ahead = this.track.frameAt(s + LOOK_AHEAD, this.lateralAt(s + LOOK_AHEAD)).position;
      this.camera.position.set(eye.x, eye.y + EYE_HEIGHT, eye.z);
      this.camera.lookAt(ahead.x, ahead.y + EYE_HEIGHT * 0.7, ahead.z);
      // プレビュー終了時に自然に戻れるよう注視点も更新しておく
      this.controls.target.set(ahead.x, ahead.y, ahead.z);
      return;
    }

    this.controls.update();
  }
}
