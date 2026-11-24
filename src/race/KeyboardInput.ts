/** ページのスクロールやボタンの誤クリックを防ぐため、既定動作を止めるキー */
const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'KeyP', 'KeyC', 'KeyT', 'KeyR',
]);

/**
 * キーボードの状態を保持する。
 *  - 押しっぱなし（加速・減速・進路）は isDown で
 *  - 1 回押し（ムチ・ピット要求など）は consumePressed で、キーリピートを除いて取り出す
 */
export class KeyboardInput {
  private readonly held = new Set<string>();
  private pressed = new Set<string>();

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      this.held.add(e.code);
      if (!e.repeat) this.pressed.add(e.code);
    });
    target.addEventListener('keyup', (e) => this.held.delete(e.code));
    // ウィンドウ外に出たらキーを離した扱いにする（押しっぱなしで暴走しないように）
    target.addEventListener('blur', () => this.held.clear());
  }

  isDown(...codes: string[]): boolean {
    return codes.some((c) => this.held.has(c));
  }

  /** 前回の呼び出し以降に押されたキーを取り出す */
  consumePressed(): Set<string> {
    const p = this.pressed;
    this.pressed = new Set();
    return p;
  }

  /**
   * 進路取り（押している間）：-1 = 画面の左, +1 = 画面の右。
   * コースの lateral（内側が +）に直す時は track.side を掛ける（左回りでは左が内側）
   */
  steer(): number {
    const left = this.isDown('KeyA', 'ArrowLeft');
    const right = this.isDown('KeyD', 'ArrowRight');
    return (right ? 1 : 0) - (left ? 1 : 0);
  }

  /** ペース変更（1 回押し）：W/↑ で +1、S/↓ で -1、なければ 0 */
  paceShift(pressed: Set<string>): 1 | -1 | 0 {
    if (pressed.has('KeyW') || pressed.has('ArrowUp')) return 1;
    if (pressed.has('KeyS') || pressed.has('ArrowDown')) return -1;
    return 0;
  }
}
