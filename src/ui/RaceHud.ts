import { HORSESHOES } from '../data/horseshoes';
import { constructorOf } from '../data/roster';
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
    name: $('h-name'),
    team: $('h-team'),
    swatch: $('h-swatch'),
    pos: $('h-pos'),
    lap: $('h-lap'),
    time: $('h-time'),
    lpLap: $('lp-lap'),
    lpTime: $('lp-time'),
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
    // シンプルレースでは自分の馬、観戦モードではカメラが追っている馬
    const h = race.focus;
    const e = this.el;

    const team = constructorOf(h.entry);
    e.name.textContent = h.entry.horse.name;
    e.team.textContent = `${team.name}（${team.nameEn}）・${h.entry.jockey.name}`;
    e.swatch.style.background = `#${team.color.toString(16).padStart(6, '0')}`;

    const pos = h.finishPosition ?? race.positionOf(h);
    e.pos.textContent = `${pos}/${race.horses.length}`;
    e.lap.textContent = `${race.currentLap}/${race.laps}`;
    e.time.textContent = formatTime(race.time);
    // 左パネルの見出し（レース全体の周回・時間 = 先頭馬基準）
    const leader = race.standings[0];
    e.lpLap.textContent = `${Math.min(race.laps, leader.lapsCompleted + 1)}/${race.laps}`;
    e.lpTime.textContent = formatTime(race.time);
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
      sub = race.spectating ? '観戦モード — ← → で注目する馬を切替' : 'W / ↑ で加速';
    } else if (race.spectating && race.phase === 'finished') {
      // 観戦モード：全頭ゴールしたら結果
      const winner = race.standings[0];
      big = 'レース終了';
      sub = `優勝 ${winner.entry.horse.name}（${formatOpt(winner.finishTime)}）・ R で再レース ・ タイトルへ戻るボタン`;
    } else if (h.finishTime !== null) {
      // ゴールしたら結果を出し続ける（他馬はまだ走っていることがある）
      big = race.spectating ? `${h.entry.horse.name} ${h.finishPosition}着` : `FINISH! ${h.finishPosition}着`;
      sub = `タイム ${formatTime(h.finishTime)} ・ ベスト ${formatOpt(race.bestLapTime)} ・ R でリスタート`;
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
