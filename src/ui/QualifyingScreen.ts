import type { CourseDefinition } from '../course/types';
import { bracketColor } from '../data/brackets';
import { CONSTRUCTORS } from '../data/roster';
import type { QualifyingResult } from '../race/Qualifying';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

function fmtTime(sec: number | null): string {
  if (sec === null) return '—';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/**
 * 予選結果の画面。
 *  - 左：ベストタイム順（= 決勝の枠順）
 *  - 右：コンストラクターの最速タイム順と、割り当てられたピット（1 番ピット = ピット出口に最も近い）
 */
export class QualifyingScreen {
  private readonly el = document.getElementById('qualifying-screen')!;
  private readonly table = document.getElementById('q-table')!;
  private readonly teams = document.getElementById('q-teams')!;

  onStart?: () => void;
  onRedo?: () => void;
  onTitle?: () => void;

  constructor() {
    document.getElementById('q-start')!.addEventListener('click', () => this.onStart?.());
    document.getElementById('q-redo')!.addEventListener('click', () => this.onRedo?.());
    document.getElementById('q-title')!.addEventListener('click', () => this.onTitle?.());
  }

  get visible(): boolean {
    return this.el.classList.contains('show');
  }

  hide() {
    this.el.classList.remove('show');
    document.body.classList.remove('q-shown');
  }

  show(result: QualifyingResult, course: CourseDefinition, playerEntryId: string | null) {
    document.getElementById('q-course')!.textContent = course.shortName;
    const n = result.rows.length;
    const pole = result.rows[0]?.time ?? null;
    const pitOf = new Map(result.teams.map((t) => [t.constructorId, t.pitNumber]));
    const rows = result.rows.map((r, i) => {
      const team = CONSTRUCTORS.find((c) => c.id === r.entry.constructorId)!;
      const post = i + 1;
      const badge = bracketColor(post, n);
      const gap = r.time === null || pole === null ? '—' : i === 0 ? 'POLE' : `+${(r.time - pole).toFixed(3)}`;
      const cls = [i === 0 ? 'pole' : '', r.entry.id === playerEntryId ? 'player' : ''].join(' ');
      return `<tr class="${cls}">
        <td><b>${i + 1}</b></td>
        <td><span class="post-badge" style="background:${badge.bg};color:${badge.fg}">${post}</span></td>
        <td class="l"><b>${esc(r.entry.horse.name)}</b> <small>${esc(r.entry.jockey.name)}</small></td>
        <td class="l"><span class="team" style="display:inline-block;width:8px;height:12px;margin-right:4px;background:${hex(team.color)}"></span>${esc(team.name)}</td>
        <td>${fmtTime(r.time)}</td>
        <td>${gap}</td>
        <td>PIT ${pitOf.get(r.entry.constructorId) ?? '-'}</td>
      </tr>`;
    });
    this.table.innerHTML = `<table><thead><tr><th>順</th><th>枠</th><th class="l">馬名 / 騎手</th><th class="l">コンストラクター</th><th>タイム</th><th>差</th><th>ピット</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;

    const teamRows = result.teams.map((t) => {
      const team = CONSTRUCTORS.find((c) => c.id === t.constructorId)!;
      const note = t.pitNumber === 1 ? '<br><span class="exit">ピット出口に最も近い</span>' : '';
      return `<tr>
        <td><span class="pit-no">${t.pitNumber}</span></td>
        <td class="l"><span class="team" style="display:inline-block;width:8px;height:12px;margin-right:4px;background:${hex(team.color)}"></span>${esc(team.name)}${note}</td>
        <td>${fmtTime(t.best)}</td>
      </tr>`;
    });
    this.teams.innerHTML = `<table><thead><tr><th>ピット</th><th class="l">コンストラクター</th><th>チーム最速</th></tr></thead><tbody>${teamRows.join('')}</tbody></table>`;
    this.el.classList.add('show');
    document.body.classList.add('q-shown');
  }
}
