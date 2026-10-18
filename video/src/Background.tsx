import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {C} from './theme';

// Зерно: SVG-шум в data-URI, сдвигается каждый кадр.
const GRAIN =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="360"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.55 0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>`,
  );

export const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  // Медленный дрейф двух мягких пятен света
  const x1 = 28 + Math.sin(t / 11) * 6;
  const y1 = 22 + Math.cos(t / 13) * 5;
  const x2 = 78 + Math.sin(t / 9 + 2) * 5;
  const y2 = 80 + Math.cos(t / 15 + 1) * 6;
  return (
    <AbsoluteFill style={{backgroundColor: C.ground}}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(900px 700px at ${x1}% ${y1}%, rgba(63,169,162,0.20), transparent 70%), radial-gradient(800px 600px at ${x2}% ${y2}%, rgba(210,160,85,0.10), transparent 70%)`,
        }}
      />
      <AbsoluteFill style={{background: 'radial-gradient(1400px 900px at 50% 50%, transparent 55%, rgba(0,0,0,0.42) 100%)'}} />
      <AbsoluteFill
        style={{
          backgroundImage: `url("${GRAIN}")`,
          backgroundPosition: `${(frame * 37) % 360}px ${(frame * 53) % 360}px`,
          opacity: 0.07,
          mixBlendMode: 'overlay',
        }}
      />
    </AbsoluteFill>
  );
};
