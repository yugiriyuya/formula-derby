import { courseById } from '../course/courses';
import { CONSTRUCTORS, ENTRIES } from '../data/roster';
import { isFinished, standings, type SeriesState } from '../race/Series';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const swatch = (color: number) => `<span class="team" style="display:inline-block;width:8px;height:12px;margin-right:4px;background:${hex(color)}"></span>`;

/**
 * シリーズ戦の順位画面。各レースの後（第 n 戦終了）と、全 10 戦の後（シリーズチャンピオン決定）に出す。
 *  - コンストラクターズランキング（6 チームの合計ポイント・優勝回数）
 *  - 馬（ドライバー）ランキング（ポイント・優勝・表彰台）
 *  - 各ラウンドの勝者
 */
export class SeriesScreen {
  private readonly el = document.getElementById('series-screen')!;
  private readonly nextBtn = document.getElementById('series-next') as HTMLButtonElement;

  onNext?: () => void;
  onBack?: () => void;
  onTitle?: () => void;

  constructor() {
    this.nextBtn.addEventListener('click', () => this.onNext?.());
    document.getElementById('series-back')!.addEventListener('click', () => this.onBack?.());
    document.getElementById('series-title')!.addEventListener('click', () => this.onTitle?.());
  }

  get visible(): boolean {
    return this.el.classList.contains('show');
  }

  hide() {
    this.el.classList.remove('show');
  }

  show(s: SeriesState) {
    const { horses, teams } = standings(s);
    const done = s.rounds.filter((r) => r.results).length;
    const finished = isFinished(s);
    const last = s.rounds[done - 1];
    document.getElementById('series-title-main')!.textContent = finished ? 'CHAMPIONS' : 'SERIES STANDINGS';
    document.getElementById('series-sub')!.textContent = finished
      ? `シリーズ戦 全${s.rounds.length}戦 終了 — 最終順位`
      : `シリーズ戦 第${done}戦（${last ? courseById(last.courseId).shortName : ''}）終了時点`;

    // チャンピオン（全戦終了時）
    const champ = document.getElementById('series-champion')!;
    if (finished) {
      const t = CONSTRUCTORS.find((c) => c.id === teams[0].constructorId)!;
      const e = ENTRIES.find((x) => x.id === horses[0].entryId)!;
      champ.innerHTML = `<div class="champ"><span class="cup">🏆</span>
        <div><small>コンストラクターズチャンピオン</small><b>${swatch(t.color)}${esc(t.name)}</b><span>${teams[0].points} pt・優勝 ${teams[0].wins} 回</span></div>
        <div><small>ドライバー（馬）チャンピオン</small><b>${esc(e.horse.name)}</b><span>${esc(e.jockey.name)}・${horses[0].points} pt・優勝 ${horses[0].wins} 回</span></div></div>`;
    } else champ.innerHTML = '';

    const teamRows = teams.map((t, i) => {
      const c = CONSTRUCTORS.find((x) => x.id === t.constructorId)!;
      return `<tr class="${i === 0 ? 'lead' : ''}"><td><b>${i + 1}</b></td><td class="l">${swatch(c.color)}${esc(c.name)}</td>
        <td><b>${t.points}</b></td><td>${t.wins}</td><td class="gain">${t.last > 0 ? `+${t.last}` : ''}</td></tr>`;
    });
    document.getElementById('series-teams')!.innerHTML =
      `<table><thead><tr><th>順</th><th class="l">コンストラクター</th><th>pt</th><th>優勝</th><th>今回</th></tr></thead><tbody>${teamRows.join('')}</tbody></table>`;

    const horseRows = horses.map((h, i) => {
      const e = ENTRIES.find((x) => x.id === h.entryId)!;
      const c = CONSTRUCTORS.find((x) => x.id === e.constructorId)!;
      return `<tr class="${i === 0 ? 'lead' : ''}"><td><b>${i + 1}</b></td><td class="l">${swatch(c.color)}<b>${esc(e.horse.name)}</b> <small>${esc(e.jockey.name)}</small></td>
        <td><b>${h.points}</b></td><td>${h.wins}</td><td>${h.podiums}</td><td class="gain">${h.last > 0 ? `+${h.last}` : ''}</td></tr>`;
    });
    document.getElementById('series-horses')!.innerHTML =
      `<table><thead><tr><th>順</th><th class="l">馬名 / 騎手</th><th>pt</th><th>優勝</th><th>表彰台</th><th>今回</th></tr></thead><tbody>${horseRows.join('')}</tbody></table>`;

    // 各ラウンド（コース・天候・勝者）
    const cells = s.rounds.map((r, i) => {
      const course = courseById(r.courseId);
      const win = r.results?.find((x) => x.position === 1);
      const e = win ? ENTRIES.find((x) => x.id === win.entryId) : undefined;
      const cls = [r.results ? 'done' : '', i === s.round ? 'next' : ''].join(' ');
      return `<div class="rd ${cls}"><small>第${i + 1}戦 ${r.weather === 'rain' ? '☔' : '☀'}</small><b>${esc(course.shortName)}</b><span>${e ? esc(e.horse.name) : i === s.round && !finished ? '次戦' : '—'}</span></div>`;
    });
    document.getElementById('series-rounds')!.innerHTML = cells.join('');

    if (finished) {
      this.nextBtn.style.display = 'none';
    } else {
      this.nextBtn.style.display = '';
      const next = s.rounds[s.round];
      this.nextBtn.textContent = `次のレースへ（第${s.round + 1}戦 ${courseById(next.courseId).shortName}）`;
    }
    this.el.classList.add('show');
  }
}
