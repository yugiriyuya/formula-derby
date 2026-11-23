import type { HorseControls } from './RaceHorse';

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

  /** Monoposto 風の操作割り当て */
  horseControls(pressed: Set<string>): HorseControls {
    const left = this.isDown('KeyA', 'ArrowLeft');
    const right = this.isDown('KeyD', 'ArrowRight');
    return {
      accelerate: this.isDown('KeyW', 'ArrowUp'),
      brake: this.isDown('KeyS', 'ArrowDown'),
      steer: (right ? 1 : 0) - (left ? 1 : 0),
      whip: pressed.has('Space'),
    };
  }
}
