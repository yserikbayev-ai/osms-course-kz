import {Easing, interpolate, spring} from 'remotion';

// Пружина с маленьким оседанием — вход всех элементов.
export const SETTLE = {damping: 15, stiffness: 120, mass: 0.9};
// Без отскока — перемещения.
export const GLIDE = {damping: 200, stiffness: 140, mass: 1};

export const OUT_EXPO = Easing.bezier(0.16, 1, 0.3, 1); // плавно тормозит
export const IN_QUAD = Easing.bezier(0.5, 0, 0.85, 0.3); // ускоряется на выходе

/** Прогресс входа 0→1 от момента t0 (с), с пружиной. */
export const enter = (t: number, t0: number, fps: number, config = SETTLE) =>
  t < t0 ? 0 : spring({frame: (t - t0) * fps, fps, config});

/** Прогресс выхода 0→1 за dur секунд от t0 (с); 0 если выход не начался. */
export const leave = (t: number, t0: number | null, dur = 0.3) =>
  t0 == null ? 0 : interpolate(t, [t0, t0 + dur], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: IN_QUAD});

export const ramp = (t: number, t0: number, dur: number, easing = OUT_EXPO) =>
  interpolate(t, [t0, t0 + dur], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing});
