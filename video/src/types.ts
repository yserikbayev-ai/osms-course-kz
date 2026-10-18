export type Word = {w: string; s: number; e: number; part: string};
export type AudioInfo = {file: string; durationSec: number; chars: number; words: Word[]};

export type Item = {
  id: string;
  text: string;
  style: 'hero' | 'big' | 'text' | 'card' | 'label' | 'number' | 'frame';
  tone?: 'ink' | 'accent' | 'crit' | 'dim';
  slot: 'center' | 'above' | 'below' | 'belowLeft' | 'belowRight' | 'left' | 'right';
  at: string;
  out?: string;
  strike?: string;
  accentAt?: string;
  moveTo?: {at: string; slot: Item['slot']};
  unit?: string;
};

export type CardScene = {
  kind: 'card';
  p: number;
  a: string;
  norm: string;
  plain: string;
  header: string;
  peak: boolean;
  items: Item[];
  voiceText: string;
  audio: AudioInfo;
};

export type LessonProps = {
  id: string;
  title: string;
  grade: number;
  nQuestions: number;
  act: {num: string; date: string; title: string};
  opener: {kind: 'opener'; voiceText: string; audio: AudioInfo};
  scenes: CardScene[];
  summary: {kind: 'summary'; lines: {p: number; text: string}[]; cta: string; voiceText: string; audio: AudioInfo};
};
