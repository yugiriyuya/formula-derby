import { defineCourse } from './builder';

/**
 * 競馬場のコース。区間の長さは、コースが閉じるようにあらかじめ計算した値（m）。
 * start はコース全体がワールドの原点のまわりに来るゴール板の位置。高低差は誇張している。
 * scenery はコースまわりの景観（池・山並み・建物・照明塔など）。
 */

export const KYOTO_OUTER = defineCourse({
  id: 'kyoto-outer',
  name: '京都・芝外回り（右回り）',
  shortName: '京都 芝外回り',
  description: '右回り・約1,760m。きつい1〜2コーナーと、淀の坂を上り下りする大きな3〜4コーナー、約400mの直線',
  direction: 'right',
  trackWidth: 32,
  start: [171.500, -164.190],
  segments: [
    ['S', 76],
    ['R', 110, 165, '1〜2コーナー'],
    ['S', 408.2043, '向正面'],
    ['R', 190, 105, '3コーナー（淀の坂）'],
    ['S', 13.3778],
    ['R', 125, 90, '4コーナー'],
    ['S', 404, 'ホームストレッチ'],
  ],
  elevation: [[0, 0], [577, 0], [923, 8], [1010, 8], [1281, 0]],
  hill: { label: '淀の坂', s: 940 },
  trees: { density: 1 },
  scenery: [
    { kind: 'water', s: 475, lateral: 100, w: 190, d: 70, boats: 0 },
    { kind: 'mountains', count: 16, height: [70, 160], color: 0x3f6b3a },
    { kind: 'buildings', from: 434, to: 871, side: 'out', offset: 55, height: [8, 16], colors: [0xe8d8c0, 0xd8c4a8, 0xc9b49a, 0xf0e6d6, 0xb98f6e], spacing: 26 },
  ],
  wind: { fromDeg: 315, speed: 4 },
  rainChance: 0.2,
});

export const TOKYO = defineCourse({
  id: 'tokyo',
  name: '東京・芝（左回り）',
  shortName: '東京',
  description: '左回り・約2,100m。幅42mの広いコース、向正面の緩い曲がりと上り下り、だらだら坂のある約500mの直線',
  direction: 'left',
  trackWidth: 42,
  start: [197.500, 160.001],
  segments: [
    ['S', 100],
    ['L', 130, 90, '1コーナー'],
    ['S', 60],
    ['L', 130, 90, '2コーナー'],
    ['S', 452.3401, '向正面'],
    ['L', 400, 15, '向正面の曲がり'],
    ['S', 60],
    ['L', 150, 75, '3コーナー'],
    ['S', 20.9525],
    ['L', 125, 90, '4コーナー'],
    ['S', 500, 'ホームストレッチ'],
  ],
  elevation: [[0, 2.5], [568, 2.5], [749, 0.5], [930, 3.5], [1185, 1.5], [1381, 0], [1749, 0], [1899, 2.5]],
  hill: { label: '直線の坂', s: 1824 },
  trees: { density: 1 },
  scenery: [
    { kind: 'landmark', s: 817, lateral: 70, boxes: [[0, 0, 70, 4, 26, 0x2a2e35], [0, -2.6, 64, 1, 20, 0x3a8fd8, true], [-30, 0, 3, 3, 8, 0x6c747c], [30, 0, 3, 3, 8, 0x6c747c]] },
    { kind: 'water', s: 681, lateral: 130, w: 120, d: 45 },
    { kind: 'buildings', from: 568, to: 1126, side: 'out', offset: 60, height: [10, 30], colors: [0xb8bcc2, 0x9aa3ad, 0xd5d0c4, 0x7f8a96, 0xc4b8a6, 0x8fa0b0], spacing: 28 },
  ],
  wind: { fromDeg: 315, speed: 5 },
  rainChance: 0.25,
});

