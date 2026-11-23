import { HORSESHOES } from '../data/horseshoes';
import type { Race } from '../race/Race';
import { RACE_CONFIG } from '../race/raceConfig';

const $ = (id: string) => document.getElementById(id)!;

export function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

const formatOpt = (sec: number | null) => (sec === null ? '--:--.--' : formatTime(sec));

/** 画面下の最小限のレース HUD と、中央のメッセージ */
export class RaceHud {
  private readonly el = {
    lap: $('h-lap'),
    time: $('h-time'),
    speed: $('h-speed'),
    stamina: $('h-stamina'),
    whip: $('h-whip'),
    shoe: $('h-shoe'),
    wear: $('h-wear'),
    pit: $('h-pit'),
    next: $('h-next'),
    pitCount: $('h-pitcount'),
    laps: $('h-laps'),
    big: $('c-big'),
    sub: $('c-sub'),
  };


  update(race: Race) {
    const h = race.player;
    const e = this.el;

    e.lap.textContent = `${race.currentLap}/${race.laps}`;
    e.time.textContent = formatTime(race.time);
    e.speed.textContent = String(Math.round(h.speed * 3.6)); // m/s → km/h

    e.stamina.style.width = `${h.stamina}%`;
    e.stamina.className = h.stamina < 30 ? 'low' : h.stamina < 60 ? 'mid' : '';

    e.whip.textContent = `${h.whipsThisLap} / ${RACE_CONFIG.whipPenaltyCount}`;
    e.whip.classList.toggle('warn', h.whipsThisLap >= RACE_CONFIG.whipPenaltyCount);

    const shoe = HORSESHOES[h.shoe];
    e.shoe.textContent = h.shoe;
    e.shoe.style.color = shoe.color;
    e.wear.textContent = `摩耗 ${Math.round(h.shoeWear * 100)}%`;

    e.pit.textContent = h.inPit ? 'IN' : h.pitRequested ? 'ON' : 'OFF';
    e.pit.classList.toggle('on', h.pitRequested || h.inPit);
    e.next.textContent = h.nextShoe;
    e.next.style.color = HORSESHOES[h.nextShoe].color;
    e.pitCount.textContent = String(h.pitCount);

    e.laps.textContent = `LAST ${formatOpt(race.lastLapTime)} ・ BEST ${formatOpt(race.bestLapTime)}`;

    // --- 中央メッセージ ---
    let big = '';
    let sub = '';
    if (race.phase === 'countdown') {
      big = String(Math.ceil(race.countdown));
      sub = 'W / ↑ で加速';
    } else if (race.phase === 'finished') {
      big = 'FINISH!';
      sub = `タイム ${formatTime(race.time)} ・ ベスト ${formatOpt(race.bestLapTime)} ・ R でリスタート`;
    } else {
      big = race.activeMessage ?? '';
      if (h.pitPhase === 'stopped') sub = `蹄鉄交換中 ${h.shoe} → ${h.nextShoe}  ${Math.max(0, h.pitTimer).toFixed(1)}s`;
      else if (h.pitPhase === 'lane') sub = `ピットレーン 速度制限 ${Math.round(RACE_CONFIG.pitSpeedLimit * 3.6)}km/h`;
      else if (h.pitPhase === 'approach') sub = 'ピットイン準備 — 内側へ寄せます';
      else if (h.whipsThisLap >= RACE_CONFIG.whipPenaltyCount) sub = `ムチ ${h.whipsThisLap} 回 — この周はペナルティ対象`;
    }
    e.big.textContent = big;
    e.sub.textContent = sub;
  }
}
