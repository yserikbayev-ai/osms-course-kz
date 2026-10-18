import React from 'react';
import {AbsoluteFill, Easing, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Audio} from '@remotion/media';
import {Background} from './Background';
import {Captions} from './Captions';
import {C, MONO, SANS} from './theme';
import {beat, layout, T} from './beats';
import {GLIDE, IN_QUAD, enter, leave, ramp} from './anim';
import type {CardScene, Item, LessonProps} from './types';

// Точки размещения предметов сцены (центр предмета), px.
const SLOT: Record<Item['slot'], [number, number]> = {
  center: [960, 500],
  above: [960, 270],
  below: [960, 800],
  belowLeft: [660, 800],
  belowRight: [1260, 800],
  left: [480, 500],
  right: [1440, 500],
};

const glass: React.CSSProperties = {
  background: 'rgba(29,42,51,0.74)',
  border: '1px solid rgba(231,237,238,0.14)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 24px 60px rgba(0,0,0,0.45)',
  borderRadius: 28,
};

const tone = (t: Item['tone'] | undefined, fallback: string) =>
  t === 'accent' ? C.accentInk : t === 'crit' ? C.crit : t === 'dim' ? C.ink3 : fallback;

// Размер героя: не меньше 120 px, но чтобы строка влезла в 1700 px.
const fit = (text: string, max: number, min = 120) => Math.max(min, Math.min(max, 1720 / (text.length * 0.6)));

/** Слова с каскадным входом 0.09 с. */
const Words: React.FC<{text: string; t: number; t0: number; fps: number; color: string}> = ({text, t, t0, fps, color}) => (
  <>
    {text.split(' ').map((w, i) => {
      const p = enter(t, t0 + i * 0.09, fps);
      return (
        <span key={i} style={{display: 'inline-block', color, opacity: p, translate: `0 ${(1 - p) * 0.35}em`, marginRight: '0.26em'}}>
          {w}
        </span>
      );
    })}
  </>
);

/** Одометр: каждая цифра — колонка 0…9, прокручивается от нуля к своему значению. */
const Odometer: React.FC<{value: string; p: number}> = ({value, p}) => (
  <span style={{display: 'inline-flex', fontVariantNumeric: 'tabular-nums'}}>
    {value.split('').map((d, i) => (
      <span key={i} style={{display: 'inline-block', height: '1em', overflow: 'hidden', lineHeight: 1}}>
        <span style={{display: 'block', translate: `0 ${-Number(d) * p}em`}}>
          {Array.from({length: 10}, (_, k) => (
            <span key={k} style={{display: 'block', height: '1em'}}>
              {k}
            </span>
          ))}
        </span>
      </span>
    ))}
  </span>
);

