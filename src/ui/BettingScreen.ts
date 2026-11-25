import { signedYen, yen, type Bankroll, type Bet } from '../betting/bank';
import type { OddsMatrix } from '../betting/odds';
import { bracketColor } from '../data/brackets';
import { constructorOf } from '../data/roster';
import type { RaceHorse } from '../race/RaceHorse';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const pickLabel = (pick: number | 'DNF', n: number) => (pick === 'DNF' ? 'DNF' : pick === n ? `${pick}着（最下位）` : `${pick}着`);

/** 金額ボタン（円） */
const STAKES = [10_000, 50_000, 100_000];

/**
 * レース前のベッティング（投票）画面。ブックメーカー式の「全頭 × 着順（1 着〜最下位）＋ DNF」のオッズ表。
 *  - セルをクリック → 金額を選んで「買い目に追加」（複数点買い。同じセルは金額を足す）
 *  - 自分が操作する馬の DNF は買えない（八百長防止）
 *  - 「ベット確定してレース開始」で合計を所持金から引いてスタート。「スキップして出走」は賭けずにスタート
 */
export class BettingScreen {
  private readonly el = document.getElementById('bet-screen')!;
  private readonly matrixEl = document.getElementById('bet-matrix')!;
  private readonly slipEl = document.getElementById('bet-slip')!;
  private readonly selEl = document.getElementById('bet-selection')!;
  private readonly confirmBtn = document.getElementById('bet-confirm') as HTMLButtonElement;
  private matrix: OddsMatrix | null = null;
  private player: RaceHorse | null = null;
  private bets: Bet[] = [];
  private selected: { row: number; col: number } | null = null;
  private stake = STAKES[0];

  onConfirm?: (bets: Bet[]) => void;
  onSkip?: () => void;

