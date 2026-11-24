import { CONSTRUCTORS, ENTRIES, type HorseStats } from './roster';
import type { RunningStyle } from './runningStyles';

/**
 * 設定（エディット）。ブラウザに保存し、起動時に出走表（CONSTRUCTORS / ENTRIES）へ上書きする。
 * 変更はページを読み込み直した時に反映する（レースの途中で能力が変わらないように）。
 *
 * 将来の拡張（キャリアモード・賭けモードなど）もこの形に項目を足していく。
 */
export type AiLevel = 'easy' | 'normal' | 'hard' | 'expert';

export interface EntryEdit {
  horseName?: string;
  jockeyName?: string;
  /** 騎手の戦略値（1〜10） */
  strategy?: number;
  stats?: Partial<HorseStats>;
  style?: RunningStyle;
}

export interface ConstructorEdit {
  name?: string;
  /** ピットクルーの腕（1〜10） */
  pitCrew?: number;
}

export interface GameEdits {
  version: 1;
  /** AI の強さ（AI が走らせる馬の最高速度の倍率） */
  aiLevel: AiLevel;
  /** 蹄鉄の摩耗の速さの倍率（0.5〜2） */
  shoeWear: number;
  constructors: Record<string, ConstructorEdit>;
  entries: Record<string, EntryEdit>;
}

export const AI_LEVELS: { id: AiLevel; label: string; factor: number }[] = [
  { id: 'easy', label: 'やさしい', factor: 0.97 },
  { id: 'normal', label: 'ふつう', factor: 1.0 },
  { id: 'hard', label: 'つよい', factor: 1.015 },
  { id: 'expert', label: 'エキスパート', factor: 1.03 },
];

const KEY = 'formula-derby-edits';
export const DEFAULT_EDITS: GameEdits = { version: 1, aiLevel: 'normal', shoeWear: 1, constructors: {}, entries: {} };

export function loadEdits(): GameEdits {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_EDITS);
    const v = JSON.parse(raw) as Partial<GameEdits>;
    return {
      version: 1,
      aiLevel: AI_LEVELS.some((l) => l.id === v.aiLevel) ? v.aiLevel! : 'normal',
      shoeWear: typeof v.shoeWear === 'number' ? clamp(v.shoeWear, 0.5, 2) : 1,
      constructors: v.constructors ?? {},
      entries: v.entries ?? {},
    };
  } catch {
    return structuredClone(DEFAULT_EDITS);
  }
}

export function saveEdits(e: GameEdits | null) {
  try {
    if (e) localStorage.setItem(KEY, JSON.stringify(e));
    else localStorage.removeItem(KEY);
  } catch {
    // 保存できなくても動作には影響しない
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const stat = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(clamp(v, 1, 10)) : fallback);
const text = (v: unknown, fallback: string) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 20) : fallback);

/** 起動時に出走表へ反映する（名前・能力値・脚質・ピットクルー） */
export function applyEdits(e: GameEdits) {
  for (const c of CONSTRUCTORS) {
    const ed = e.constructors[c.id];
    if (!ed) continue;
    c.name = text(ed.name, c.name);
    c.pitCrew = stat(ed.pitCrew, c.pitCrew);
  }
  for (const en of ENTRIES) {
    const ed = e.entries[en.id];
    if (!ed) continue;
    en.horse.name = text(ed.horseName, en.horse.name);
    en.jockey.name = text(ed.jockeyName, en.jockey.name);
    en.jockey.strategy = stat(ed.strategy, en.jockey.strategy);
    if (ed.style) en.horse.style = ed.style;
    if (ed.stats) {
      const s = en.horse.stats;
      s.speed = stat(ed.stats.speed, s.speed);
      s.stamina = stat(ed.stats.stamina, s.stamina);
      s.power = stat(ed.stats.power, s.power);
      s.intelligence = stat(ed.stats.intelligence, s.intelligence);
    }
  }
}

export function aiFactor(e: GameEdits): number {
  return AI_LEVELS.find((l) => l.id === e.aiLevel)?.factor ?? 1;
}