const ItemView: React.FC<{it: Item; scene: CardScene; lead: number; t: number; fps: number}> = ({it, scene, lead, t, fps}) => {
  const tIn = beat(scene, it.at, lead) ?? 0;
  const tOut = beat(scene, it.out, lead);
  const tMove = beat(scene, it.moveTo?.at, lead);
  const tStrike = beat(scene, it.strike, lead);
  const tAcc = beat(scene, it.accentAt, lead);
  if (t < tIn) return null;
  const out = leave(t, tOut, 0.3);
  if (out >= 1) return null;
  const p = enter(t, tIn, fps);
  const mv = tMove == null ? 0 : enter(t, tMove, fps, GLIDE);
  const strike = tStrike == null ? 0 : ramp(t, tStrike, 0.35);
  const acc = tAcc == null ? 0 : ramp(t, tAcc, 0.4);
  const from = SLOT[it.slot];
  const to = it.moveTo ? SLOT[it.moveTo.slot] : from;
  const x = from[0] + (to[0] - from[0]) * mv;
  const y = from[1] + (to[1] - from[1]) * mv;
  const big = it.style === 'hero' || it.style === 'big' || it.style === 'number';
  const shrink = it.moveTo && big ? 1 - 0.45 * mv : 1; // герой, уходя наверх, становится подписью
  const color = strike > 0 ? C.ink3 : acc > 0 ? C.accentInk : tone(it.tone, it.style === 'label' ? C.ink2 : C.ink);

  const base: React.CSSProperties = {
    position: 'absolute',
    left: x,
    top: y,
    translate: `-50% -50%`,
    scale: String((0.94 + 0.06 * p) * shrink * (1 + 0.06 * out)),
    opacity: Math.min(p * 2, 1) * (1 - out),
    filter: out > 0 ? `blur(${out * 6}px)` : undefined,
    whiteSpace: 'nowrap',
    fontFamily: SANS,
    fontWeight: 800,
    letterSpacing: '-0.03em',
    lineHeight: 1.05,
  };
  const strikeLine =
    tStrike == null ? null : (
      <span
        style={{
          position: 'absolute',
          left: '-0.1em',
          right: '0.1em',
          top: '52%',
          height: '0.09em',
          background: C.crit,
          borderRadius: 4,
          scale: `${strike} 1`,
          transformOrigin: 'left center',
        }}
      />
    );

  if (it.style === 'card' || it.style === 'frame') {
    const isFrame = it.style === 'frame';
    return (
      <div
        style={{
          ...base,
          ...glass,
          borderColor: acc > 0 ? `rgba(63,169,162,${0.35 + 0.65 * acc})` : isFrame ? 'rgba(143,214,208,0.9)' : glass.border as string,
          background: isFrame ? 'rgba(21,48,51,0.18)' : glass.background,
          padding: isFrame ? 0 : '28px 56px',
          width: isFrame ? 1040 : undefined,
          height: isFrame ? 380 : undefined,
          fontSize: isFrame ? 44 : 68,
          fontWeight: isFrame ? 700 : 800,
          color,
          boxShadow: isFrame ? 'inset 0 1px 0 rgba(255,255,255,0.12), 0 0 0 1px rgba(0,0,0,0.25)' : glass.boxShadow,
          zIndex: isFrame ? 0 : 2,
        }}
      >
        <span style={{position: isFrame ? 'absolute' : 'relative', left: isFrame ? 40 : undefined, top: isFrame ? 28 : undefined, color: isFrame ? C.accentInk : color}}>
          <Words text={it.text} t={t} t0={tIn} fps={fps} color={isFrame ? C.accentInk : color} />
          {strikeLine}
        </span>
      </div>
    );
  }

  if (it.style === 'number') {
    return (
      <div style={{...base, fontSize: 300, color: tone(it.tone, C.ink), display: 'flex', alignItems: 'baseline', gap: 36, zIndex: 2}}>
        <Odometer value={it.text} p={ramp(t, tIn, 0.55)} />
        {it.unit ? (
          <span style={{fontSize: 56, fontWeight: 700, color: C.ink2, letterSpacing: '-0.02em'}}>
            <Words text={it.unit} t={t} t0={tIn + 0.25} fps={fps} color={C.ink2} />
          </span>
        ) : null}
      </div>
    );
  }

  const size = it.style === 'hero' ? fit(it.text, 420) : it.style === 'big' ? 132 : it.style === 'text' ? 68 : 46;
  return (
    <div style={{...base, fontSize: size, fontWeight: it.style === 'label' ? 600 : 800, letterSpacing: it.style === 'label' ? '-0.01em' : '-0.03em', zIndex: 2}}>
      <span style={{position: 'relative', display: 'inline-block'}}>
        <Words text={it.text} t={t} t0={tIn} fps={fps} color={color} />
        {strikeLine}
      </span>
    </div>
  );
};

const Chip: React.FC<{children: React.ReactNode; size?: number}> = ({children, size = 34}) => (
  <span
    style={{
      fontFamily: MONO,
      fontSize: size,
      fontWeight: 600,
      color: C.accentInk,
      background: C.accentWash,
      border: '1px solid rgba(63,169,162,0.35)',
      borderRadius: 12,
      padding: '6px 18px',
      letterSpacing: 0,
      whiteSpace: 'nowrap',
    }}
  >
    {children}
  </span>
);

