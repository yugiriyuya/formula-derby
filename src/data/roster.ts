/**
 * 出走表データ（コンストラクター・騎手・馬）。
 * 名前と能力値（1〜10）はすべて架空。後でエディット機能・キャリアモード・賭けモードから
 * 差し替えられるよう、ゲームロジックから分離している。
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

export const CONSTRUCTORS: ConstructorData[] = [
  { id: 'scarlet', name: 'スカーレット厩舎', color: 0xd83a3a, capColor: 0xffffff },
  { id: 'azure', name: 'アズール・レーシング', color: 0x2f6fd8, capColor: 0xffd23a },
  { id: 'golden', name: 'ゴールデンメイン', color: 0xf2c230, capColor: 0x222222 },
  { id: 'verde', name: 'ヴェルデ・ターフ', color: 0x2fae5a, capColor: 0xffffff },
  { id: 'violet', name: 'ヴァイオレット・スパー', color: 0x8a3fd1, capColor: 0xf2c230 },
  { id: 'orange', name: 'オレンジギャロップ', color: 0xf07c24, capColor: 0x1f3a8a },
];

const COAT = { bay: 0x7a4a2a, darkBay: 0x4a2c1a, chestnut: 0xa65a28, black: 0x2a2420 };

const entry = (
  number: number,
  constructorId: string,
  jockey: JockeyData,
  horse: HorseData,
  startShoe: HorseshoeType = 'SOFT',
): EntryData => ({ id: `e${number}`, number, constructorId, jockey, horse, startShoe });

export const ENTRIES: EntryData[] = [
  entry(1, 'scarlet', { name: '赤城 颯', strategy: 7 }, { name: 'ブロックランナー', coat: COAT.bay, stats: { speed: 7, stamina: 7, power: 6, intelligence: 7 } }),
  entry(2, 'scarlet', { name: '朱野 透', strategy: 5 }, { name: 'ヨドノカゼ', coat: COAT.chestnut, stats: { speed: 6, stamina: 8, power: 7, intelligence: 5 } }, 'HARD'),
  entry(3, 'azure', { name: '青葉 湊', strategy: 8 }, { name: 'アズールボルト', coat: COAT.darkBay, stats: { speed: 8, stamina: 6, power: 6, intelligence: 6 } }),
  entry(4, 'azure', { name: '藍沢 律', strategy: 6 }, { name: 'ミッドナイトキュー', coat: COAT.black, stats: { speed: 6, stamina: 7, power: 7, intelligence: 7 } }, 'HARD'),
  entry(5, 'golden', { name: '金森 陽', strategy: 6 }, { name: 'ゴールドピクセル', coat: COAT.chestnut, stats: { speed: 7, stamina: 6, power: 8, intelligence: 5 } }),
  entry(6, 'golden', { name: '黄瀬 匠', strategy: 7 }, { name: 'サンセットスロープ', coat: COAT.bay, stats: { speed: 6, stamina: 7, power: 6, intelligence: 8 } }, 'HARD'),
  entry(7, 'verde', { name: '緑川 蓮', strategy: 9 }, { name: 'ターフキング', coat: COAT.darkBay, stats: { speed: 7, stamina: 8, power: 5, intelligence: 6 } }),
  entry(8, 'verde', { name: '若葉 新', strategy: 5 }, { name: 'グリーンゲート', coat: COAT.bay, stats: { speed: 5, stamina: 8, power: 7, intelligence: 7 } }, 'HARD'),
  entry(9, 'violet', { name: '紫藤 慧', strategy: 7 }, { name: 'バイオレットリップ', coat: COAT.black, stats: { speed: 8, stamina: 5, power: 7, intelligence: 6 } }),
  entry(10, 'violet', { name: '藤宮 環', strategy: 6 }, { name: 'ナイトパレード', coat: COAT.chestnut, stats: { speed: 6, stamina: 6, power: 8, intelligence: 7 } }, 'HARD'),
  entry(11, 'orange', { name: '橙山 駿', strategy: 6 }, { name: 'オレンジクォーツ', coat: COAT.bay, stats: { speed: 7, stamina: 7, power: 7, intelligence: 4 } }),
  entry(12, 'orange', { name: '柿本 渉', strategy: 8 }, { name: 'ブリッツダッシュ', coat: COAT.darkBay, stats: { speed: 6, stamina: 6, power: 6, intelligence: 9 } }, 'HARD'),
];

export const PLAYER_ENTRY_ID = 'e1';

export const constructorOf = (e: EntryData): ConstructorData =>
  CONSTRUCTORS.find((c) => c.id === e.constructorId)!;
