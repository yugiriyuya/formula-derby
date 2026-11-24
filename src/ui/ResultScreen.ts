import { bracketColor, bracketOf } from '../data/brackets';
import { CONSTRUCTORS } from '../data/roster';
import type { Race, RaceResultRow } from '../race/Race';
import { marginText } from './Commentary';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

function fmtTime(sec: number | null): string {
  if (sec === null) return '—';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/**
 * レース後の詳細リザルト。
 *  - 左：確定掲示板（上位 5 頭の着順・馬番・着差）
 *  - 右：F1 リザルト風の全馬の成績一覧
 *  - 下：ゴール前リプレイ／同じ条件で再レース／タイトルへ
 */
export class ResultScreen {
  private readonly el = document.getElementById('result-screen')!;
  private readonly board = document.getElementById('result-board')!;
  private readonly table = document.getElementById('result-table')!;
  private readonly replayBtn = document.getElementById('result-replay') as HTMLButtonElement;

  onReplay?: () => void;
  onRetry?: () => void;
  onTitle?: () => void;
  onSeries?: () => void;

  private readonly retryBtn = document.getElementById('result-retry') as HTMLButtonElement;
  private readonly seriesBtn = document.getElementById('result-series') as HTMLButtonElement;
  private readonly titleBtn = document.getElementById('result-title') as HTMLButtonElement;

  /** シリーズ戦中は「同じ条件で再レース」を出さず、「シリーズ順位へ」を出す */
  setSeries(on: boolean) {
    this.retryBtn.style.display = on ? 'none' : '';
    this.seriesBtn.style.display = on ? '' : 'none';
    this.titleBtn.textContent = on ? 'タイトルへ（シリーズは保存）' : 'タイトルへ戻る';
  }

  constructor() {
    this.seriesBtn.addEventListener('click', () => this.onSeries?.());
    this.setSeries(false);
    this.replayBtn.addEventListener('click', () => this.onReplay?.());
    document.getElementById('result-retry')!.addEventListener('click', () => this.onRetry?.());
    document.getElementById('result-title')!.addEventListener('click', () => this.onTitle?.());
  }

  get visible(): boolean {
    return this.el.classList.contains('show');
  }

  hide() {
    this.el.classList.remove('show');
  }

  show(race: Race) {
    const rows = race.results();
    const n = race.horses.length;
    const finished = rows.filter((r) => r.status === 'FINISHED');
    const topTime = finished[0]?.time ?? null;

    // --- 確定掲示板（上位 5 頭）---
    const boardRows = finished.slice(0, 5).map((r, i) => {
      const prev = finished[i - 1];
      const margin = prev && r.time !== null && prev.time !== null ? marginText(r.time - prev.time) : '';
      return `<div class="b-row"><span class="b-pos">${r.position}</span><span class="b-num">${r.postNumber}</span><span class="b-margin">${margin}</span></div>`;
    });
    this.board.innerHTML = `
      <div class="b-head"><span class="b-lamp">確定</span><span class="b-title">${esc(race.track.def.shortName)} ${race.laps}周 ${race.weather === 'rain' ? '重' : '良'}</span></div>
      ${boardRows.join('')}
      <div class="b-foot">タイム ${fmtTime(topTime)}</div>`;

    // --- 成績一覧 ---
    const head = `<tr>
      <th>着</th><th>枠</th><th>番</th><th class="l">馬名 / 騎手</th><th class="l">コンストラクター</th>
      <th>タイム</th><th>着差</th><th>オッズ</th><th>ファステストラップ</th><th>追抜</th><th>ペナ</th><th>ピット</th></tr>`;
    const body = rows.map((r) => this.row(r, n, topTime)).join('');
    this.table.innerHTML = `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;

    this.replayBtn.disabled = !race.replay.available;
    this.replayBtn.title = race.replay.available ? '' : 'ゴール前の記録がありません';
    this.el.classList.add('show');
  }

  private row(r: RaceResultRow, fieldSize: number, topTime: number | null): string {
    const team = CONSTRUCTORS.find((c) => c.id === r.constructorId)!;
    const bracket = bracketColor(r.postNumber, fieldSize);
    const pos = r.status === 'DNF' ? '<span class="dnf">DNF</span>' : r.status === 'RUNNING' ? `(${r.position})` : String(r.position);
    const gap =
      r.status === 'DNF'
        ? 'DNF<br><small>落馬・PIT RETURN</small>'
        : r.time === null || topTime === null
          ? '—'
          : r.time === topTime
            ? '—'
            : `+${(r.time - topTime).toFixed(2)}`;
    const fl = r.fastestLap === null ? '—' : `${fmtTime(r.fastestLap)} <small>(${r.fastestLapNumber}周)</small>`;
    const cls = [r.position === 1 && r.status === 'FINISHED' ? 'winner' : '', r.status === 'DNF' ? 'retired' : ''].join(' ');
    return `<tr class="${cls}">
      <td class="pos">${pos}</td>
      <td><span class="bk" style="background:${bracket.bg};color:${bracket.fg}">${bracketOf(r.postNumber, fieldSize)}</span></td>
      <td class="num">${r.postNumber}</td>
      <td class="l"><b>${esc(r.horseName)}</b><br><small>${esc(r.jockeyName)}</small></td>
      <td class="l"><span class="team" style="background:${hex(team.color)}"></span>${esc(team.name)}</td>
      <td class="t">${fmtTime(r.time)}</td>
      <td class="t">${gap}</td>
      <td class="t">${r.odds.toFixed(1)}<br><small>${r.popularity}人気</small></td>
      <td class="t ${r.isFastestLap ? 'fastest' : ''}">${fl}</td>
      <td class="t">${r.overtakes}</td>
      <td class="t ${r.penaltySeconds > 0 ? 'pen' : ''}">${r.penaltySeconds > 0 ? `+${r.penaltySeconds}s` : '—'}</td>
      <td class="t">${r.pitStops}</td>
    </tr>`;
  }
}

