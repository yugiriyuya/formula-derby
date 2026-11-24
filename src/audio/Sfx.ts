/**
 * 効果音。外部の音声ファイルは使わず、Web Audio API で音を合成する。
 * ブラウザは利用者の操作（クリック・キー）があるまで音を出せないので、最初の操作で unlock() する。
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  muted: boolean;

  constructor() {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem('formula-derby-muted');
    } catch {
      saved = null;
    }
    this.muted = saved === '1';
  }

  /** 利用者の操作の中で呼ぶ（AudioContext を作る・再開する） */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      // ノイズ（ムチ・ゲート・落馬の音の素）
      const len = this.ctx.sampleRate;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.02);
    try {
      localStorage.setItem('formula-derby-muted', muted ? '1' : '0');
    } catch {
      // 保存できなくても動作には影響しない
    }
  }

  private ready(): AudioContext | null {
    return this.ctx && this.master && !this.muted ? this.ctx : null;
  }

  /** 音程のある短い音 */
  private tone(freq: number, start: number, dur: number, type: OscillatorType, vol: number, endFreq?: number) {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  /** ノイズを帯域フィルターに通した短い音（打撃音・破裂音） */
  private noise(start: number, dur: number, filter: BiquadFilterType, freq: number, vol: number) {
    const ctx = this.ready();
    if (!ctx || !this.noiseBuffer) return;
    const t = ctx.currentTime + start;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  /** 赤ランプが 1 つ点灯：短い電子音 */
  lightOn() {
    this.tone(880, 0, 0.16, 'square', 0.12);
  }

  /** ゲート開放：ガシャンという金属音＋低い衝撃音 */
  gateOpen() {
    this.noise(0, 0.35, 'bandpass', 2400, 0.5);
    this.noise(0.02, 0.25, 'highpass', 5000, 0.25);
    this.tone(110, 0, 0.3, 'square', 0.25, 55);
  }

  /** ムチ：ピシッという鋭い破裂音 */
  whip() {
    this.noise(0, 0.07, 'highpass', 2800, 0.6);
    this.tone(1800, 0, 0.04, 'triangle', 0.15, 900);
  }

  /** ペナルティの警告：2 音の警報（自分の馬なら強め） */
  penalty(strong: boolean) {
    const v = strong ? 0.18 : 0.07;
    this.tone(988, 0, 0.14, 'square', v);
    this.tone(740, 0.16, 0.22, 'square', v);
  }

  /** 落馬：鈍い衝撃音 */
  crash() {
    this.noise(0, 0.5, 'lowpass', 400, 0.8);
    this.tone(70, 0, 0.45, 'sine', 0.4, 35);
  }

  /** セーフティホース出動：上下するサイレン */
  safety() {
    for (let i = 0; i < 2; i++) {
      this.tone(620, i * 0.5, 0.25, 'sawtooth', 0.08, 900);
      this.tone(900, i * 0.5 + 0.25, 0.25, 'sawtooth', 0.08, 620);
    }
  }

  /** グリーンフラッグ：上がっていく 3 音 */
  greenFlag() {
    [523, 659, 784].forEach((f, i) => this.tone(f, i * 0.11, 0.18, 'triangle', 0.18));
  }

  /** 写真判定のシャッター音：カシャッという 2 回の短いクリック */
  shutter() {
    this.noise(0, 0.04, 'highpass', 3500, 0.5);
    this.noise(0.07, 0.06, 'bandpass', 2200, 0.4);
  }

  /** ゴール：ファンファーレ */
  finish() {
    const notes: [number, number, number][] = [
      [523, 0, 0.15], [659, 0.15, 0.15], [784, 0.3, 0.15], [1047, 0.45, 0.5], [784, 0.75, 0.12], [1047, 0.9, 0.6],
    ];
    for (const [f, t, d] of notes) {
      this.tone(f, t, d, 'square', 0.1);
      this.tone(f / 2, t, d, 'triangle', 0.12);
    }
  }
}
