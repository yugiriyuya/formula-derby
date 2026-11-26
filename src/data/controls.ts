/**
 * 操作方法（シンプルレースの騎乗操作）。ブラウザに保存する（設定の「初期値に戻す」とは別に覚えておく）。
 *  - keyboard：キーボードだけ（画面ボタンは出さない）
 *  - touch：画面ボタン（タッチ操作）を出す
 *  - auto：タッチ操作の端末（スマホ・タブレット）なら画面ボタンを出す
 */
export type ControlMode = 'auto' | 'keyboard' | 'touch';

export const CONTROL_MODES: { id: ControlMode; label: string; note: string }[] = [
  { id: 'auto', label: '自動', note: 'スマホ・タブレットなら画面ボタン' },
  { id: 'keyboard', label: 'キーボード', note: '画面ボタンを出さない' },
  { id: 'touch', label: '画面ボタン（タッチ操作）', note: 'PC でもボタンを出す' },
];

const KEY = 'formula-derby-controls';

export function loadControlMode(): ControlMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'keyboard' || v === 'touch' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function saveControlMode(mode: ControlMode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // 保存できなくても、このページの中では切り替わる
  }
}

/** この端末がタッチ操作中心か（指で操作する画面） */
export function isTouchDevice(): boolean {
  // タッチ画面付きのノート PC（マウスも使う）は含めない：主な入力が指の端末だけ
  return typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
}

/** 画面ボタンを出すか */
export function touchControlsEnabled(mode: ControlMode): boolean {
  return mode === 'touch' || (mode === 'auto' && isTouchDevice());
}
