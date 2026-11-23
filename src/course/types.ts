/**
 * コース定義データの型。
 * 座標系:
 *   - 1 ブロック = 1 ワールド単位。x: 東西, z: 南北, y: 高さ（上が +）
 *   - s       : 周回ルート上の距離（ブロック）。s = 0 がゴール板。進行方向に増える。
 *   - lateral : 中心線からの横オフセット。+ がコース内側（右回りなので進行方向の右）、- が外側。
 */

export type Segment =
  | { type: 'straight'; length: number; name?: string }
  | { type: 'arc'; radius: number; angleDeg: number; turn: 'right' | 'left'; name?: string };

/** 高低差のキーフレーム（キー間は smoothstep 補間） */
export interface ElevationKey {
  s: number;
  h: number;
}

/** ピットレーン（s / lateral で表現。s の範囲は 0 を跨がない前提） */
export interface PitLaneDef {
  /** 本コースから分岐を開始する s */
  entryStart: number;
  /** 分岐が完了しピットレーン本線に入る s */
  entryEnd: number;
  /** 本コースへの合流を開始する s */
  exitStart: number;
  /** 合流が完了する s */
  exitEnd: number;
  /** ピットレーン本線の lateral（内側） */
  lateral: number;
  /** ピットレーン幅 */
  width: number;
  /** 分岐/合流地点での lateral（本コース上の内ラチ寄り） */
  mergeLateral: number;
  /** ピットボックス（厩舎）を並べる s 範囲 */
  garageStart: number;
  garageEnd: number;
}

export interface CourseLabel {
  text: string;
  s: number;
  lateral: number;
  height: number;
}

export interface CourseDefinition {
  id: string;
  name: string;
  /** 1 ブロックあたりの実距離（m）。表示用 */
  metersPerBlock: number;
  /** 始点（= ゴール板, s = 0）の位置と進行方向 */
  start: { x: number; z: number; headingDeg: number };
  segments: Segment[];
  /** 芝コースの幅（ブロック） */
  trackWidth: number;
  /** コースが持ち上がっている区間の法面の幅（ブロック） */
  embankment: number;
  elevation: ElevationKey[];
  finishS: number;
  pitLane: PitLaneDef;
  /** 内側のダートコース（帯状） */
  dirtCourse: { lateral: number; width: number };
  /** ホームストレッチ外側のスタンド */
  stands: { centerS: number; length: number; offset: number };
  labels: CourseLabel[];
}
