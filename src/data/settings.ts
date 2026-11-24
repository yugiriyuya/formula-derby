/**
 * タイトル画面で選ぶレース設定（コース・周回数・予選の有無）。ブラウザに保存して次回も使う。
 */
export type LapsOption = 5 | 20;

export type WeatherOption = 'sunny' | 'rain' | 'random';

export interface RaceSettings {
  course: string;
  laps: LapsOption;
  qualifying: boolean;
  /** 単発レースの天候（random = コースごとの雨の降りやすさで抽選） */
  weather: WeatherOption;
  /** 出走頭数（12 / 16） */
  fieldSize: 12 | 16;
}

const KEY = 'formula-derby-settings';
const DEFAULTS: RaceSettings = { course: 'kyoto-outer', laps: 5, qualifying: false, weather: 'sunny', fieldSize: 12 };

export function loadSettings(): RaceSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const v = JSON.parse(raw) as Partial<RaceSettings>;
    return {
      course: typeof v.course === 'string' ? v.course : DEFAULTS.course,
      laps: v.laps === 20 ? 20 : 5,
      qualifying: v.qualifying === true,
      weather: v.weather === 'rain' || v.weather === 'random' ? v.weather : 'sunny',
      fieldSize: v.fieldSize === 16 ? 16 : 12,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: RaceSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // 保存できなくても動作には影響しない
  }
}
