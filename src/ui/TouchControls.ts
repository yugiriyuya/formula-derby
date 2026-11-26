import type { KeyboardInput } from '../race/KeyboardInput';

/**
 * シンプルレース用の画面ボタン（タッチ操作）。押したボタンはキーボードのキーと同じ扱いで KeyboardInput に渡すので、
 * レースの処理はキーボード操作と共通。
 *  - 左下：左へ寄る / 右へ寄る（押している間）
 *  - 右下：ムチ・ペース UP（加速）・ペース DOWN（折り合い）・ピットイン要求・視点
 * 指がボタンの外へずれたり、画面が回転・アプリが裏に回ったりしたら、押しっぱなしにならないよう離した扱いにする。
 */
export class TouchControls {
  private readonly el = document.getElementById('touch-controls')!;
  /** pointerId → 押しているキー */
  private readonly active = new Map<number, { code: string; button: HTMLElement }>();

  constructor(private readonly input: KeyboardInput) {
    this.el.querySelectorAll<HTMLElement>('[data-touch]').forEach((b) => {
      const code = b.dataset.touch!;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        b.setPointerCapture?.(e.pointerId);
        this.active.set(e.pointerId, { code, button: b });
        b.classList.add('down');
        this.input.virtualDown(code);
      });
      const up = (e: PointerEvent) => this.release(e.pointerId);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('lostpointercapture', up);
      // 長押しでメニュー（コピー・拡大鏡など）が出ないように
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    });
    const releaseAll = () => [...this.active.keys()].forEach((id) => this.release(id));
    window.addEventListener('blur', releaseAll);
    window.addEventListener('orientationchange', releaseAll);
    document.addEventListener('visibilitychange', releaseAll);
  }

  private release(pointerId: number) {
    const a = this.active.get(pointerId);
    if (!a) return;
    this.active.delete(pointerId);
    // 同じキーを別の指でまだ押していれば離さない
    if (![...this.active.values()].some((x) => x.code === a.code)) this.input.virtualUp(a.code);
    if (![...this.active.values()].some((x) => x.button === a.button)) a.button.classList.remove('down');
  }

  /** 画面ボタンを出すか（body に touch-ui を付けると、シンプルレースの騎乗中だけ表示される） */
  setEnabled(on: boolean) {
    document.body.classList.toggle('touch-ui', on);
    if (!on) [...this.active.keys()].forEach((id) => this.release(id));
  }
}
