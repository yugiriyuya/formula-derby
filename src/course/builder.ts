import { CourseTrack } from './CourseTrack';
import type { CourseDefinition, CourseLabel, CourseViews, SceneryItem, Segment } from './types';

/** 1 ブロックの実寸（m）。全コース共通の縮尺 */
const MPB = 1.25;
const M = (meters: number) => meters / MPB;

/** 区間の指定（m）。['S', 長さ, 名前?] = 直線、['L' | 'R', 半径, 角度, 名前?] = 左 / 右カーブ */
export type SegmentSpec = ['S', number, string?] | ['L' | 'R', number, number, string?];

/**
 * コースの指定（距離はすべて m）。ここからピットレーン・スタンド・ラベル・確認用の視点を自動で組み立てる。
 * 約束ごと：
 *   - segments の最初はゴール板の後ろの直線、最後はホームストレート（ゴール板で終わる直線）
 *   - ピットレーンはホームストレートの内側。入口は pitEntry（省略時はホームストレートの入口の少し手前）
 *   - スタンドはホームストレートの外側、ゴール板の前後
 *   - コースが閉じるよう、区間の長さはあらかじめ計算してある（閉じていなければ CourseTrack が警告する）
 */
export interface CourseSpec {
  id: string;
  name: string;
  shortName: string;
  description: string;
  direction: 'right' | 'left';
  /** 芝コースの幅（m） */
  trackWidth: number;
  /** ゴール板の位置（m）。コース全体がワールドの原点のまわりに来るように計算した値 */
  start: [number, number];
  /** ゴール板での進行方向（度。0 = 東 = +x） */
  headingDeg?: number;
  segments: SegmentSpec[];
  /** 高低差 [s, 高さ]（m）。最後はゴール板の高さに戻る */
  elevation: [number, number][];
  /** 坂・見どころ（確認用の「2」の視点） */
  hill: { label: string; s: number };
  labels?: [string, number][];
  pitEntry?: number;
  infield?: 'concrete';
  wind: { fromDeg: number; speed: number };
  rainChance: number;
  surface?: 'turf' | 'dirt';
  night?: boolean;
  scenery?: SceneryItem[];
  trees?: { density: number; color?: number };
}

