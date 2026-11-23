import type { CourseDefinition } from './types';

/**
 * 京都競馬場・芝外回りコース（右回り）を模したコース。
 *
 * 寸法（1 ブロック = 4m）
 *   ゴール板 → 1コーナー入口      25 ブロック（100m）
 *   1〜2コーナー（半径 42）       132 ブロック
 *   向正面                        100 ブロック（400m）
 *   3〜4コーナー（半径 42）       132 ブロック
 *   4コーナー出口 → ゴール板      75 ブロック（300m）
 *   全長 約 464 ブロック ≒ 1856m（実コースは約 1894m）
 *
 * 淀の坂: 向正面後半から登り、3コーナーで頂上、4コーナーにかけて下る。
 * 実際の高低差は約 4.3m（≒ 1 ブロック）だが、ブロック表現で見えるよう 4 ブロックに誇張している。
 */
export const KYOTO_OUTER: CourseDefinition = {
  id: 'kyoto-outer',
  name: '京都・芝外回り（右回り）',
  metersPerBlock: 4,
  // ゴール板はホームストレッチ（南側, z = +42）上。西向き（-x）に走る。
  start: { x: -25, z: 42, headingDeg: 180 },
  segments: [
    { type: 'straight', length: 25, name: 'ホームストレッチ（ゴール後）' },
    { type: 'arc', radius: 42, angleDeg: 180, turn: 'right', name: '1〜2コーナー' },
    { type: 'straight', length: 100, name: '向正面' },
    { type: 'arc', radius: 42, angleDeg: 180, turn: 'right', name: '3〜4コーナー' },
    { type: 'straight', length: 75, name: 'ホームストレッチ' },
  ],
  trackWidth: 8,
  embankment: 8,
  // s: 0 ゴール / 25 1C入口 / 157 向正面入口 / 257 3C入口 / 389 4C出口 / 464 ゴール
  elevation: [
    { s: 0, h: 0 },
    { s: 205, h: 0 },
    { s: 268, h: 4 }, // 3コーナーで頂上
    { s: 285, h: 4 },
    { s: 345, h: 0 }, // 4コーナーで下り切る
  ],
  finishS: 0,
  pitLane: {
    entryStart: 381, // 4コーナー出口手前から内側へ分岐
    entryEnd: 395,
    exitStart: 428,
    exitEnd: 442, // ホームストレッチ前半で本コースへ合流
    lateral: 10,
    width: 4,
    mergeLateral: 2,
    garageStart: 398,
    garageEnd: 426,
  },
  dirtCourse: { lateral: 21, width: 6 },
  stands: { centerS: 452, length: 50, offset: 8 },
  labels: [
    { text: 'ゴール', s: 0, lateral: -5, height: 9 },
    { text: '1コーナー', s: 58, lateral: 0, height: 7 },
    { text: '2コーナー', s: 124, lateral: 0, height: 7 },
    { text: '向正面', s: 207, lateral: 0, height: 7 },
    { text: '淀の坂（頂上）', s: 276, lateral: 0, height: 9 },
    { text: '4コーナー', s: 350, lateral: 0, height: 7 },
    { text: 'ピット入口', s: 384, lateral: 7, height: 6 },
    { text: 'ピットレーン（厩舎）', s: 412, lateral: 11, height: 9 },
    { text: 'ピット出口', s: 438, lateral: 6, height: 6 },
    { text: 'ホームストレッチ', s: 405, lateral: -2, height: 6 },
    { text: 'スタンド', s: 452, lateral: -18, height: 14 },
    { text: 'ダートコース', s: 207, lateral: 21, height: 5 },
  ],
};