  constructor(private readonly bank: Bankroll) {
    this.confirmBtn.addEventListener('click', () => {
      const total = this.total();
      if (total <= 0 || total > this.bank.balance) return;
      this.hide();
      this.onConfirm?.(this.bets.map((b) => ({ ...b })));
    });
    document.getElementById('bet-skip')!.addEventListener('click', () => {
      this.hide();
      this.onSkip?.();
    });
    document.getElementById('bet-refinance')!.addEventListener('click', () => {
      if (!confirm('所持金を ¥1,000,000 にリセット（再融資）しますか？')) return;
      this.bank.reset();
      this.renderSlip();
    });
    this.matrixEl.addEventListener('click', (e) => {
      const td = (e.target as HTMLElement).closest('td[data-row]') as HTMLElement | null;
      if (!td || td.classList.contains('locked')) return;
      this.selected = { row: Number(td.dataset.row), col: Number(td.dataset.col) };
      this.matrixEl.querySelectorAll('td.sel').forEach((c) => c.classList.remove('sel'));
      td.classList.add('sel');
      this.renderSelection();
    });
    this.selEl.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!b) return;
      if (b.dataset.stake) {
        this.stake = Number(b.dataset.stake);
        this.renderSelection();
      } else if (b.id === 'bet-add') this.addSelected();
    });
    this.slipEl.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button[data-remove]') as HTMLButtonElement | null;
      if (!b) return;
      this.bets.splice(Number(b.dataset.remove), 1);
      this.renderSlip();
    });
  }

  get visible(): boolean {
    return this.el.classList.contains('show');
  }

  hide() {
    this.el.classList.remove('show');
    document.body.classList.remove('betting');
  }

  /** @param player シンプルレースで自分が操作する馬（その馬の DNF は買えない）。観戦モードは null */
  show(matrix: OddsMatrix, player: RaceHorse | null, title: string) {
    this.matrix = matrix;
    this.player = player;
    this.bets = [];
    this.selected = null;
    document.getElementById('bet-title')!.textContent = title;
    this.renderMatrix();
    this.renderSelection();
    this.renderSlip();
    this.el.classList.add('show');
    document.body.classList.add('betting');
  }

  private total(): number {
    return this.bets.reduce((a, b) => a + b.stake, 0);
  }

  private renderMatrix() {
    const m = this.matrix!;
    const n = m.n;
    const head = Array.from({ length: n }, (_, k) => `<th>${k + 1 === n ? `${n}着<br><small>最下位</small>` : `${k + 1}着`}</th>`).join('');
    const rows = m.horses
      .map((h, i) => {
        const team = constructorOf(h.entry);
        const badge = bracketColor(h.postNumber, n);
        const you = h === this.player ? '<span class="you">YOU</span>' : '';
        const cells = m.odds[i]
          .map((o, k) => {
            const locked = k === n && h === this.player;
            const heat = o < 3 ? 'h3' : o < 6 ? 'h2' : o < 12 ? 'h1' : '';
            return `<td data-row="${i}" data-col="${k}" class="${heat}${locked ? ' locked' : ''}${k === n ? ' dnf' : ''}" title="${locked ? '自分の馬の DNF は買えません' : ''}">${locked ? '—' : o.toFixed(1)}</td>`;
          })
          .join('');
        return `<tr><th class="hz"><span class="post-badge" style="background:${badge.bg};color:${badge.fg}">${h.postNumber}</span>
          <span class="sw" style="background:${hex(team.color)}"></span><b>${esc(h.entry.horse.name)}</b>${you}
          <small>${esc(team.name)}・${h.style.label}</small></th>${cells}</tr>`;
      })
      .join('');
    this.matrixEl.innerHTML = `<table><thead><tr><th class="hz">馬（枠・馬番・コンスト・脚質）</th>${head}<th class="dnf">DNF</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  private renderSelection() {
    const m = this.matrix!;
    const stakeBtns = STAKES.map((s) => `<button data-stake="${s}" class="${s === this.stake ? 'active' : ''}">${s / 10000}万円</button>`).join('');
    if (!this.selected) {
      this.selEl.innerHTML = `<div class="hint">オッズ表のセル（馬 × 着順）をクリックして選んでください</div>`;
      return;
    }
    const h = m.horses[this.selected.row];
    const pick = this.selected.col === m.n ? 'DNF' : this.selected.col + 1;
    const odds = m.odds[this.selected.row][this.selected.col];
    this.selEl.innerHTML = `
      <div class="cur"><b>${h.postNumber}番 ${esc(h.entry.horse.name)}</b> が <b>${pickLabel(pick, m.n)}</b> ＠ <b class="o">${odds.toFixed(1)}</b> 倍</div>
      <div class="stakes">${stakeBtns}<input id="bet-custom" type="number" min="100" step="100" placeholder="任意の金額" value="${STAKES.includes(this.stake) ? '' : this.stake}"><span>円</span></div>
      <div class="add-row"><span>払戻予定 ${yen(Math.floor(this.stake * odds))}</span><button id="bet-add">買い目に追加</button></div>`;
    const custom = this.selEl.querySelector('#bet-custom') as HTMLInputElement;
    custom.addEventListener('input', () => {
      const v = Math.floor(Number(custom.value));
      if (v > 0) {
        this.stake = v;
        this.selEl.querySelectorAll('[data-stake]').forEach((b) => b.classList.remove('active'));
        (this.selEl.querySelector('.add-row span') as HTMLElement).textContent = `払戻予定 ${yen(Math.floor(this.stake * odds))}`;
      }
    });
  }

  private addSelected() {
    const m = this.matrix;
    if (!m || !this.selected || this.stake <= 0) return;
    const h = m.horses[this.selected.row];
    const pick: number | 'DNF' = this.selected.col === m.n ? 'DNF' : this.selected.col + 1;
    if (pick === 'DNF' && h === this.player) return;
    const odds = m.odds[this.selected.row][this.selected.col];
    const same = this.bets.find((b) => b.entryId === h.entry.id && b.pick === pick);
    if (same) same.stake += this.stake;
    else this.bets.push({ entryId: h.entry.id, horseName: h.entry.horse.name, postNumber: h.postNumber, pick, odds, stake: this.stake });
    this.renderSlip();
  }

  private renderSlip() {
    const n = this.matrix?.n ?? 0;
    const total = this.total();
    const bal = this.bank.balance;
    document.querySelectorAll('.bank-balance').forEach((e) => (e.textContent = yen(bal)));
    const rows = this.bets
      .map(
        (b, i) => `<tr><td>${b.postNumber}番 ${esc(b.horseName)}</td><td>${pickLabel(b.pick, n)}</td><td>${b.odds.toFixed(1)}</td>
          <td>${yen(b.stake)}</td><td><button data-remove="${i}" title="削除">×</button></td></tr>`,
      )
      .join('');
    const over = total > bal;
    this.slipEl.innerHTML = `
      <div class="slip-head">買い目リスト（${this.bets.length}点）</div>
      ${this.bets.length ? `<table><thead><tr><th>馬</th><th>予想</th><th>オッズ</th><th>賭け金</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="hint">まだ買い目がありません</div>'}
      <div class="slip-total">合計 <b>${yen(total)}</b> ・ 残り <b class="${over ? 'neg' : ''}">${signedYen(bal - total).replace('+', '')}</b></div>
      ${over ? '<div class="neg">所持金が足りません</div>' : ''}
      <div class="hint">レースを途中でやめると賭け金は戻りません</div>`;
    this.confirmBtn.disabled = total <= 0 || over;
  }
}