/** Контейнер сцены: вход — камера «въезжает» (1.08→1), выход — ускоряется и уходит в размытие. */
const SceneShell: React.FC<{dur: number; t: number; peak?: boolean; first?: boolean; children: React.ReactNode}> = ({dur, t, peak, first, children}) => {
  const inP = first ? 1 : ramp(t, 0, 0.55); // первая сцена видна с нулевого кадра
  const outP = ramp(t, dur - T.exit, T.exit, IN_QUAD);
  const push = peak ? 1 + 0.04 * ramp(t, 0.5, dur - 1, Easing.inOut(Easing.quad)) : 1;
  return (
    <AbsoluteFill
      style={{
        opacity: inP * (1 - outP),
        scale: String((1.08 - 0.08 * inP) * (1 + 0.24 * outP) * push),
        filter: outP > 0 ? `blur(${outP * 12}px)` : undefined,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

const Card: React.FC<{scene: CardScene; lead: number; dur: number}> = ({scene, lead, dur}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  // шапка входит, когда прошлая сцена уже ушла (overlap 0.5 с), и гаснет до начала выхода
  const h = enter(t, 0.5, fps) * (1 - ramp(t, dur - T.exit - 0.3, 0.3));
  return (
    <SceneShell dur={dur} t={t} peak={scene.peak}>
      <div style={{position: 'absolute', left: 100, top: 84, display: 'flex', alignItems: 'center', gap: 24, opacity: h, translate: `${(1 - h) * -40}px 0`}}>
        <Chip>п. {scene.p}</Chip>
        <span style={{fontFamily: SANS, fontSize: 46, fontWeight: 700, color: C.ink, letterSpacing: '-0.02em', whiteSpace: 'nowrap'}}>{scene.header}</span>
      </div>
      {scene.items.map((it) => (
        <ItemView key={it.id} it={it} scene={scene} lead={lead} t={t} fps={fps} />
      ))}
    </SceneShell>
  );
};

const Opener: React.FC<{props: LessonProps; dur: number}> = ({props, dur}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const chip = enter(t, 0.35, fps);
  const act = enter(t, 1.3, fps);
  return (
    <SceneShell dur={dur} t={t} first>
      <div style={{position: 'absolute', left: 120, top: 250, opacity: chip, translate: `0 ${(1 - chip) * 20}px`}}>
        <Chip size={40}>Урок {props.id}</Chip>
      </div>
      <div style={{position: 'absolute', left: 120, top: 340, width: 1680, fontFamily: SANS, fontSize: 132, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.04, color: C.ink}}>
        {/* первый кадр не пустой: заголовок стартует за 0.25 с до нуля */}
        <Words text={props.title} t={t} t0={-0.25} fps={fps} color={C.ink} />
      </div>
      <div style={{position: 'absolute', left: 120, top: 700, fontFamily: SANS, fontSize: 40, fontWeight: 600, color: C.ink2, opacity: act, translate: `0 ${(1 - act) * 16}px`}}>
        Приказ МЗ РК № {props.act.num} от {props.act.date}
      </div>
    </SceneShell>
  );
};

const Summary: React.FC<{props: LessonProps; lead: number; dur: number}> = ({props, lead, dur}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const s = props.summary;
  const t0 = beat(s, 'voice:Шесть', lead) ?? lead;
  const tCta = beat(s, 'voice:Проверьте', lead) ?? lead + 2;
  const cta = enter(t, tCta, fps);
  return (
    <SceneShell dur={dur} t={t}>
      {s.lines.map((l, i) => {
        const p = enter(t, t0 + i * 0.2, fps);
        return (
          <div key={i} style={{position: 'absolute', left: 300, top: 150 + i * 92, display: 'flex', alignItems: 'center', gap: 28, opacity: p, translate: `${(1 - p) * -40}px 0`}}>
            <Chip>п. {l.p}</Chip>
            <span style={{fontFamily: SANS, fontSize: 46, fontWeight: 700, color: C.ink, letterSpacing: '-0.02em', whiteSpace: 'nowrap'}}>{l.text}</span>
          </div>
        );
      })}
      <div style={{position: 'absolute', left: 300, top: 760, fontFamily: SANS, fontSize: 76, fontWeight: 800, letterSpacing: '-0.03em', color: C.accentInk, opacity: cta, scale: String(0.94 + 0.06 * cta)}}>
        {s.cta}
      </div>
    </SceneShell>
  );
};

export const OsmsLesson: React.FC<LessonProps> = (props) => {
  const {fps} = useVideoConfig();
  return (
    <AbsoluteFill style={{fontFamily: SANS, backgroundColor: C.ground}}>
      <Background />
      {layout(props).map(({scene, start, dur, lead}, i) => (
        <Sequence key={i} from={Math.round(start * fps)} durationInFrames={Math.round(dur * fps)} name={scene.kind === 'card' ? `п. ${scene.p}` : scene.kind}>
          <Sequence from={Math.round(lead * fps)} name="voice">
            <Audio src={staticFile(scene.audio.file)} trimAfter={Math.round(scene.audio.durationSec * fps)} />
          </Sequence>
          {scene.kind === 'opener' ? <Opener props={props} dur={dur} /> : scene.kind === 'summary' ? <Summary props={props} lead={lead} dur={dur} /> : <Card scene={scene as CardScene} lead={lead} dur={dur} />}
          <Captions words={scene.audio.words} lead={lead} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
