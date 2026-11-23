import { HORSESHOES } from '../data/horseshoes';
import { capColorOf, constructorOf } from '../data/roster';
import type { Race } from '../race/Race';
import type { RaceHorse } from '../race/RaceHorse';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

interface Row {
  tr: HTMLTableRowElement;
  pos: HTMLTableCellElement;
  swatch: HTMLSpanElement;
  cap: HTMLSpanElement;
  name: HTMLTableCellElement;
  gap: HTMLTableCellElement;
  shoe: HTMLTableCellElement;
  pits: HTMLTableCellElement;
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

  constructor(tbody: HTMLTableSectionElement, count: number) {
    for (let i = 0; i < count; i++) {
      const tr = document.createElement('tr');
      const td = (cls: string) => {
        const el = document.createElement('td');
        el.className = cls;
        tr.appendChild(el);
        return el;
      };
      const pos = td('pos');
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
      tbody.appendChild(tr);
      this.rows.push({ tr, pos, swatch, cap, name, gap, shoe, pits });
    }
  }

  update(dt: number, race: Race) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = REFRESH;

    const leader = race.standings[0];
    race.standings.forEach((h, i) => {
      const r = this.rows[i];
      if (!r) return;
      const team = constructorOf(h.entry);
      r.tr.classList.toggle('player', h === race.player);
      r.tr.classList.toggle('pitting', h.inPit);
      r.tr.classList.toggle('finished', h.finishPosition !== null);
      r.pos.textContent = h.finishPosition !== null ? `${h.finishPosition}着` : String(i + 1);
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
    });
  }

  private gapText(race: Race, h: RaceHorse, leader: RaceHorse): string {
    if (h === leader) {
      if (h.finishTime !== null) return formatRaceTime(h.finishTime);
      return race.phase === 'countdown' ? `${race.postOf(h)}枠` : 'トップ';
    }
    if (race.phase === 'countdown') return `${race.postOf(h)}枠`;
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
