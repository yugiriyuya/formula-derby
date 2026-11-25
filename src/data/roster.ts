/**
 * 出走表データ（コンストラクター・騎手・馬）。
 * 能力値（1〜10）と騎手名はゲーム用の仮の値。後でエディット機能・キャリアモード・賭けモードから
 * 差し替えられるよう、ゲームロジックから分離している。
 *
 * 頭数を増やす時は CONSTRUCTORS と ENTRIES に追加するだけでよい
 * （ゲート枠数・ピットボックス数・順位表・ミニマップは配列の長さから決まる。最大 12 コンスト / 24 頭程度を想定）。
 */
import type { HorseshoeType } from './horseshoes';
import type { RunningStyle } from './runningStyles';

export interface HorseStats {
  /** スピード：最高速度 */
  speed: number;
  /** スタミナ：消耗の少なさ */
  stamina: number;
  /** パワー：加速・坂・道悪 */
  power: number;
  /** 賢さ：ムチへの反応 */
  intelligence: number;
}

export interface HorseData {
  name: string;
  /** 毛色（芦毛はセーフティホース用に空けておく） */
  coat: number;
  stats: HorseStats;
  /** 脚質（逃げ・先行・差し・追込） */
  style: RunningStyle;
}

export interface JockeyData {
  name: string;
  /** 戦略：ムチ判断・進路取り・ピット判断・作業スピード */
  strategy: number;
}

export interface ConstructorData {
  id: string;
  name: string;
  /** 英語表記 */
  nameEn: string;
  /** 勝負服・厩舎の色 */
  color: number;
  /** 帽子の色 */
  capColor: number;
  /** ピットクルーの腕（1〜10）。高いほど蹄鉄交換が速い */
  pitCrew: number;
}

export interface EntryData {
  id: string;
  number: number;
  constructorId: string;
  jockey: JockeyData;
  horse: HorseData;
  startShoe: HorseshoeType;
}

/**
 * 色はゲーム内で 6 チームを見分けやすくするための割り当て（実際の勝負服の再現ではない）。
 * 並び順 = ピットボックス（厩舎）の並び順。
 */
export const CONSTRUCTORS: ConstructorData[] = [
  { id: 'sunday', name: 'サンデー', nameEn: 'Sunday', color: 0xd83a3a, capColor: 0xffffff, pitCrew: 10 },
  { id: 'carrot', name: 'キャロット', nameEn: 'Carrot', color: 0xf07c24, capColor: 0x1f3a8a, pitCrew: 8 },
  { id: 'silk', name: 'シルク', nameEn: 'Silk', color: 0x8a3fd1, capColor: 0xf2c230, pitCrew: 9 },
  { id: 'shadai', name: '社台', nameEn: 'Shadai', color: 0x2fae5a, capColor: 0xffffff, pitCrew: 4 },
  { id: 'danox', name: 'ダノックス', nameEn: 'Danox', color: 0xf2c230, capColor: 0x222222, pitCrew: 1 },
  { id: 'godolphin', name: 'ゴドルフィン', nameEn: 'Godolphin', color: 0x2f6fd8, capColor: 0xffd23a, pitCrew: 7 },
  // 16 頭立ての時だけ出走する 2 チーム
  { id: 'northhills', name: 'ノースヒルズ', nameEn: 'North Hills', color: 0x1fb5b0, capColor: 0x222222, pitCrew: 7 },
  { id: 'kaneko', name: '金子真人HD', nameEn: 'Kaneko Makoto HD', color: 0x8a5a2b, capColor: 0xffd23a, pitCrew: 6 },
];

const COAT = { bay: 0x7a4a2a, darkBay: 0x4a2c1a, chestnut: 0xa65a28, black: 0x2a2420 };

const entry = (
  number: number,
  constructorId: string,
  jockey: JockeyData,
  horse: HorseData,
  startShoe: HorseshoeType = 'SOFT',
): EntryData => ({ id: `e${number}`, number, constructorId, jockey, horse, startShoe });

