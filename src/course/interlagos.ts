import type { CourseDefinition } from './types';

/** 1 ブロックの実寸（m）。京都と同じ縮尺 */
const MPB = 1.25;
/** メートル → ブロック */
const M = (meters: number) => meters / MPB;

/**
 * ブラジル・インテルラゴス（Interlagos）を模した芝コース（左回り = 反時計回り）。
 * 実コース（約 4,309m）を競馬場の大きさ（約 1,910m）に縮め、路面は芝にしている。
 *
 *   ゴール板 → 1コーナー                 80m
 *   セナのS字（左 → 右。急な下り）       80〜198m
 *   太陽のコーナー（長い左）             198〜333m
 *   反対側の直線（下り）                 333〜679m
 *   湖の下り（左・コースの最低地点）     679〜774m
 *   中低速の切り返し（フェラドゥーラ・ラランジーニャ・ピニェイリーニョ・ビコ・デ・パト・ムルグーリョ）
 *                                        774〜1310m
 *   ジュンサン（左）                     1310〜1373m
 *   登り坂（緩い左の高速カーブ）         1403〜1560m
 *   ホームストレート（登り）             1560〜1910m（ゴール板まで 約350m）
 *
 * 高低差：ホームストレート〜1コーナーが最も高く、セナのS字から湖の下りへ一気に下る。
 * ジュンサン（最低地点）からホームストレートへ一気に駆け上がる（実際は約 40m。ここでは 13m に縮めている）。
 *
 * 区間の長さのうち、反対側の直線とホームストレートの 2 つは、コースが閉じるように計算した値。
 */
const TRACK_WIDTH = 24;
const HALF = TRACK_WIDTH / 2;
const LAP = 1909.76;

// 主要地点の s（m）
const S_SENNA = 80;
const S_SOL = 198;
const S_RETA = 333;
const S_LAGO = 679;
const S_FERRADURA = 826;
const S_LARANJINHA = 912;
const S_PINHEIRINHO = 971;
const S_BICO = 1079;
const S_MERGULHO = 1209;
const S_JUNCAO = 1310;
const S_SUBIDA = 1403;
const S_HOME = 1560;

