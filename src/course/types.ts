/**
 * コース定義データの型。
 * 座標系:
 *   - 1 ブロック = 1 ワールド単位。x: 東西, z: 南北, y: 高さ（上が +）
 *   - s       : 周回ルート上の距離（ブロック）。s = 0 がゴール板。進行方向に増える。
 *   - lateral : 中心線からの横オフセット。+ がコース内側、- が外側。
 *               右回りのコースでは進行方向の右、左回りのコースでは進行方向の左が内側（+）になる。
 *               レースのロジック（内ラチ・ピットレーン・AI の進路）はすべてこの「内側が +」で書いているので、
 *               回り方向が変わってもそのまま使える（ワールド座標との変換は CourseTrack が受け持つ）。
 */

export type Segment =
  | { type: 'straight'; length: number; name?: string }
  | { type: 'arc'; radius: number; angleDeg: number; turn: 'right' | 'left'; name?: string };

/** 高低差のキーフレーム（キー間は smoothstep 補間） */
export interface ElevationKey {
  s: number;
  h: number;
}

/**
 * ピットレーン（s / lateral で表現）。
 * 各 s は entryStart → entryEnd → exitStart → exitEnd の順に進行方向へ並ぶ。
 * ゴール板（s = 0）を跨いでもよい（例: entryStart 381, exitEnd 20）。
 */
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

/** コース上の位置（s・lateral は m、up はブロック。lateral は内側が +） */
export interface CourseSpot {
  s: number;
  lateral: number;
  up: number;
}

/** 確認用の視点（全景・坂・ピット・ゴール前）。overview はワールド座標（m）で直接指定 */
export interface CourseViews {
  overview: { position: [number, number, number]; target: [number, number, number] };
  hill: { from: CourseSpot; to: CourseSpot; label: string };
  pit: { from: CourseSpot; to: CourseSpot };
  finish: { from: CourseSpot; to: CourseSpot };
}

export interface CourseDefinition {
  id: string;
  name: string;
  /** 掲示板・メニュー用の短い名前（例「京都 芝外回り」） */
  shortName: string;
  /** タイトルのコース選択に出す説明 */
  description: string;
  /** 回り方向（right = 右回り / 時計回り, left = 左回り / 反時計回り） */
  direction: 'right' | 'left';
  /** 1 ブロックあたりの実距離（m）。表示用 */
  metersPerBlock: number;
  /** 始点（= ゴール板, s = 0）の位置と進行方向 */
  start: { x: number; z: number; headingDeg: number };
  segments: Segment[];
  /** 芝コースの幅（ブロック） */
  trackWidth: number;
  /** コースが持ち上がっている区間の法面の幅（ブロック） */
  embankment: number;
  /** 芝コースの端からラチ（柵）の中心までの距離（ブロック）。小さいほど馬がラチぎりぎりを走る */
  railOffset: number;
  elevation: ElevationKey[];
  finishS: number;
  pitLane: PitLaneDef;
  /** ホームストレッチ外側のスタンド（offset = 中心線からスタンド最前列までの距離） */
  stands: { centerS: number; length: number; offset: number };
  /** ハロン棒（大）と小さな距離標の間隔（m）。ゴール板から逆算して立てる */
  markers: { furlong: number; small: number };
  labels: CourseLabel[];
  views: CourseViews;
  /**
   * コースに囲まれた内側（インフィールド）の地面。省略時は草地。
   * concrete = サーキットらしいグレーの舗装（芝の走路から infieldVerge ブロック離れた所から敷く）
   */
  infield?: { surface: 'concrete'; verge: number };
}
