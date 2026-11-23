/**
 * 出走表データ（コンストラクター・騎手・馬）。
 * 能力値（1〜10）と騎手名はゲーム用の仮の値。後でエディット機能・キャリアモード・賭けモードから
 * 差し替えられるよう、ゲームロジックから分離している。
 *
 * 頭数を増やす時は CONSTRUCTORS と ENTRIES に追加するだけでよい
 * （ゲート枠数・ピットボックス数・順位表・ミニマップは配列の長さから決まる。最大 12 コンスト / 24 頭程度を想定）。
 */
import type { HorseshoeType } from './horseshoes';

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
  { id: 'sunday', name: 'サンデー', nameEn: 'Sunday', color: 0xd83a3a, capColor: 0xffffff },
  { id: 'carrot', name: 'キャロット', nameEn: 'Carrot', color: 0xf07c24, capColor: 0x1f3a8a },
  { id: 'silk', name: 'シルク', nameEn: 'Silk', color: 0x8a3fd1, capColor: 0xf2c230 },
  { id: 'shadai', name: '社台', nameEn: 'Shadai', color: 0x2fae5a, capColor: 0xffffff },
  { id: 'danox', name: 'ダノックス', nameEn: 'Danox', color: 0xf2c230, capColor: 0x222222 },
  { id: 'godolphin', name: 'ゴドルフィン', nameEn: 'Godolphin', color: 0x2f6fd8, capColor: 0xffd23a },
];

const COAT = { bay: 0x7a4a2a, darkBay: 0x4a2c1a, chestnut: 0xa65a28, black: 0x2a2420 };

const entry = (
  number: number,
  constructorId: string,
  jockey: JockeyData,
  horse: HorseData,
  startShoe: HorseshoeType = 'SOFT',
): EntryData => ({ id: `e${number}`, number, constructorId, jockey, horse, startShoe });

// 能力値・騎手名はゲーム用の仮の値（騎手名は架空）
export const ENTRIES: EntryData[] = [
  entry(1, 'sunday', { name: '赤城 颯', strategy: 7 }, { name: 'クロワデュノール', coat: COAT.bay, stats: { speed: 7, stamina: 7, power: 6, intelligence: 7 } }),
  entry(2, 'sunday', { name: '朱野 透', strategy: 5 }, { name: 'ジェンティルドンナ', coat: COAT.chestnut, stats: { speed: 6, stamina: 8, power: 7, intelligence: 5 } }, 'HARD'),
  entry(3, 'carrot', { name: '青葉 湊', strategy: 8 }, { name: 'リスグラシュー', coat: COAT.darkBay, stats: { speed: 8, stamina: 6, power: 6, intelligence: 6 } }),
  entry(4, 'carrot', { name: '藍沢 律', strategy: 6 }, { name: 'エフフォーリア', coat: COAT.black, stats: { speed: 6, stamina: 7, power: 7, intelligence: 7 } }, 'HARD'),
  entry(5, 'silk', { name: '金森 陽', strategy: 6 }, { name: 'イクイノックス', coat: COAT.chestnut, stats: { speed: 7, stamina: 6, power: 8, intelligence: 5 } }),
  entry(6, 'silk', { name: '黄瀬 匠', strategy: 7 }, { name: 'アーモンドアイ', coat: COAT.bay, stats: { speed: 6, stamina: 7, power: 6, intelligence: 8 } }, 'HARD'),
  entry(7, 'shadai', { name: '緑川 蓮', strategy: 9 }, { name: 'スターズオンアース', coat: COAT.darkBay, stats: { speed: 7, stamina: 8, power: 5, intelligence: 6 } }),
  entry(8, 'shadai', { name: '若葉 新', strategy: 5 }, { name: 'マスカレードボール', coat: COAT.bay, stats: { speed: 5, stamina: 8, power: 7, intelligence: 7 } }, 'HARD'),
  entry(9, 'danox', { name: '紫藤 慧', strategy: 7 }, { name: 'ダノンプレミアム', coat: COAT.black, stats: { speed: 8, stamina: 5, power: 7, intelligence: 6 } }),
  entry(10, 'danox', { name: '藤宮 環', strategy: 6 }, { name: 'ダノンデサイル', coat: COAT.chestnut, stats: { speed: 6, stamina: 6, power: 8, intelligence: 7 } }, 'HARD'),
  entry(11, 'godolphin', { name: '橙山 駿', strategy: 6 }, { name: 'レモンポップ', coat: COAT.bay, stats: { speed: 7, stamina: 7, power: 7, intelligence: 4 } }),
  entry(12, 'godolphin', { name: '柿本 渉', strategy: 8 }, { name: 'タワーオブロンドン', coat: COAT.darkBay, stats: { speed: 6, stamina: 6, power: 6, intelligence: 9 } }, 'HARD'),
];

/** 既定のプレイヤー操作馬（クロワデュノール）。URL の ?player=番号 で変更できる */
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
