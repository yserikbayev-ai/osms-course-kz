// Цвета и шрифты — тёмная тема сайта курса (source/app_style.html, :root[data-theme="dark"]).
export const C = {
  ground: '#0F171C',
  surface: '#16212A',
  surface2: '#1D2A33',
  line: '#2A3A44',
  ink: '#E7EDEE',
  ink2: '#A9B9BF',
  ink3: '#7D8F97',
  accent: '#3FA9A2',
  accentInk: '#8FD6D0',
  accentWash: '#153033',
  crit: '#E07A7A',
  brass: '#D2A055',
} as const;

// Тот же стек, что у сайта (--sans / --mono).
export const SANS = '-apple-system, "Helvetica Neue", Arial, sans-serif';
export const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

export const W = 1920;
export const H = 1080;
export const FPS = 30;

