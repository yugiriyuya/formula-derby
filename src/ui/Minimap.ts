import type { CourseTrack } from '../course/CourseTrack';
import { constructorOf } from '../data/roster';
import type { Race } from '../race/Race';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/**
 * コース全体のミニマップ。上から見た形（ワールドの x → 右, z → 下）で、全馬の位置をドットで表示する。
 * コースは最初に一度だけ描いておき、毎フレームはドットだけ重ねる。
 */
export class Minimap {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly background: HTMLCanvasElement;
  private readonly scale: number;
  private readonly ox: number;
  private readonly oz: number;
  private readonly dpr: number;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly track: CourseTrack,
  ) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || 300;
    const h = canvas.clientHeight || 160;
    canvas.width = Math.round(w * this.dpr);
    canvas.height = Math.round(h * this.dpr);
    this.ctx = canvas.getContext('2d')!;

    const def = track.def;
    const half = def.trackWidth / 2;
    const ext = track.extent();
    const pad = 10;
    const spanX = ext.maxX - ext.minX + half * 2;
    const spanZ = ext.maxZ - ext.minZ + half * 2;
    this.scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanZ) * this.dpr;
    this.ox = (canvas.width - spanX * this.scale) / 2 - (ext.minX - half) * this.scale;
    this.oz = (canvas.height - spanZ * this.scale) / 2 - (ext.minZ - half) * this.scale;

    // --- 背景（コース・ピットレーン・ゴール） ---
    this.background = document.createElement('canvas');
    this.background.width = canvas.width;
    this.background.height = canvas.height;
    const bg = this.background.getContext('2d')!;
    const path = (lateralAt: (s: number) => number | null) => {
      bg.beginPath();
      let drawing = false;
      for (let s = 0; s <= track.length + 1; s += 2) {
        const lat = lateralAt(s);
        if (lat === null) {
          drawing = false;
          continue;
        }
        const [x, y] = this.toMap(track.frameAt(s, lat).position.x, track.frameAt(s, lat).position.z);
        if (drawing) bg.lineTo(x, y);
        else bg.moveTo(x, y);
        drawing = true;
      }
    };
    bg.lineJoin = 'round';
    bg.lineCap = 'round';
    // ピットレーン
    path((s) => track.pitLateralAt(s));
    bg.strokeStyle = 'rgba(170,170,170,0.9)';
    bg.lineWidth = Math.max(2, def.pitLane.width * this.scale);
    bg.stroke();
    // 芝コース
    path(() => 0);
    bg.closePath();
    bg.strokeStyle = '#4f9a3a';
    bg.lineWidth = Math.max(4, def.trackWidth * this.scale);
    bg.stroke();
    // ゴール板
    const f = track.frameAt(def.finishS, 0);
    const [ax, ay] = this.toMap(f.position.x + f.right.x * half, f.position.z + f.right.z * half);
    const [bx, by] = this.toMap(f.position.x - f.right.x * half, f.position.z - f.right.z * half);
    bg.beginPath();
    bg.moveTo(ax, ay);
    bg.lineTo(bx, by);
    bg.strokeStyle = '#ffffff';
    bg.lineWidth = 2 * this.dpr;
    bg.stroke();
  }

  private toMap(x: number, z: number): [number, number] {
    return [this.ox + x * this.scale, this.oz + z * this.scale];
  }

  update(race: Race) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.background, 0, 0);

    // 後ろの順位から描いて、上位と注目している馬（自分の馬）を上に重ねる。落馬した馬は描かない
    const order = [...race.standings].reverse().filter((h) => h !== race.focus && !h.retired);
    if (!race.focus.retired) order.push(race.focus);

    // セーフティホース：白い大きめの点に黄色の縁
    const sc = race.safety;
    if (sc.visible) {
      const p = this.track.frameAt(sc.s, sc.lateral).position;
      const [x, y] = this.toMap(p.x, p.z);
      ctx.beginPath();
      ctx.arc(x, y, 5.5 * this.dpr, 0, Math.PI * 2);
      ctx.fillStyle = '#f4f4f4';
      ctx.fill();
      ctx.lineWidth = 2.5 * this.dpr;
      ctx.strokeStyle = '#ffc400';
      ctx.stroke();
    }

    for (const h of order) {
      const p = this.track.frameAt(h.s, h.lateral).position;
      const [x, y] = this.toMap(p.x, p.z);
      const isPlayer = h === race.focus;
      const r = (isPlayer ? 5 : 3.5) * this.dpr;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = hex(constructorOf(h.entry).color);
      ctx.fill();
      ctx.lineWidth = (isPlayer ? 2 : 1) * this.dpr;
      ctx.strokeStyle = isPlayer ? '#ffffff' : 'rgba(0,0,0,0.7)';
      ctx.stroke();
    }
  }
}