// 初期データ（設定画面の「初期値に戻す」でこの値に戻る）
export const ENTRIES: EntryData[] = [
  entry(1, 'sunday', { name: 'デムーロ', strategy: 7 }, { name: 'ドゥラメンテ', coat: COAT.darkBay, stats: { speed: 9, stamina: 6, power: 8, intelligence: 5 }, style: 'senko' }),
  entry(2, 'sunday', { name: '岩田康誠', strategy: 5 }, { name: 'ジェンティルドンナ', coat: COAT.chestnut, stats: { speed: 8, stamina: 8, power: 7, intelligence: 6 }, style: 'senko' }, 'HARD'),
  entry(3, 'carrot', { name: 'レーン', strategy: 8 }, { name: 'リスグラシュー', coat: COAT.darkBay, stats: { speed: 7, stamina: 6, power: 6, intelligence: 6 }, style: 'sashi' }),
  entry(4, 'carrot', { name: '横山武', strategy: 6 }, { name: 'エフフォーリア', coat: COAT.black, stats: { speed: 6, stamina: 7, power: 7, intelligence: 7 }, style: 'senko' }, 'HARD'),
  entry(5, 'silk', { name: 'ルメール', strategy: 7 }, { name: 'イクイノックス', coat: COAT.chestnut, stats: { speed: 9, stamina: 8, power: 8, intelligence: 6 }, style: 'sashi' }),
  entry(6, 'silk', { name: 'モレイラ', strategy: 9 }, { name: 'アーモンドアイ', coat: COAT.bay, stats: { speed: 7, stamina: 7, power: 6, intelligence: 8 }, style: 'sashi' }, 'HARD'),
  entry(7, 'shadai', { name: '横山典弘', strategy: 4 }, { name: 'ハーツクライ', coat: COAT.darkBay, stats: { speed: 7, stamina: 8, power: 5, intelligence: 6 }, style: 'sashi' }),
  entry(8, 'shadai', { name: '松山弘平', strategy: 5 }, { name: 'ステイゴールド', coat: COAT.bay, stats: { speed: 5, stamina: 8, power: 7, intelligence: 7 }, style: 'oikomi' }, 'HARD'),
  entry(9, 'danox', { name: '川田将雅', strategy: 7 }, { name: 'ダノンプレミアム', coat: COAT.black, stats: { speed: 5, stamina: 5, power: 7, intelligence: 6 }, style: 'nige' }),
  entry(10, 'danox', { name: '戸崎圭太', strategy: 3 }, { name: 'ダノンデサイル', coat: COAT.chestnut, stats: { speed: 6, stamina: 6, power: 8, intelligence: 7 }, style: 'senko' }, 'HARD'),
  entry(11, 'godolphin', { name: 'デットーリ', strategy: 6 }, { name: 'ドバイミレニアム', coat: COAT.bay, stats: { speed: 7, stamina: 7, power: 7, intelligence: 4 }, style: 'nige' }),
  entry(12, 'godolphin', { name: 'スミヨン', strategy: 8 }, { name: 'サンダースノー', coat: COAT.darkBay, stats: { speed: 8, stamina: 6, power: 6, intelligence: 9 }, style: 'oikomi' }, 'HARD'),
  // ここから下は 16 頭立ての時だけ
  entry(13, 'northhills', { name: '福永祐一', strategy: 4 }, { name: 'コントレイル', coat: COAT.darkBay, stats: { speed: 2, stamina: 5, power: 4, intelligence: 4 }, style: 'sashi' }),
  entry(14, 'northhills', { name: '坂井瑠星', strategy: 2 }, { name: 'キズナ', coat: COAT.darkBay, stats: { speed: 4, stamina: 7, power: 6, intelligence: 6 }, style: 'oikomi' }, 'HARD'),
  entry(15, 'kaneko', { name: '吉田隼人', strategy: 5 }, { name: 'ソダシ', coat: COAT.chestnut, stats: { speed: 8, stamina: 4, power: 6, intelligence: 6 }, style: 'nige' }),
  entry(16, 'kaneko', { name: '武豊', strategy: 8 }, { name: 'ディープインパクト', coat: COAT.bay, stats: { speed: 10, stamina: 9, power: 6, intelligence: 8 }, style: 'oikomi' }, 'HARD'),
];

/** 出走頭数（既定 12 頭、最大 16 頭） */
export type FieldSize = 12 | 16;
export const FIELD_SIZES: FieldSize[] = [12, 16];

/** 頭数に合わせた出走表（出走表の先頭から。12 頭ならチームも先頭の 6 つ） */
export function fieldEntries(size: number): EntryData[] {
  return ENTRIES.slice(0, Math.max(2, Math.min(ENTRIES.length, size)));
}

/** 出走表に出てくるコンストラクター（CONSTRUCTORS の並び = ピットボックスの並び） */
export function teamsOf(entries: readonly EntryData[]): ConstructorData[] {
  return CONSTRUCTORS.filter((c) => entries.some((e) => e.constructorId === c.id));
}

/** 既定のプレイヤー操作馬（1 番 ドゥラメンテ）。URL の ?player=番号 で変更できる */
export const PLAYER_ENTRY_ID = 'e1';

export const constructorOf = (e: EntryData): ConstructorData =>
  CONSTRUCTORS.find((c) => c.id === e.constructorId)!;

/** 同じコンストラクター内での番号（0 = 1 頭目, 1 = 2 頭目） */
export const teammateIndex = (e: EntryData): number =>
  ENTRIES.filter((x) => x.constructorId === e.constructorId).indexOf(e);

/** 帽子の色：1 頭目はコンストラクター指定色、2 頭目は白（指定色が白なら黒）で僚馬を見分ける */
export const capColorOf = (e: EntryData): number => {
  const c = constructorOf(e);
  if (teammateIndex(e) === 0) return c.capColor;
  return c.capColor === 0xffffff ? 0x222222 : 0xffffff;
};
