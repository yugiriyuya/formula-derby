import type { CourseTrack } from '../course/CourseTrack';
import { teamsOf, type EntryData } from '../data/roster';
import { Race } from './Race';
import { NO_CONTROLS } from './RaceHorse';

/** 予選の 1 頭ぶんの結果 */
export interface QualifyingRow {
  entry: EntryData;
  /** 計測ラップのタイム（秒）。走り切れなかったら null */
  time: number | null;
}

/** コンストラクターごとの予選結果（ピットボックスの割り当て順） */
export interface QualifyingTeam {
  constructorId: string;
  /** チームの最速タイム（2 頭のうち速い方） */
  best: number | null;
  /** 割り当てられたピットの番号（1 = ピット出口にいちばん近い有利なボックス） */
  pitNumber: number;
}

export interface QualifyingResult {
  /** タイム順（先頭 = ポールポジション = 1 枠） */
  rows: QualifyingRow[];
  /** チームの最速タイム順（先頭 = 1 番ピット） */
  teams: QualifyingTeam[];
  /** ピットボックスの並び（ピットレーンの入口側から。Race.assignGarages に渡す） */
  garageOrder: string[];
}

const DT = 1 / 60;
/** 1 頭あたりの計算の上限（秒）。落馬などで走り切れない時の打ち切り */
const MAX_SECONDS = 600;

/**
 * 予選：全頭が 1 頭ずつ、コースを単独で走る 1 周タイムアタック（高速シミュレーション）。
 * スタートからの 1 周目はウォームアップ（アウトラップ）、2 周目の通過タイムを計測ラップにする。
 * 走りは本番と同じ物理・AI 騎手で計算する（シンプルレースの自分の馬も AI が走らせる）。
 *
 * ピットボックス：コンストラクターの最速タイム順に、ピット出口に近いボックス（1 番ピット）から割り当てる。
 */
export function runQualifying(track: CourseTrack, entries: readonly EntryData[]): QualifyingResult {
  const rows: QualifyingRow[] = entries.map((entry) => {
    const race = new Race(track, 2, [entry], null);
    race.noPitStops = true;
    race.restart();
    const h = race.horses[0];
    for (let t = 0; t < MAX_SECONDS && race.phase !== 'finished'; t += DT) race.update(DT, NO_CONTROLS);
    const time = h.retired || h.lapTimes.length < 2 ? null : h.lapTimes[1];
    return { entry, time };
  });
  const byTime = (a: number | null, b: number | null) => (a ?? Infinity) - (b ?? Infinity);
  rows.sort((a, b) => byTime(a.time, b.time));

  const teams = teamsOf(entries).map((c) => {
    const times = rows.filter((r) => r.entry.constructorId === c.id).map((r) => r.time);
    const valid = times.filter((t): t is number => t !== null);
    return { constructorId: c.id, best: valid.length ? Math.min(...valid) : null, pitNumber: 0 };
  }).sort((a, b) => byTime(a.best, b.best));
  teams.forEach((t, i) => (t.pitNumber = i + 1));
  // ピットボックスはピットレーンの入口側から並ぶので、1 番ピット（出口側）は最後
  const garageOrder = [...teams].reverse().map((t) => t.constructorId);
  return { rows, teams, garageOrder };
}
