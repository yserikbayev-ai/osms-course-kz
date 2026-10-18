import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {C, SANS} from './theme';
import type {Word} from './types';

const MAX = 54; // символов в строке

type Line = {words: Word[]; s: number; e: number};

function toLines(words: Word[]): Line[] {
  const lines: Line[] = [];
  let cur: Word[] = [];
  const len = (ws: Word[]) => ws.reduce((a, w) => a + w.w.length + 1, 0);
  const flush = () => {
    if (cur.length) lines.push({words: cur, s: cur[0].s, e: cur[cur.length - 1].e});
    cur = [];
  };
  words.forEach((w, i) => {
    if (len(cur) + w.w.length > MAX) flush();
    cur.push(w);
    // предпочитаем разрыв после конца предложения, если строка уже наполовину полна
    const next = words[i + 1];
    if (/[.!?]$/.test(w.w) && next && len(cur) + next.w.length > MAX * 0.55) flush();
  });
  flush();
  // строка держится до начала следующей
  for (let i = 0; i < lines.length - 1; i++) lines[i].e = lines[i + 1].s;
  if (lines.length) lines[lines.length - 1].e += 0.6;
  return lines;
}

/** Одна строка субтитров внизу; текущее слово подсвечено. lead — смещение голоса от начала сцены. */
export const Captions: React.FC<{words: Word[]; lead: number}> = ({words, lead}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps - lead;
  const lines = React.useMemo(() => toLines(words), [words]);
  const line = lines.find((l) => t >= l.s - 0.08 && t < l.e);
  if (!line) return null;
  const fade = Math.min(1, (t - (line.s - 0.08)) / 0.12);
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 64,
        display: 'flex',
        justifyContent: 'center',
        opacity: fade,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          fontFamily: SANS,
          fontSize: 40,
          lineHeight: 1.25,
          fontWeight: 600,
          letterSpacing: '-0.005em',
          color: C.ink2,
          background: 'rgba(22,33,42,0.82)',
          border: '1px solid rgba(231,237,238,0.10)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 12px 32px rgba(0,0,0,0.35)',
          borderRadius: 16,
          padding: '10px 30px',
          maxWidth: 1700,
          whiteSpace: 'nowrap',
        }}
      >
        {line.words.map((w, i) => (
          <span key={i} style={{color: t >= w.s && t < w.e + 0.05 ? C.ink : undefined}}>
            {i ? ' ' : ''}
            {w.w}
          </span>
        ))}
      </div>
    </div>
  );
};