export function defineCourse(spec: CourseSpec): CourseDefinition {
  const half = spec.trackWidth / 2;
  const segments: Segment[] = spec.segments.map((s) =>
    s[0] === 'S'
      ? { type: 'straight', length: M(s[1]), name: s[2] }
      : { type: 'arc', radius: M(s[1]), angleDeg: s[2], turn: s[0] === 'L' ? 'left' : 'right', name: s[3] },
  );
  // 区間の始まりの s（m）と全長
  const starts: number[] = [];
  let lap = 0;
  for (const s of spec.segments) {
    starts.push(lap);
    lap += s[0] === 'S' ? s[1] : (s[1] * s[2] * Math.PI) / 180;
  }
  const afterLine = spec.segments[0][1];
  const homeLength = spec.segments[spec.segments.length - 1][1];
  const homeStart = lap - homeLength;

  // ピットレーン：入口〜厩舎〜ゴール板の先で合流（1 コーナーの手前）
  const entry = spec.pitEntry ?? homeStart - 10;
  const entryEnd = entry + 50;
  const garageStart = entryEnd + 15;
  const garageEnd = lap - 12;
  const exitEnd = Math.min(62, afterLine - 8);

  // スタンド：ホームストレートとゴール後の直線の範囲で、ゴール板の前後
  const standFrom = homeStart + 15;
  const standTo = lap + afterLine - 15;
  const standLength = Math.min(220, standTo - standFrom);
  const standCenter = (standFrom + standTo) / 2;

  const labels: CourseLabel[] = [
    { text: 'ゴール', s: 0, lateral: -M(half + 12), height: 14 },
    { text: 'ピット入口', s: M(entry + 5), lateral: M(half), height: 8 },
    { text: 'ピットレーン（厩舎）', s: M((garageStart + garageEnd) / 2), lateral: M(half + 16), height: 14 },
    { text: 'ピット出口', s: M(Math.max(20, exitEnd - 26)), lateral: M(half + 2), height: 8 },
    { text: 'スタンド', s: M(standCenter), lateral: -M(half + 45), height: 30 },
    { text: spec.hill.label, s: M(spec.hill.s), lateral: 0, height: 16 },
    ...(spec.labels ?? []).map(([text, s]) => ({ text, s: M(s), lateral: 0, height: 10 })),
  ];
  // 名前の付いた区間（コーナー名など）は、その区間の真ん中にラベルを出す（ホームストレートとゴール後の直線は除く）
  spec.segments.forEach((seg, i) => {
    const name = seg[0] === 'S' ? seg[2] : seg[3];
    if (!name || i === 0 || i === spec.segments.length - 1) return;
    const len = seg[0] === 'S' ? seg[1] : (seg[1] * seg[2] * Math.PI) / 180;
    labels.push({ text: name, s: M(starts[i] + len / 2), lateral: 0, height: 10 });
  });

  // 高低差：ゴール板の高さで一周を閉じる
  const elev = [...spec.elevation].sort((a, b) => a[0] - b[0]);
  if (elev.length === 0 || elev[0][0] > 0) elev.unshift([0, elev[0]?.[1] ?? 0]);
  elev.push([lap, elev[0][1]]);

  const def: CourseDefinition = {
    id: spec.id,
    name: spec.name,
    shortName: spec.shortName,
    description: spec.description,
    direction: spec.direction,
    metersPerBlock: MPB,
    start: { x: M(spec.start[0]), z: M(spec.start[1]), headingDeg: spec.headingDeg ?? 0 },
    segments,
    trackWidth: M(spec.trackWidth),
    railOffset: M(0.3),
    embankment: M(20),
    elevation: elev.map(([s, h]) => ({ s: M(s), h: M(h) })),
    finishS: 0,
    pitLane: {
      entryStart: M(((entry % lap) + lap) % lap),
      entryEnd: M(entryEnd % lap),
      exitStart: M(10),
      exitEnd: M(exitEnd),
      lateral: M(half + 9),
      width: M(10),
      mergeLateral: M(Math.max(1, half - 7)),
      garageStart: M(garageStart % lap),
      garageEnd: M(garageEnd),
    },
    stands: { centerS: M(((standCenter % lap) + lap) % lap), length: M(standLength), offset: M(half + 12) },
    markers: { furlong: 200, small: 50 },
    labels,
    views: undefined as unknown as CourseViews,
    infield: spec.infield ? { surface: 'concrete', verge: 5 } : undefined,
    wind: spec.wind,
    rainChance: spec.rainChance,
    surface: spec.surface,
    night: spec.night,
    scenery: spec.scenery,
    trees: spec.trees,
  };

  // 確認用の視点：全景はホームストレートの内側の上空から（スタンドがホームストレートの向こう側になる）
  const track = new CourseTrack(def);
  const ext = track.extent();
  const cx = ((ext.minX + ext.maxX) / 2) * MPB;
  const cz = ((ext.minZ + ext.maxZ) / 2) * MPB;
  const span = Math.max(ext.maxX - ext.minX, ext.maxZ - ext.minZ) * MPB;
  const inward = track.frameAt(M(homeStart + homeLength / 2)).right;
  const dist = Math.max(380, span * 0.68);
  def.views = {
    overview: {
      position: [cx + inward.x * dist, Math.max(380, span * 0.72), cz + inward.z * dist],
      target: [cx - inward.x * span * 0.08, 0, cz - inward.z * span * 0.08],
    },
    hill: { from: { s: spec.hill.s - 120, lateral: 70, up: M(16) }, to: { s: spec.hill.s + 30, lateral: 0, up: 2 }, label: spec.hill.label },
    pit: { from: { s: homeStart + 10, lateral: -60, up: M(60) }, to: { s: Math.min(lap - 20, homeStart + 140), lateral: 30, up: 0 } },
    finish: { from: { s: 30, lateral: -20, up: 3 }, to: { s: lap - 100, lateral: 5, up: 2 } },
  };
  return def;
}
