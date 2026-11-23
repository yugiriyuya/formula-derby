/**
 * 枠番（1〜8 枠）と枠色。馬番（ゲート番号 1〜頭数）から決める。
 * 9 頭以上の時は外の枠から 2 頭ずつ入る（例：12 頭なら 1〜4 枠が 1 頭、5〜8 枠が 2 頭ずつ）。
 */
export const BRACKET_COLORS: { bg: string; fg: string }[] = [
  { bg: '#f4f4f4', fg: '#111' }, // 1 枠 白
  { bg: '#1a1a1a', fg: '#fff' }, // 2 枠 黒
  { bg: '#d83a3a', fg: '#fff' }, // 3 枠 赤
  { bg: '#2f6fd8', fg: '#fff' }, // 4 枠 青
  { bg: '#f2d230', fg: '#111' }, // 5 枠 黄
  { bg: '#2fae5a', fg: '#fff' }, // 6 枠 緑
  { bg: '#f07c24', fg: '#fff' }, // 7 枠 橙
  { bg: '#f28cb8', fg: '#111' }, // 8 枠 桃
];

/** 馬番 post（1〜）の枠番（1〜8） */
export function bracketOf(post: number, fieldSize: number): number {
  if (fieldSize <= 8) return post;
  const base = Math.floor(fieldSize / 8);
  const extra = fieldSize % 8; // 外側の extra 枠は base + 1 頭
  let horse = 0;
  for (let b = 1; b <= 8; b++) {
    horse += b > 8 - extra ? base + 1 : base;
    if (post <= horse) return b;
  }
  return 8;
}

export function bracketColor(post: number, fieldSize: number) {
  return BRACKET_COLORS[bracketOf(post, fieldSize) - 1];
}
