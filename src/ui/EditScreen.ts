import { AI_LEVELS, DEFAULT_EDITS, saveEdits, type GameEdits } from '../data/edits';
import { CONSTRUCTORS, ENTRIES } from '../data/roster';
import { COURSES } from '../course/courses';
import { CONTROL_MODES, loadControlMode, saveControlMode, type ControlMode } from '../data/controls';
import { RUNNING_STYLES, type RunningStyle } from '../data/runningStyles';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

type Tab = 'general' | 'teams' | 'horses' | 'preview';

/**
 * 設定（エディット）画面。タイトルから開く。
 *  - 全般：AI の強さ、蹄鉄の摩耗の倍率
 *  - コンストラクター：名前、ピットクルーの腕
 *  - 出走馬：馬名・騎手名・騎手の戦略値・脚質・能力値（スピード / スタミナ / パワー / 賢さ）
 *  - コース下見：コースを選んで下見モード（コースを自由に眺める）に入る
 * 「保存して反映」でブラウザに保存し、ページを読み込み直して出走表に反映する。
 * 画面に出す値は「今の出走表（起動時に保存済みの設定を反映したもの）」。
 */
export class EditScreen {
  private readonly el = document.getElementById('edit-screen')!;
  private readonly body = document.getElementById('edit-body')!;
  private tab: Tab = 'general';
  private edits: GameEdits = structuredClone(DEFAULT_EDITS);

  /** 保存・初期化の後に呼ばれる（読み込み直しは main 側で） */
  onApply?: () => void;
  /** 操作方法を切り替えた時（すぐに保存して反映する。読み込み直しはしない） */
  onControlMode?: (mode: ControlMode) => void;
  /** コース下見のタブでコースを選んだ時（下見モードへの切り替えは main 側で） */
  onPreview?: (courseId: string) => void;

