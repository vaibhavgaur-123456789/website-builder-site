import { ACCURACY } from "@/config/scoring";

export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const round = (v: number, dp = 0) => {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
};
export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Accuracy with a Bayesian prior, so 2/2 correct is not treated as "100% mastered".
 * Returns a value in [0,1]. With zero attempts it returns the prior.
 */
export function smoothedAccuracy(correct: number, attempts: number, prior = ACCURACY.prior, weight = ACCURACY.priorWeight) {
  return (correct + prior * weight) / (attempts + weight);
}

/** Least-squares slope of ys over their index (units: y per step). */
export function slope(ys: number[]): number {
  const n = ys.length;
  if (n < 2) return 0;
  const mx = (n - 1) / 2;
  const my = mean(ys);
  let num = 0;
  let den = 0;
  ys.forEach((y, i) => {
    num += (i - mx) * (y - my);
    den += (i - mx) ** 2;
  });
  return den === 0 ? 0 : num / den;
}

export function pct(v: number | null | undefined, dp = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "–";
  return `${round(v * 100, dp)}%`;
}
