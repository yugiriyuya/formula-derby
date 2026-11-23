import type { CourseDefinition } from './types';

/** 1 ブロックの実寸（m）。馬（約 2.9m）が実寸に近く見え、70km/h で地面が十分速く流れる縮尺 */
const MPB = 1.25;
/** メートル → ブロック */
const M = (meters: number) => meters / MPB;

/**
 * 京都競馬場・芝外回りコース（右回り）を模したコース。寸法はメートルで書き、ブロックに換算する。
 *
 *   ゴール板 → 1コーナー入口        76m
 *   1〜2コーナー（半径 150m）       471m
 *   向正面                          476m
 *   3〜4コーナー（半径 150m）       471m
 *   4コーナー出口 → ゴール板        400m（実コースの直線 約404m）
 *   全長 約 1894m（実コースと同じ）
 *
 * 淀の坂: 向正面後半から登り、3コーナーで頂上、4コーナーにかけて下る。
 * 実際の高低差は約 4.3m だが、雄大さを出すため 8m に誇張している。
 */
const RADIUS = 150;
const STRAIGHT = 476;
const GOAL_TO_1C = 76;
const TRACK_WIDTH = 32;
const HALF = TRACK_WIDTH / 2;

// 主要地点の s（m）
const S_1C = GOAL_TO_1C; // 76
const S_BACK = S_1C + Math.PI * RADIUS; // 547 向正面入口
const S_3C = S_BACK + STRAIGHT; // 1023 3コーナー入口
const S_4C_EXIT = S_3C + Math.PI * RADIUS; // 1494 4コーナー出口

export const KYOTO_OUTER: CourseDefinition = {
  id: 'kyoto-outer',
  name: '京都・芝外回り（右回り）',
  metersPerBlock: MPB,
  // ゴール板はホームストレッチ（南側）上。西向き（-x）に走る。
  start: { x: M(STRAIGHT / 2 - 400), z: M(RADIUS), headingDeg: 180 },
  segments: [
    { type: 'straight', length: M(GOAL_TO_1C), name: 'ホームストレッチ（ゴール後）' },
    { type: 'arc', radius: M(RADIUS), angleDeg: 180, turn: 'right', name: '1〜2コーナー' },
    { type: 'straight', length: M(STRAIGHT), name: '向正面' },
    { type: 'arc', radius: M(RADIUS), angleDeg: 180, turn: 'right', name: '3〜4コーナー' },
    { type: 'straight', length: M(STRAIGHT - GOAL_TO_1C), name: 'ホームストレッチ' },
  ],
  trackWidth: M(TRACK_WIDTH), // 実コース（約24〜38m）並み。ラチが近く、馬群がラチぎりぎりを攻める
  railOffset: M(0.3),
  embankment: M(20),
  elevation: [
    { s: 0, h: 0 },
    { s: M(750), h: 0 },
    { s: M(S_3C + 40), h: M(8) }, // 3コーナーで頂上
    { s: M(S_3C + 120), h: M(8) },
    { s: M(S_3C + 300), h: 0 }, // 4コーナーで下り切る
  ],
  finishS: 0,
  pitLane: {
    entryStart: M(S_4C_EXIT - 30), // 4コーナー出口手前から内側へ分岐
    entryEnd: M(S_4C_EXIT + 50),
    exitStart: M(10), // ゴール板を過ぎてから合流を開始し、
    exitEnd: M(62), //   1コーナー入口の手前で本コースへ戻る
    lateral: M(HALF + 9),
    width: M(10),
    mergeLateral: M(HALF - 8),
    garageStart: M(S_4C_EXIT + 110),
    garageEnd: M(S_4C_EXIT + 350),
  },
  stands: { centerS: M(1894 - 60), length: M(220), offset: M(HALF + 12) },
  labels: [
    { text: 'ゴール', s: 0, lateral: -M(HALF + 12), height: 14 },
    { text: '1コーナー', s: M(S_1C + 118), lateral: 0, height: 10 },
    { text: '2コーナー', s: M(S_1C + 353), lateral: 0, height: 10 },
    { text: '向正面', s: M(S_BACK + 238), lateral: 0, height: 10 },
    { text: '淀の坂（頂上）', s: M(S_3C + 80), lateral: 0, height: 16 },
    { text: '4コーナー', s: M(S_3C + 353), lateral: 0, height: 10 },
    { text: 'ピット入口', s: M(S_4C_EXIT - 15), lateral: M(HALF), height: 8 },
    { text: 'ピットレーン（厩舎）', s: M(S_4C_EXIT + 230), lateral: M(HALF + 16), height: 14 },
    { text: 'ピット出口', s: M(36), lateral: M(HALF + 2), height: 8 },
    { text: 'ホームストレッチ', s: M(S_4C_EXIT + 60), lateral: -M(8), height: 8 },
    { text: 'スタンド', s: M(1894 - 60), lateral: -M(HALF + 45), height: 30 },
  ],
};
