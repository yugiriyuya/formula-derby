import { HORSESHOES } from '../data/horseshoes';
import { capColorOf, constructorOf } from '../data/roster';
import { bracketColor } from '../data/brackets';
import type { Race } from '../race/Race';
import type { RaceHorse } from '../race/RaceHorse';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

interface Row {
  tr: HTMLTableRowElement;
  pos: HTMLTableCellElement;
  /** 馬番バッジ（枠色） */
  post: HTMLSpanElement;
  swatch: HTMLSpanElement;
  cap: HTMLSpanElement;
  name: HTMLTableCellElement;
  gap: HTMLTableCellElement;
  shoe: HTMLTableCellElement;
  pits: HTMLTableCellElement;
  /** タイムペナルティ（秒） */
  pen: HTMLTableCellElement;
}

/** 表示を更新する間隔（秒）。毎フレーム書き換えると読みにくく重いので間引く */
const REFRESH = 0.1;

/**
 * 左パネルのリアルタイム順位表（Monoposto 風）。
 * 順位 / コンストカラー / 馬名 / トップとの差 / 蹄鉄 S・H・R / ピット回数。ゴールした馬は着順を表示。
 */
export class StandingsPanel {
  private readonly rows: Row[] = [];
  private timer = 0;
  /** 各行に今表示している馬（クリックでどの馬を選んだか分かるように） */
  private shown: RaceHorse[] = [];
  /** 行がクリックされた時（観戦モードで注目する馬を選ぶ） */
  onSelect?: (horse: RaceHorse) => void;

  constructor(tbody: HTMLTableSectionElement, count: number) {
    for (let i = 0; i < count; i++) {
      const tr = document.createElement('tr');
      tr.addEventListener('click', () => {
        const h = this.shown[i];
        if (h) this.onSelect?.(h);
      });
      const td = (cls: string) => {
        const el = document.createElement('td');
        el.className = cls;
        tr.appendChild(el);
        return el;
      };
      const pos = td('pos');
      const postCell = td('post');
      const post = document.createElement('span');
      post.className = 'post-badge';
      postCell.appendChild(post);
      const colorCell = td('color');
      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      const cap = document.createElement('span');
      cap.className = 'cap';
      swatch.appendChild(cap);
      colorCell.appendChild(swatch);
      const name = td('name');
      const gap = td('gap');
      const shoe = td('shoe');
      const pits = td('pits');
      const pen = td('pen');
      tbody.appendChild(tr);
      this.rows.push({ tr, pos, post, swatch, cap, name, gap, shoe, pits, pen });
    }
  }

  /** 次の update ですぐ描き直す（注目する馬を切り替えた直後など） */
  refresh() {
    this.timer = 0;
  }

  update(dt: number, race: Race) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = REFRESH;

    const leader = race.standings[0];
    this.shown = [...race.standings];
    race.standings.forEach((h, i) => {
      const r = this.rows[i];
      if (!r) return;
      const team = constructorOf(h.entry);
      // 強調するのは自分の馬（観戦モードではカメラが追っている馬）
      r.tr.classList.toggle('focus', h === race.focus);
      r.tr.classList.toggle('pitting', h.inPit);
      r.tr.classList.toggle('finished', h.finishPosition !== null);
      r.tr.classList.toggle('retired', h.retired);
      r.pos.textContent = h.retired ? 'OUT' : h.finishPosition !== null ? `${h.finishPosition}着` : String(i + 1);
      const badge = bracketColor(h.postNumber, race.horses.length);
      r.post.textContent = String(h.postNumber);
      r.post.style.background = badge.bg;
      r.post.style.color = badge.fg;
      r.swatch.style.background = hex(team.color);
      r.cap.style.background = hex(capColorOf(h.entry));
      r.swatch.title = team.name;
      r.name.textContent = h.entry.horse.name;
      r.gap.textContent = this.gapText(race, h, leader);
      const shoe = HORSESHOES[h.shoe];
      r.shoe.textContent = h.shoe[0];
      r.shoe.style.color = shoe.color;
      r.shoe.title = `${shoe.label} 摩耗 ${Math.round(h.shoeWear * 100)}%`;
      r.pits.textContent = h.inPit ? 'PIT' : String(h.pitCount);
      // タイムペナルティの秒数。STOP & GO 未消化なら SG
      r.pen.textContent = (h.penaltySeconds > 0 ? `+${h.penaltySeconds}` : '') + (h.stopGoPending ? ' SG' : '');
    });
  }

  private gapText(race: Race, h: RaceHorse, leader: RaceHorse): string {
    if (race.phase === 'countdown') return '';
    if (h.retired) return 'PIT RETURN';
    // スタート直後の数秒は発馬の結果を出す
    if (race.time < 4 && h.startResult === 'rocket') return '好発';
    if (race.time < 4 && h.startResult === 'late') return '出遅れ';
    if (h === leader) return h.finishTime !== null ? formatRaceTime(race.correctedTime(h)!) : 'トップ';
    const gap = race.gapTo(h, leader);
    if (!gap) return '';
    if (gap.laps > 0) return `+${gap.laps} LAP`;
    return `+${gap.seconds.toFixed(3)}`;
  }
}

function formatRaceTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}
