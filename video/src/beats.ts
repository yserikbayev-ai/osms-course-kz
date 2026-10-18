// Таймлайн урока: длительности сцен и разрешение якорей вида
// "plain:слово", "plain:слово#2+0.4", "start", "end+0.3".
// Читается и Remotion, и node-скриптами (node 22+ исполняет .ts напрямую).
import type {AudioInfo, LessonProps} from './types';

export const T = {
  lead: 0.5, // тишина до голоса
  hold: 1.6, // удержание итога сцены после голоса
  overlap: 0.5, // наложение соседних сцен
  openerLead: 0.4,
  openerHold: 0.9,
  summaryHold: 3.4,
  exit: 0.45, // выход сцены (вдвое короче входа)
};

type Timed = {kind: string; p?: number; audio: AudioInfo; items?: {at: string; out?: string; strike?: string; accentAt?: string; moveTo?: {at: string}}[]; lines?: unknown[]};

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[«»"'“”.,:;!?()—–]/g, '');

/** Время якоря в секундах от начала сцены. */
export function beat(scene: Timed, anchor: string | number | null | undefined, lead = T.lead): number | null {
  if (anchor == null) return null;
  if (typeof anchor === 'number') return anchor;
  const m = anchor.match(/^(start|end|[a-z]+:[^#+-]+)(?:#(\d+))?([+-][\d.]+)?$/u);
  if (!m) throw new Error(`Плохой якорь: ${anchor}`);
  const off = m[3] ? Number(m[3]) : 0;
  if (m[1] === 'start') return off;
  if (m[1] === 'end') return lead + scene.audio.durationSec + off;
  const [part, word] = m[1].split(':');
  const n = m[2] ? Number(m[2]) : 1;
  const target = norm(word);
  let k = 0;
  for (const w of scene.audio.words) {
    if ((part === 'voice' || w.part === part) && norm(w.w) === target && ++k === n) return lead + w.s + off;
  }
  console.warn(`Якорь не найден: ${anchor} (сцена ${scene.p ?? scene.kind})`);
  return lead;
}

export type Placed = {scene: Timed; start: number; dur: number; lead: number};

/** Раскладка сцен в секундах; соседние сцены перекрываются на T.overlap. */
export function layout(props: LessonProps): Placed[] {
  const out: Placed[] = [];
  let t = 0;
  const push = (scene: Timed, lead: number, hold: number) => {
    const dur = lead + scene.audio.durationSec + hold;
    out.push({scene, start: t, dur, lead});
    t += dur - T.overlap;
  };
  push(props.opener, T.openerLead, T.openerHold);
  for (const s of props.scenes) push(s, T.lead, T.hold);
  push(props.summary, T.lead, T.summaryHold);
  return out;
}

export const totalSec = (props: LessonProps) => {
  const l = layout(props);
  const last = l[l.length - 1];
  return last.start + last.dur;
};

/** Моменты для листа кадров: старт сцены, каждый якорь (+0.3 с), итог сцены. */
export function sheetTimes(props: LessonProps): {t: number; label: string}[] {
  const times: {t: number; label: string}[] = [];
  for (const {scene, start, dur, lead} of layout(props)) {
    const local = new Set([0.3, lead + 0.3, dur - T.exit - 0.2]);
    for (const it of scene.items || []) {
      for (const a of [it.at, it.out, it.strike, it.accentAt, it.moveTo && it.moveTo.at]) {
        const b = beat(scene, a, lead);
        if (b != null) local.add(b + 0.3);
      }
    }
    if (scene.kind === 'summary') {
      local.add(lead + (scene.lines?.length ?? 0) * 0.2 + 0.4);
      local.add((beat(scene, 'voice:Проверьте', lead) ?? 0) + 0.3);
    }
    for (const l of local) times.push({t: Math.round((start + l) * 100) / 100, label: scene.kind === 'card' ? `п. ${scene.p}` : scene.kind});
  }
  return times.filter((x) => x.t >= 0).sort((a, b) => a.t - b.t);
}