export const NAKAYAMA = defineCourse({
  id: 'nakayama',
  name: '中山・芝（右回り）',
  shortName: '中山',
  description: '右回り・約1,570m。小回りの1〜2コーナー、下りの向正面、斜めに回る3コーナーと、ゴール前の急坂（約110mで一気に上る）',
  direction: 'right',
  trackWidth: 32,
  start: [115.000, -155.002],
  segments: [
    ['S', 70],
    ['R', 110, 90, '1コーナー'],
    ['S', 90],
    ['R', 110, 90, '2コーナー'],
    ['S', 287.6245, '向正面（下り）'],
    ['R', 150, 60, '3コーナー'],
    ['S', 98.1495],
    ['R', 100, 120, '4コーナー'],
    ['S', 310, 'ホームストレッチ'],
  ],
  elevation: [[0, 6.5], [156, 6.5], [454, 7], [794, 1], [950, 0], [1413, 0], [1531, 6.5]],
  hill: { label: '中山の急坂', s: 1481 },
  trees: { density: 1.3 },
  scenery: [
    { kind: 'water', s: 650, lateral: 80, w: 150, d: 55, boats: 0 },
    { kind: 'mountains', count: 10, height: [40, 80], color: 0x4a7a40 },
  ],
  wind: { fromDeg: 315, speed: 6 },
  rainChance: 0.2,
});

export const KAWASAKI = defineCourse({
  id: 'kawasaki',
  name: '川崎・ダート（左回り・ナイター）',
  shortName: '川崎 ダート',
  description: '左回り・約1,200mのダート。入りが緩く出口がきついスパイラルカーブの超小回りと約300mの直線。ナイター開催',
  direction: 'left',
  trackWidth: 30,
  start: [75.905, 54.873],
  segments: [
    ['S', 120],
    ['L', 75, 70, '1コーナー'],
    ['L', 45, 110, '2コーナー（スパイラル）'],
    ['S', 420, '向正面'],
    ['L', 75, 70, '3コーナー'],
    ['L', 45, 110, '4コーナー（スパイラル）'],
    ['S', 300],
  ],
  elevation: [[0, 0.5], [508, 0], [853, 0.5]],
  hill: { label: 'スパイラルカーブ', s: 836 },
  surface: 'dirt',
  night: true,
  trees: { density: 0.15 },
  scenery: [
    { kind: 'lights', every: 95, offset: 18 },
    { kind: 'buildings', from: 0, to: 1195, side: 'out', offset: 45, rows: 2, height: [18, 55], colors: [0x8d939a, 0xa7adb3, 0x6f757c, 0xbfc4c8, 0x9a8f86, 0x5e6670], spacing: 30 },
    { kind: 'landmark', s: 508, lateral: -110, boxes: [[0, 0, 22, 22, 70, 0x7c858f], [0, 0, 6, 6, 95, 0x9aa0a8], [-30, 10, 26, 18, 40, 0x6c747c], [0, 0, 3, 3, 4, 0xff5030, true]] },
  ],
  wind: { fromDeg: 180, speed: 5 },
  rainChance: 0.2,
});

export const MOONEE_VALLEY = defineCourse({
  id: 'moonee-valley',
  name: '旧ムーニーバレー・芝（左回り）',
  shortName: 'ムーニーバレー',
  description: '左回り・約1,370m。ずっと曲がり続けるようなきついコーナーと、長いスウィーピングの最終コーナーの先、ゴールまで約120mの超短い直線',
  direction: 'left',
  trackWidth: 30,
  start: [41.825, 212.258],
  segments: [
    ['S', 60],
    ['L', 90, 80, '1コーナー'],
    ['S', 150],
    ['L', 110, 60, '2コーナー'],
    ['S', 117.7062],
    ['L', 100, 90, '3コーナー'],
    ['S', 207.3039],
    ['L', 140, 130, '最終コーナー'],
    ['S', 120],
  ],
  elevation: [[0, 2], [510, 0], [830, 2], [1092, 3]],
  hill: { label: '最終コーナー', s: 1092 },
  pitEntry: 1076,
  trees: { density: 1.2, color: 0x6f8f4a },
  scenery: [
    { kind: 'buildings', from: 60, to: 933, side: 'out', offset: 40, rows: 2, height: [6, 10], colors: [0xe8d8c0, 0xd8c4a8, 0xc9b49a, 0xf0e6d6, 0xb98f6e], spacing: 22, depth: 12 },
  ],
  wind: { fromDeg: 180, speed: 5 },
  rainChance: 0.25,
});
