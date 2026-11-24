import { HORSESHOES } from '../data/horseshoes';
import { constructorOf } from '../data/roster';
import { bracketColor } from '../data/brackets';
import type { Race } from '../race/Race';
import { PACE_LEVELS, RACE_CONFIG, type PaceLevel } from '../race/raceConfig';

const PACE_SHORT: Record<PaceLevel, string> = { relaxed: '折り合い', normal: '標準', high: 'ハイ' };

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
    post: $('h-post'),
    lights: $('start-lights'),
    penalty: $('h-penalty'),
    slip: $('h-slip'),
    toast: $('penalty-toast'),
    rail: $('h-rail'),
    rough: $('h-rough'),
    flag: $('flag-banner'),
  };
  private readonly lampUnits = [...document.querySelectorAll<HTMLElement>('#start-lights .lamp-unit')];
  private readonly paceSegs = [...document.querySelectorAll<HTMLElement>('#race-hud .pace-seg')];

  update(race: Race) {
    // シンプルレースでは自分の馬、観戦モードではカメラが追っている馬
    const h = race.focus;
    const e = this.el;

    // --- F1 式スタートシグナル：1 つずつ点灯 → 全消灯でスタート。スタート後しばらくして隠す ---
    const lit = race.lightsOn;
    this.lampUnits.forEach((u, i) => u.classList.toggle('on', i < lit));
    e.lights.classList.toggle('hidden', race.phase !== 'countdown' && race.time > 1.2);

    const team = constructorOf(h.entry);
    const badge = bracketColor(h.postNumber, race.horses.length);
    e.post.textContent = String(h.postNumber);
    e.post.style.background = badge.bg;
    e.post.style.color = badge.fg;
    // ペースごとの巡航速度（km/h）を出して違いを分かりやすく
    const baseTop = RACE_CONFIG.topSpeedBase + h.entry.horse.stats.speed * RACE_CONFIG.topSpeedPerStat;
    this.paceSegs.forEach((s) => {
      const level = s.dataset.pace as PaceLevel;
      s.classList.toggle('on', level === h.paceLevel);
      s.textContent = `${PACE_SHORT[level]} ${Math.round(baseTop * PACE_LEVELS[level].ratio * 3.6)}`;
    });
    // 荒れた芝でのグリップ低下（減速の大きさ）
    const roughLoss = h.inPit || h.retired ? 0 : baseTop * h.groundWear * RACE_CONFIG.roughPenalty[h.shoe] * 3.6;
    e.rough.textContent = roughLoss >= 0.5 ? `荒れ馬場 −${roughLoss.toFixed(1)}km/h` : '';
    e.name.textContent = h.entry.horse.name;
    e.team.textContent = `${team.name}（${team.nameEn}）・${h.entry.jockey.name} ・ ${h.style.label} ・ 単勝 ${h.odds.toFixed(1)}倍（${h.popularity}人気）`;
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
    // あと 1 回でペナルティ（4 回目）はオレンジで注意
    e.whip.classList.toggle('warn-soon', h.whipsThisLap === RACE_CONFIG.whipPenaltyCount - 1);
    e.penalty.textContent = h.penaltySeconds > 0 ? `ペナルティ +${h.penaltySeconds}s` : '';
    e.slip.classList.toggle('on', h.slipstream > 0.5);
    // ラチに近づきすぎ（触れたら落馬）
    const nearRail = !h.retired && h.pitPhase === 'none' && race.phase === 'running' && h.railDistance < RACE_CONFIG.railWarningDistance;
    e.rail.classList.toggle('on', nearRail);

    // セーフティホース / GREEN FLAG のバナー
    const sc = race.safety;
    const green = race.clock - sc.greenFlagAt < RACE_CONFIG.greenFlagSeconds;
    e.flag.className = sc.restricting ? 'sc' : green ? 'green' : '';
    if (sc.restricting) {
      const state = sc.state === 'standby' ? '出動' : sc.state === 'leading' ? '先導中' : 'まもなくピットへ';
      e.flag.textContent = `SAFETY HORSE（追い越し禁止・50km/h制限）— ${state}`;
    } else if (green) {
      e.flag.textContent = 'GREEN FLAG — レース再開';
    }

    // ペナルティ・落馬の警告（どの馬でも、直近 3 秒以内のもの）
    const last = race.incidents[race.incidents.length - 1];
    const showToast = last !== undefined && race.clock - last.at < 3;
    e.toast.classList.toggle('show', showToast);
    if (showToast) e.toast.textContent = last.text;

    const shoe = HORSESHOES[h.shoe];
    e.shoe.textContent = h.shoe;
    e.shoe.style.color = shoe.color;
    e.wear.textContent = `摩耗 ${Math.round(h.shoeWear * 100)}%`;

    e.pit.textContent = h.stopGoPending ? 'S&G' : h.inPit ? 'IN' : h.pitRequested ? 'ON' : 'OFF';
    e.pit.classList.toggle('on', h.pitRequested || h.inPit);
    e.next.textContent = h.nextShoe;
    e.next.style.color = HORSESHOES[h.nextShoe].color;
    e.pitCount.textContent = String(h.pitCount);

    e.laps.textContent = `LAST ${formatOpt(race.lastLapTime)} ・ BEST ${formatOpt(race.bestLapTime)}`;

    // --- 中央メッセージ ---
    let big = '';
    let sub = '';
    if (race.phase === 'countdown') {
      // 赤ランプが全部消えた瞬間にゲートが開く
      sub = race.spectating ? '観戦モード — ← → で注目する馬を切替' : 'ブラックアウトでスタート ・ W/S でペース';
    } else if (h.retired) {
      big = '落馬 — DNF';
      sub = race.spectating ? `${h.postNumber}番 ${h.entry.horse.name} はリタイアしてピットへ戻ります` : 'R でリスタート';
    } else if (race.spectating && race.phase === 'finished') {
      // 観戦モード：全頭ゴールしたら結果
      const winner = race.standings[0];
      big = 'レース終了';
      sub = `優勝 ${winner.entry.horse.name}（${formatOpt(race.correctedTime(winner))}）・ R で再レース ・ タイトルへ戻るボタン`;
    } else if (h.finishTime !== null) {
      // ゴールしたら結果を出し続ける（他馬はまだ走っていることがある）
      big = race.spectating ? `${h.entry.horse.name} ${h.finishPosition}着` : `FINISH! ${h.finishPosition}着`;
      const pen = h.penaltySeconds > 0 ? `（ペナルティ +${h.penaltySeconds}s 込み）` : '';
      sub = `タイム ${formatTime(race.correctedTime(h)!)}${pen} ・ ベスト ${formatOpt(race.bestLapTime)} ・ R でリスタート`;
    } else {
      big = race.activeMessage ?? '';
      if (h.pitPhase === 'stopped' && h.isServingStopGo) sub = `STOP & GO 停止中  ${Math.max(0, h.pitTimer).toFixed(1)}s`;
      else if (h.pitPhase === 'stopped') sub = `蹄鉄交換中 ${h.shoe} → ${h.nextShoe}  ${Math.max(0, h.pitTimer).toFixed(1)}s`;
      else if (h.stopGoPending && h.pitPhase === 'none') sub = `STOP & GO — 次のピットインでボックスに ${RACE_CONFIG.stopGoSeconds} 秒停止`;
      else if (h.pitPhase === 'lane') sub = `ピットレーン 速度制限 ${Math.round(RACE_CONFIG.pitSpeedLimit * 3.6)}km/h`;
      else if (h.pitPhase === 'approach') sub = 'ピットイン準備 — 内側へ寄せます';
      else if (h.whipsThisLap === RACE_CONFIG.whipPenaltyCount - 1) sub = `ムチ ${h.whipsThisLap} 回 — この周は次からペナルティ +${RACE_CONFIG.whipPenaltySeconds}s`;
    }
    // ペナルティの警告は赤く
    e.big.classList.toggle('penalty', race.activeMessageKind === 'penalty' && big === race.activeMessage);
    e.big.textContent = big;
    e.sub.textContent = sub;
  }
}
