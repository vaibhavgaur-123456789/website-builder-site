import { BENCHMARK } from "@/config/scoring";
import { round } from "./stats";

export interface BenchmarkValue {
  metric: string;
  value: number;
  p25: number | null;
  p75: number | null;
  sampleSize: number;
  source: "AGGREGATE" | "REFERENCE";
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** k-anonymous aggregate: returns null unless at least `minSampleSize` students contributed. */
export function aggregateValues(values: number[], k = BENCHMARK.minSampleSize): { value: number; p25: number; p75: number; sampleSize: number } | null {
  const clean = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (clean.length < k) return null;
  return { value: round(quantile(clean, 0.5), 2), p25: round(quantile(clean, 0.25), 2), p75: round(quantile(clean, 0.75), 2), sampleSize: clean.length };
}

export interface Comparison {
  difference: number;
  band: "BELOW_P25" | "P25_TO_MEDIAN" | "MEDIAN_TO_P75" | "ABOVE_P75" | "UNKNOWN";
  text: string;
  label: string;
}

export function compareToBenchmark(user: number, b: BenchmarkValue, unit: "pp" | "min" | "q"): Comparison {
  const difference = round(user - b.value, 1);
  let band: Comparison["band"] = "UNKNOWN";
  if (b.p25 !== null && b.p75 !== null) {
    band = user < b.p25 ? "BELOW_P25" : user < b.value ? "P25_TO_MEDIAN" : user < b.p75 ? "MEDIAN_TO_P75" : "ABOVE_P75";
  }
  const unitText = unit === "pp" ? "percentage points" : unit === "min" ? "minutes" : "questions";
  const dir = difference > 0 ? "above" : difference < 0 ? "below" : "equal to";
  const label = b.source === "AGGREGATE" ? `Anonymous benchmark · ${b.sampleSize} students` : "Reference benchmark · illustrative, not from real users";
  const text = difference === 0 ? "You are exactly at the benchmark median." : `You are ${Math.abs(difference)} ${unitText} ${dir} the benchmark median.`;
  return { difference, band, text, label };
}
