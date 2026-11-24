import type { Race, RaceEvent } from '../race/Race';
import type { RaceHorse } from '../race/RaceHorse';
import { RACE_CONFIG } from '../race/raceConfig';

/** 1 本のテロップを出しておく時間（秒）と、溜めておく最大数 */
const SHOW_SECONDS = 3.6;
const MAX_QUEUE = 3;

const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];
const nm = (h: RaceHorse) => `${h.postNumber}番 ${h.entry.horse.name}`;

/** 実況の読み方のタイム：72.34 → 「1分12秒3」、48.2 → 「48秒2」 */
export function spokenTime(sec: number): string {
  const tenths = Math.round(sec * 10);
  const m = Math.floor(tenths / 600);
  const rest = tenths - m * 600;
  const sPart = `${Math.floor(rest / 10)}秒${rest % 10}`;
  return m > 0 ? `${m}分${sPart}` : sPart;
}

/** 着差（秒）を競馬の言い方に（ハナ・アタマ・クビ・○馬身） */
export function marginText(seconds: number): string {
  if (seconds < 0.05) return 'ハナ';
  if (seconds < 0.1) return 'アタマ';
  if (seconds < 0.15) return 'クビ';
  const lengths = seconds / 0.2; // 1 馬身 ≒ 0.2 秒
  if (lengths > 10) return '大差';
  const steps: [number, string][] = [
    [0.625, '1/2'], [0.875, '3/4'], [1.125, '1'], [1.375, '1 1/4'], [1.625, '1 1/2'], [1.875, '1 3/4'],
    [2.25, '2'], [2.75, '2 1/2'], [3.25, '3'], [3.75, '3 1/2'], [4.5, '4'], [5.5, '5'], [6.5, '6'], [7.5, '7'], [8.5, '8'], [9.5, '9'],
  ];
  for (const [limit, text] of steps) if (lengths < limit) return `${text}馬身`;
  return '10馬身';
}

/**
 * 競馬実況風のテロップ。レースの節目（Race.events）を読んで、画面下に順番に表示する。
 */
export class Commentary {
  private readonly el: HTMLElement;
  private readonly textEl: HTMLElement;
  private queue: string[] = [];
  private showing = 0;
  private read = 0;

  constructor() {
    this.el = document.getElementById('commentary')!;
    this.textEl = this.el.querySelector('.text') as HTMLElement;
  }

  /** レースをやり直した時 */
  reset() {
    this.queue = [];
    this.showing = 0;
    this.read = 0;
    this.el.classList.remove('show');
  }

  update(dt: number, race: Race) {
    // 新しい出来事を実況の言葉にする
    while (this.read < race.events.length) {
      const text = this.describe(race.events[this.read++], race);
      if (text) {
        this.queue.push(text);
        if (this.queue.length > MAX_QUEUE) this.queue.shift();
      }
    }
    this.showing -= dt;
    if (this.showing <= 0) {
      const next = this.queue.shift();
      if (next) {
        this.textEl.textContent = next;
        // アニメーションをやり直すため、一度クラスを外してから付け直す
        this.el.classList.remove('show');
        void this.el.offsetWidth;
        this.el.classList.add('show');
        this.showing = SHOW_SECONDS;
      } else {
        this.el.classList.remove('show');
      }
    }
  }

  private describe(ev: RaceEvent, race: Race): string | null {
    const h = ev.horse;
    switch (ev.type) {
      case 'start': {
        const rocket = race.horses.filter((x) => x.startResult === 'rocket');
        const late = race.horses.filter((x) => x.startResult === 'late');
        let s = pick(['スタートしました！各馬きれいなスタート！', `ゲートが開いた！${race.horses.length}頭一斉にスタート！`, '今、スタートが切られました！']);
        if (race.weather === 'rain') s = `雨の${race.track.def.shortName}、${s}`;
        if (rocket.length) s += `　${nm(rocket[0])}、好スタート！`;
        if (late.length) s += `　${nm(late[0])}は出遅れた！`;
        return s;
      }
      case 'crash':
        return h ? pick([`あっと${nm(h)}、落馬！`, `${nm(h)}がラチに接触、落馬です！`]) : null;
      case 'safety':
        return pick(['ここでセーフティホースが出動！追い越しは禁止です！', 'セーフティホース出動！馬群は一列になって追走！']);
      case 'green':
        return pick(['セーフティホースがピットへ！グリーンフラッグ、レース再開！', 'レース再開！ここから再び激しい攻防だ！']);
      case 'final400': {
        if (!h) return null;
        const gap = ev.value;
        const lead = gap === undefined ? '' : gap < 0.3 ? '後続との差はほとんどない！' : `リードは${marginText(gap)}！`;
        return pick([`最後の直線！残り400m、先頭は${nm(h)}！${lead}`, `直線コースに入った！残り400m、${nm(h)}が先頭！${lead}`]);
      }
      case 'leadChange':
        return h ? pick([`${nm(h)}が先頭に躍り出た！`, `かわした！${nm(h)}が先頭！`, `${nm(h)}、ここで先頭に立つ！`]) : null;
      case 'finish': {
        if (!h || ev.value !== 1) return null;
        const second = race.horses.find((x) => x.finishPosition === 2);
        const close = !second || (second.finishTime ?? Infinity) - (h.finishTime ?? 0) < 0.15;
        if (close) return `${nm(h)}、ゴールイン！　大接戦、写真判定か！`;
        return pick([`${nm(h)}、1着でゴールイン！`, `${nm(h)}、先頭でゴール！見事な勝利！`]);
      }
      case 'lapLeader': {
        if (!h || ev.lap === undefined || ev.elapsed === undefined) return null;
        const lapNote = ev.lap > 1 && ev.lapTime !== undefined ? `（この周のラップ ${spokenTime(ev.lapTime)}）` : '';
        const finalNote = ev.lap === race.laps - 1 ? '　さあ、ファイナルラップへ！' : '';
        return pick([
          `${ev.lap}周目通過、先頭は${nm(h)}！タイムは${spokenTime(ev.elapsed)}！${lapNote}${finalNote}`,
          `${nm(h)}が先頭で${ev.lap}周目のゴール板を通過！通過タイム${spokenTime(ev.elapsed)}${lapNote}${finalNote}`,
        ]);
      }
      case 'mark1000': {
        if (ev.value === undefined) return null;
        const n = Math.max(1, Math.round(ev.value));
        const shape = n >= 45 ? 'ピット戦略の違いもあって、隊列は大きく縦長！' : n >= 25 ? '縦長の展開！' : n <= 12 ? '馬群は一団！' : '';
        return pick([
          `残り1000m標識を通過！先頭から殿（しんがり）まではおよそ${n}馬身！${shape}`,
          `残り1000mのハロン棒を通過、先頭${h ? nm(h) : ''}から殿まではおよそ${n}馬身！${shape}`,
        ]);
      }
      case 'breakaway': {
        if (!h) return null;
        const n = ev.value !== undefined ? Math.round(ev.value / RACE_CONFIG.horseLengthMeters) : 0;
        return pick([
          `${nm(h)}、後続を大きく引き離して大逃げの展開！`,
          `${nm(h)}が単騎の大逃げ！2番手まではおよそ${n}馬身！`,
        ]);
      }
      case 'tailOff':
        return h
          ? pick([`後方の${nm(h)}は少し離された追走`, `最後方は${nm(h)}、ぽつんと離れての追走です`])
          : null;
      case 'penalty':
        return null; // ペナルティは画面上部の警告で出すので実況では言わない
    }
  }
}