export const INTERLAGOS: CourseDefinition = {
  id: 'interlagos',
  name: 'インテルラゴス・芝（左回り）',
  shortName: 'インテルラゴス 芝',
  description: '左回り・約1,910m。セナのS字の下りと中低速の切り返し、最後は急な登り坂からホームストレートへ',
  direction: 'left',
  metersPerBlock: MPB,
  // ゴール板はホームストレート上。東向き（+x）に走る。コース全体がワールドの原点のまわりに来る位置
  start: { x: M(166.37), z: M(167.37), headingDeg: 0 },
  segments: [
    { type: 'straight', length: M(80), name: 'ホームストレート（ゴール後）' },
    { type: 'arc', radius: M(40), angleDeg: 85, turn: 'left', name: 'セナのS字（左）' },
    { type: 'straight', length: M(10) },
    { type: 'arc', radius: M(40), angleDeg: 70, turn: 'right', name: 'セナのS字（右）' },
    { type: 'arc', radius: M(55), angleDeg: 140, turn: 'left', name: '太陽のコーナー' },
    { type: 'straight', length: M(346.3842), name: '反対側の直線' },
    { type: 'arc', radius: M(40), angleDeg: 115, turn: 'left', name: '湖の下り' },
    { type: 'straight', length: M(15) },
    { type: 'arc', radius: M(60), angleDeg: 30, turn: 'left' },
    { type: 'straight', length: M(20) },
    { type: 'arc', radius: M(40), angleDeg: 110, turn: 'right', name: 'フェラドゥーラ' },
    { type: 'straight', length: M(10) },
    { type: 'arc', radius: M(50), angleDeg: 50, turn: 'right', name: 'ラランジーニャ' },
    { type: 'straight', length: M(15) },
    { type: 'arc', radius: M(40), angleDeg: 140, turn: 'left', name: 'ピニェイリーニョ' },
    { type: 'straight', length: M(10) },
    { type: 'arc', radius: M(40), angleDeg: 165, turn: 'right', name: 'ビコ・デ・パト' },
    { type: 'straight', length: M(15) },
    { type: 'arc', radius: M(45), angleDeg: 110, turn: 'left', name: 'ムルグーリョ' },
    { type: 'straight', length: M(15) },
    { type: 'arc', radius: M(40), angleDeg: 90, turn: 'left', name: 'ジュンサン' },
    { type: 'straight', length: M(30) },
    { type: 'arc', radius: M(200), angleDeg: 45, turn: 'left', name: '登り坂' },
    { type: 'straight', length: M(349.3801), name: 'ホームストレート' },
  ],
  trackWidth: M(TRACK_WIDTH),
  railOffset: M(0.3),
  embankment: M(20),
  elevation: [
    { s: 0, h: M(13) },
    { s: M(60), h: M(13) },
    { s: M(S_SOL + 5), h: M(5) }, // セナのS字で一気に下る
    { s: M(S_RETA), h: M(4) },
    { s: M(S_LAGO - 10), h: 0 }, // 反対側の直線を下り切って湖の下りへ
    { s: M(S_FERRADURA - 40), h: 0 },
    { s: M(S_FERRADURA + 60), h: M(3) },
    { s: M(S_PINHEIRINHO + 60), h: M(3) },
    { s: M(S_BICO + 60), h: M(2.5) },
    { s: M(S_MERGULHO + 30), h: M(2.5) },
    { s: M(S_JUNCAO + 20), h: 0 }, // ムルグーリョで下ってジュンサン（最低地点）
    { s: M(S_SUBIDA - 20), h: 0 },
    { s: M(S_HOME + 30), h: M(12) }, // 登り坂を一気に駆け上がる
    { s: M(LAP), h: M(13) },
  ],
  finishS: 0,
  pitLane: {
    entryStart: M(S_HOME - 20), // 登り坂を上り切った所から内側（左）へ分岐
    entryEnd: M(S_HOME + 50),
    exitStart: M(10), // ゴール板を過ぎてから合流を開始し、
    exitEnd: M(62), //   1コーナー（セナのS字）の手前で本コースへ戻る
    lateral: M(HALF + 9),
    width: M(10),
    mergeLateral: M(HALF - 7),
    garageStart: M(S_HOME + 90),
    garageEnd: M(S_HOME + 310),
  },
  stands: { centerS: M(LAP - 60), length: M(220), offset: M(HALF + 12) },
  markers: { furlong: 200, small: 50 },
  // インフィールドはサーキットらしいグレーの舗装（走路の脇 5 ブロック = 約 6m は草を残す）
  infield: { surface: 'concrete', verge: 5 },
  labels: [
    { text: 'ゴール', s: 0, lateral: -M(HALF + 12), height: 14 },
    { text: 'セナのS字', s: M(S_SENNA + 70), lateral: 0, height: 12 },
    { text: '太陽のコーナー', s: M(S_SOL + 70), lateral: 0, height: 10 },
    { text: '反対側の直線', s: M(S_RETA + 170), lateral: 0, height: 10 },
    { text: '湖の下り', s: M(S_LAGO + 40), lateral: 0, height: 10 },
    { text: 'フェラドゥーラ', s: M(S_FERRADURA + 40), lateral: 0, height: 10 },
    { text: 'ラランジーニャ', s: M(S_LARANJINHA + 22), lateral: 0, height: 10 },
    { text: 'ピニェイリーニョ', s: M(S_PINHEIRINHO + 50), lateral: 0, height: 10 },
    { text: 'ビコ・デ・パト', s: M(S_BICO + 58), lateral: 0, height: 10 },
    { text: 'ムルグーリョ', s: M(S_MERGULHO + 43), lateral: 0, height: 10 },
    { text: 'ジュンサン', s: M(S_JUNCAO + 32), lateral: 0, height: 10 },
    { text: '登り坂', s: M(S_SUBIDA + 80), lateral: 0, height: 14 },
    { text: 'ピット入口', s: M(S_HOME - 5), lateral: M(HALF), height: 8 },
    { text: 'ピットレーン（厩舎）', s: M(S_HOME + 200), lateral: M(HALF + 16), height: 14 },
    { text: 'ピット出口', s: M(36), lateral: M(HALF + 2), height: 8 },
    { text: 'ホームストレート', s: M(S_HOME + 60), lateral: -M(6), height: 8 },
    { text: 'スタンド', s: M(LAP - 60), lateral: -M(HALF + 45), height: 30 },
  ],
  views: {
    // 全景はインフィールド側（北）から。南側から見るとスタンドの屋根がホームストレートとゴールを隠すため、
    // ホームストレートの向こう側にスタンドが来る向きにする
    overview: { position: [0, 520, -520], target: [0, 0, 30] },
    // ジュンサン側の内馬場から、登り坂とホームストレートを見上げる
    hill: { from: { s: S_JUNCAO + 40, lateral: 70, up: M(10) }, to: { s: S_HOME + 20, lateral: 0, up: 2 }, label: '登り坂' },
    pit: { from: { s: S_HOME + 20, lateral: -60, up: M(70) }, to: { s: S_HOME + 150, lateral: 30, up: 0 } },
    finish: { from: { s: 30, lateral: -20, up: 3 }, to: { s: LAP - 100, lateral: 5, up: 2 } },
  },
};