  constructor() {
    this.el.querySelectorAll<HTMLButtonElement>('[data-edit-tab]').forEach((b) =>
      b.addEventListener('click', () => {
        this.collect();
        this.tab = b.dataset.editTab as Tab;
        this.render();
      }),
    );
    document.getElementById('edit-save')!.addEventListener('click', () => {
      this.collect();
      saveEdits(this.edits);
      this.onApply?.();
    });
    document.getElementById('edit-reset')!.addEventListener('click', () => {
      if (!confirm('すべての設定（名前・能力値・AI の強さ・摩耗）を初期値に戻しますか？')) return;
      saveEdits(null);
      this.onApply?.();
    });
    document.getElementById('edit-close')!.addEventListener('click', () => this.hide());
    this.body.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button[data-preview-course]') as HTMLButtonElement | null;
      if (b) this.onPreview?.(b.dataset.previewCourse!);
    });
    this.body.addEventListener('change', (e) => {
      const r = e.target as HTMLInputElement;
      if (r.name !== 'control-mode') return;
      const mode = r.value as ControlMode;
      saveControlMode(mode);
      this.onControlMode?.(mode);
    });
  }

  show(current: GameEdits) {
    this.edits = structuredClone(current);
    this.tab = 'general';
    this.render();
    this.el.classList.add('show');
  }

  hide() {
    this.el.classList.remove('show');
  }

  private render() {
    this.el.querySelectorAll<HTMLButtonElement>('[data-edit-tab]').forEach((b) => b.classList.toggle('active', b.dataset.editTab === this.tab));
    if (this.tab === 'preview') {
      const cards = COURSES.map(
        (c) => `<button class="preview-course" data-preview-course="${c.id}"><b>${esc(c.shortName)}</b>
          <small>${c.direction === 'right' ? '右回り' : '左回り'}${c.surface === 'dirt' ? '・ダート' : '・芝'}${c.night ? '・ナイター' : ''}</small>
          <span>${esc(c.description)}</span></button>`,
      ).join('');
      this.body.innerHTML = `<div class="preview-courses">${cards}</div>
        <p class="edit-note">コースを選ぶと下見モードに入ります（視点の切替・コースを走るプレビュー。タイトルへ戻るでホームへ）。他のコースは読み込み直してから開きます。編集中の内容は保存されません。</p>`;
    } else if (this.tab === 'general') {
      const levels = AI_LEVELS.map(
        (l) => `<label class="opt"><input type="radio" name="ai-level" value="${l.id}" ${this.edits.aiLevel === l.id ? 'checked' : ''}> ${l.label}<small>（能力 ×${l.factor}）</small></label>`,
      ).join('');
      const current = loadControlMode();
      const controls = CONTROL_MODES.map(
        (m) => `<label class="opt"><input type="radio" name="control-mode" value="${m.id}" ${current === m.id ? 'checked' : ''}> ${m.label}<small>（${m.note}）</small></label>`,
      ).join('');
      this.body.innerHTML = `
        <div class="edit-row"><span class="k">操作方法</span><div class="opts-inline">${controls}</div></div>
        <div class="edit-row"><span class="k">AI の強さ</span><div class="opts-inline">${levels}</div></div>
        <div class="edit-row"><span class="k">蹄鉄の摩耗</span>
          <input type="range" id="edit-wear" min="0.5" max="2" step="0.1" value="${this.edits.shoeWear}">
          <b id="edit-wear-val">×${this.edits.shoeWear.toFixed(1)}</b><small>（周回数による自動調整にさらに掛ける）</small></div>
        <p class="edit-note">操作方法はすぐに切り替わり、ブラウザに保存されます（「保存して反映」は不要）。画面ボタンはシンプルレースで騎乗している間だけ表示され、キーボードもそのまま使えます。<br>AI の強さは、自分の馬以外の馬の最高速度に掛かります（観戦モードでは全頭に同じ倍率）。</p>`;
      const wear = document.getElementById('edit-wear') as HTMLInputElement;
      wear.addEventListener('input', () => (document.getElementById('edit-wear-val')!.textContent = `×${Number(wear.value).toFixed(1)}`));
    } else if (this.tab === 'teams') {
      const rows = CONSTRUCTORS.map((c) => {
        const ed = this.edits.constructors[c.id] ?? {};
        return `<tr data-team="${c.id}">
          <td><span class="sw" style="background:${hex(c.color)}"></span></td>
          <td><input type="text" class="name" maxlength="20" value="${esc(ed.name ?? c.name)}"></td>
          <td><input type="number" class="crew" min="1" max="10" value="${ed.pitCrew ?? c.pitCrew}"></td>
        </tr>`;
      }).join('');
      this.body.innerHTML = `<table class="edit-table"><thead><tr><th></th><th>コンストラクター名</th><th>ピットクルー（1〜10）</th></tr></thead><tbody>${rows}</tbody></table>`;
    } else {
      const styleOpts = (cur: RunningStyle) =>
        (Object.keys(RUNNING_STYLES) as RunningStyle[]).map((k) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${RUNNING_STYLES[k].label}</option>`).join('');
      const rows = ENTRIES.map((e) => {
        const ed = this.edits.entries[e.id] ?? {};
        const st = { ...e.horse.stats, ...(ed.stats ?? {}) };
        const team = CONSTRUCTORS.find((c) => c.id === e.constructorId)!;
        const num = (cls: string, v: number) => `<input type="number" class="${cls}" min="1" max="10" value="${v}">`;
        return `<tr data-entry="${e.id}">
          <td>${e.number}<span class="sw" style="background:${hex(team.color)}"></span></td>
          <td><input type="text" class="horse" maxlength="20" value="${esc(ed.horseName ?? e.horse.name)}"></td>
          <td><input type="text" class="jockey" maxlength="20" value="${esc(ed.jockeyName ?? e.jockey.name)}"></td>
          <td>${num('strategy', ed.strategy ?? e.jockey.strategy)}</td>
          <td><select class="style">${styleOpts(ed.style ?? e.horse.style)}</select></td>
          <td>${num('speed', st.speed)}</td><td>${num('stamina', st.stamina)}</td><td>${num('power', st.power)}</td><td>${num('intelligence', st.intelligence)}</td>
        </tr>`;
      }).join('');
      this.body.innerHTML = `<table class="edit-table horses"><thead><tr><th>番</th><th>馬名</th><th>騎手名</th><th>戦略</th><th>脚質</th>
        <th>スピード</th><th>スタミナ</th><th>パワー</th><th>賢さ</th></tr></thead><tbody>${rows}</tbody></table>
        <p class="edit-note">能力値は 1〜10。13〜16 番は 16 頭立ての時だけ出走します。</p>`;
    }
  }

  /** 今のタブの入力内容を edits に取り込む */
  private collect() {
    if (this.tab === 'preview') return;
    const n = (el: Element | null) => Number((el as HTMLInputElement | null)?.value);
    if (this.tab === 'general') {
      const checked = this.body.querySelector<HTMLInputElement>('input[name="ai-level"]:checked');
      if (checked) this.edits.aiLevel = checked.value as GameEdits['aiLevel'];
      const wear = this.body.querySelector<HTMLInputElement>('#edit-wear');
      if (wear) this.edits.shoeWear = Number(wear.value);
    } else if (this.tab === 'teams') {
      this.body.querySelectorAll<HTMLTableRowElement>('tr[data-team]').forEach((tr) => {
        const id = tr.dataset.team!;
        this.edits.constructors[id] = {
          name: (tr.querySelector('.name') as HTMLInputElement).value,
          pitCrew: n(tr.querySelector('.crew')),
        };
      });
    } else {
      this.body.querySelectorAll<HTMLTableRowElement>('tr[data-entry]').forEach((tr) => {
        const id = tr.dataset.entry!;
        this.edits.entries[id] = {
          horseName: (tr.querySelector('.horse') as HTMLInputElement).value,
          jockeyName: (tr.querySelector('.jockey') as HTMLInputElement).value,
          strategy: n(tr.querySelector('.strategy')),
          style: (tr.querySelector('.style') as HTMLSelectElement).value as RunningStyle,
          stats: {
            speed: n(tr.querySelector('.speed')),
            stamina: n(tr.querySelector('.stamina')),
            power: n(tr.querySelector('.power')),
            intelligence: n(tr.querySelector('.intelligence')),
          },
        };
      });
    }
  }
}
