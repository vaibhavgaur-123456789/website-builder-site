// Deterministic question templates. Every generated question is computed, so the answer is always correct,
// and each comes with a worked explanation. Same seed → same questions (stable seeds, stable tests).

export interface GenQuestion {
  stem: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: number;
  expectedSeconds: number;
}

export type Rng = () => number;
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
const int = (r: Rng, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const pick = <T,>(r: Rng, xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

/** Build 4 unique options around the answer and shuffle deterministically. */
function mcq(r: Rng, answer: string, distractors: string[], stem: string, explanation: string, difficulty: number, expectedSeconds: number): GenQuestion {
  const set = [answer];
  for (const d of distractors) if (!set.includes(d) && set.length < 4) set.push(d);
  let k = 1;
  while (set.length < 4) {
    const n = Number(answer);
    const cand = Number.isFinite(n) ? fmt(n + k * (n >= 10 ? Math.ceil(n * 0.07) : 1)) : `${answer} ${k}`;
    if (!set.includes(cand)) set.push(cand);
    k = k > 0 ? -k : -k + 1;
  }
  for (let i = set.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [set[i], set[j]] = [set[j], set[i]];
  }
  return { stem, options: set, correctIndex: set.indexOf(answer), explanation, difficulty, expectedSeconds };
}
const near = (n: number, deltas: number[]) => deltas.map((d) => fmt(n + d));
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

type Gen = (r: Rng) => GenQuestion;

export const GENERATORS: Record<string, Gen> = {
  percentage: (r) => {
    const v = int(r, 0, 2);
    if (v === 0) {
      const p = pick(r, [12, 15, 18, 24, 35, 45, 60, 75]);
      const n = int(r, 4, 40) * 20;
      const a = (p * n) / 100;
      return mcq(r, fmt(a), near(a, [p, -p, a * 0.1, 10]), `What is ${p}% of ${n}?`, `${p}% of ${n} = ${p}/100 × ${n} = ${fmt(a)}.`, 1, 30);
    }
    if (v === 1) {
      const a = pick(r, [10, 20, 25, 30, 40]);
      const b = pick(r, [10, 20, 25, 30]);
      const net = a - b - (a * b) / 100;
      const ans = `${net >= 0 ? "Increase" : "Decrease"} of ${fmt(Math.abs(net))}%`;
      return mcq(r, ans, [`${net >= 0 ? "Increase" : "Decrease"} of ${fmt(Math.abs(a - b))}%`, `No change`, `${net >= 0 ? "Decrease" : "Increase"} of ${fmt(Math.abs(net))}%`],
        `A price is increased by ${a}% and then decreased by ${b}%. What is the net effect?`,
        `Net change = a − b − ab/100 = ${a} − ${b} − ${a}×${b}/100 = ${fmt(net)}%.`, 2, 45);
    }
    const p = pick(r, [20, 25, 50, 60]);
    const less = (p / (100 + p)) * 100;
    return mcq(r, `${fmt(less)}%`, [`${p}%`, `${fmt(less + 5)}%`, `${fmt(p / 2)}%`],
      `A's salary is ${p}% more than B's. By what percent is B's salary less than A's?`,
      `If B = 100, A = ${100 + p}. B is less by ${p}/${100 + p} × 100 = ${fmt(less)}%.`, 3, 50);
  },
  profitLoss: (r) => {
    const v = int(r, 0, 1);
    if (v === 0) {
      const cp = int(r, 8, 60) * 25;
      const p = pick(r, [10, 12, 15, 20, 25, 30]);
      const sp = cp * (1 + p / 100);
      return mcq(r, fmt(sp), near(sp, [cp * 0.05, -cp * 0.05, cp * 0.1]), `An article bought for ₹${cp} is sold at a profit of ${p}%. What is the selling price (₹)?`, `SP = CP × (100 + P)/100 = ${cp} × ${100 + p}/100 = ₹${fmt(sp)}.`, 1, 35);
    }
    const mp = int(r, 4, 30) * 100;
    const d = pick(r, [10, 15, 20, 25]);
    const cp = mp * (1 - d / 100) / 1.2;
    if (!Number.isInteger(cp)) return GENERATORS.profitLoss(r);
    return mcq(r, fmt(cp), near(cp, [mp * 0.05, -mp * 0.05, 100]),
      `The marked price of a phone is ₹${mp}. After a ${d}% discount the shopkeeper still gains 20%. What is the cost price (₹)?`,
      `SP = ${mp} × ${(100 - d) / 100} = ${fmt(mp * (1 - d / 100))}. CP = SP / 1.2 = ₹${fmt(cp)}.`, 3, 60);
  },
  ratio: (r) => {
    const a = int(r, 2, 7);
    let b = int(r, 2, 9);
    if (gcd(a, b) !== 1 || a === b) b = a + 1;
    const unit = int(r, 5, 40) * 10;
    const total = (a + b) * unit;
    return mcq(r, fmt(b * unit), [fmt(a * unit), fmt(b * unit + unit), fmt(total / 2)],
      `₹${total} is divided between P and Q in the ratio ${a}:${b}. What is Q's share (₹)?`,
      `Q = ${b}/${a + b} × ${total} = ₹${fmt(b * unit)}.`, 1, 35);
  },
  average: (r) => {
    const n = int(r, 5, 12);
    const avg = int(r, 30, 70);
    const add = int(r, avg + 10, avg + 60);
    const newAvg = (n * avg + add) / (n + 1);
    if (!Number.isInteger(newAvg)) return GENERATORS.average(r);
    return mcq(r, fmt(add), near(add, [newAvg - avg, -(newAvg - avg), n]), `The average of ${n} numbers is ${avg}. When one more number is added, the average becomes ${fmt(newAvg)}. What number was added?`,
      `Added number = new sum − old sum = ${n + 1}×${fmt(newAvg)} − ${n}×${avg} = ${(n + 1) * newAvg} − ${n * avg} = ${add}.`, 2, 45);
  },
  interest: (r) => {
    if (r() < 0.5) {
      const p = int(r, 4, 40) * 500;
      const rate = pick(r, [4, 5, 6, 8, 10, 12]);
      const t = int(r, 2, 5);
      const si = (p * rate * t) / 100;
      return mcq(r, fmt(si), near(si, [p * 0.02, -p * 0.02, (p * rate) / 100]), `Find the simple interest on ₹${p} at ${rate}% per annum for ${t} years (₹).`, `SI = P×R×T/100 = ${p}×${rate}×${t}/100 = ₹${fmt(si)}.`, 1, 35);
    }
    const p = pick(r, [5000, 8000, 10000, 12000, 16000, 20000]);
    const rate = pick(r, [5, 10, 20]);
    const ci = p * ((1 + rate / 100) ** 2 - 1);
    const si = (p * rate * 2) / 100;
    return mcq(r, fmt(ci), [fmt(si), fmt(ci + p * 0.01), fmt(ci - p * 0.005)], `What is the compound interest on ₹${p} at ${rate}% per annum for 2 years, compounded annually (₹)?`,
      `CI = P[(1 + R/100)² − 1] = ${p} × [${fmt((1 + rate / 100) ** 2)} − 1] = ₹${fmt(ci)}.`, 2, 50);
  },
  timeWork: (r) => {
    const pairs = [[10, 15, 6], [12, 24, 8], [20, 30, 12], [6, 12, 4], [15, 30, 10], [18, 36, 12], [24, 40, 15], [10, 40, 8]];
    const [a, b, t] = pick(r, pairs);
    return mcq(r, fmt(t), near(t, [2, -2, 4]), `A can finish a job in ${a} days and B in ${b} days. Working together, in how many days will they finish it?`,
      `Together per day = 1/${a} + 1/${b} = 1/${t}, so ${t} days.`, 2, 45);
  },
  tsd: (r) => {
    if (r() < 0.5) {
      const kmph = pick(r, [36, 54, 72, 90, 108]);
      const len = int(r, 10, 40) * 10;
      const t = len / (kmph * 5 / 18);
      if (!Number.isInteger(t)) return GENERATORS.tsd(r);
      return mcq(r, fmt(t), near(t, [2, -2, 5]), `A train ${len} m long runs at ${kmph} km/h. How many seconds does it take to cross a pole?`, `${kmph} km/h = ${fmt(kmph * 5 / 18)} m/s. Time = ${len} / ${fmt(kmph * 5 / 18)} = ${fmt(t)} s.`, 2, 45);
    }
    const s1 = pick(r, [40, 60, 30]);
    const s2 = pick(r, [60, 40, 20, 45]);
    const avg = (2 * s1 * s2) / (s1 + s2);
    return mcq(r, fmt(avg), [fmt((s1 + s2) / 2), fmt(avg + 2), fmt(avg - 3)], `A car goes from X to Y at ${s1} km/h and returns at ${s2} km/h. What is its average speed for the round trip (km/h)?`,
      `For equal distances, average speed = 2ab/(a+b) = 2×${s1}×${s2}/${s1 + s2} = ${fmt(avg)} km/h.`, 3, 50);
  },
  numberSystem: (r) => {
    const v = int(r, 0, 1);
    if (v === 0) {
      const a = pick(r, [12, 18, 24, 36, 48]);
      const b = pick(r, [16, 30, 20, 42, 60]);
      const g = gcd(a, b);
      const l = (a * b) / g;
      return mcq(r, fmt(l), [fmt(g), fmt(a * b), fmt(l * 2)], `What is the LCM of ${a} and ${b}?`, `HCF(${a}, ${b}) = ${g}. LCM = ${a}×${b}/${g} = ${l}.`, 1, 35);
    }
    const base = int(r, 12, 99);
    const pow = int(r, 21, 99);
    const cycle = [1, 2, 3, 4].map((k) => (base % 10) ** k % 10);
    const unit = cycle[(pow - 1) % 4];
    return mcq(r, String(unit), ["0", "1", "5", "9", "3", "7"].filter((x) => x !== String(unit)).slice(0, 3), `What is the unit digit of ${base}^${pow}?`,
      `Unit digits of ${base % 10}^n repeat as ${cycle.join(", ")}. ${pow} mod 4 = ${pow % 4 || 4} → ${unit}.`, 2, 40);
  },
  simplification: (r) => {
    const a = int(r, 12, 48);
    const b = int(r, 2, 9);
    const c = int(r, 3, 15);
    const d = int(r, 2, 6);
    const ans = a * b - c * d + b;
    return mcq(r, fmt(ans), near(ans, [d, -b, 10]), `Simplify: ${a} × ${b} − ${c} × ${d} + ${b}`, `BODMAS: ${a * b} − ${c * d} + ${b} = ${ans}.`, 1, 30);
  },
  mixture: (r) => {
    const cheap = pick(r, [20, 30, 40]);
    const dear = cheap + pick(r, [20, 30, 40]);
    const mean = cheap + (dear - cheap) * pick(r, [0.25, 0.5, 0.75]);
    const a = dear - mean;
    const b = mean - cheap;
    const g = gcd(a, b);
    const ans = `${a / g}:${b / g}`;
    return mcq(r, ans, [`${b / g}:${a / g}`, "1:1", `${a / g + 1}:${b / g}`], `In what ratio must rice at ₹${cheap}/kg be mixed with rice at ₹${dear}/kg to get a mixture worth ₹${mean}/kg?`,
      `Alligation: (${dear} − ${mean}) : (${mean} − ${cheap}) = ${a}:${b} = ${ans}.`, 2, 50);
  },
  algebra: (r) => {
    const k = int(r, 3, 9);
    const ans = k * k - 2;
    return mcq(r, fmt(ans), [fmt(k * k), fmt(k * k + 2), fmt(2 * k)], `If x + 1/x = ${k}, what is x² + 1/x²?`, `(x + 1/x)² = x² + 1/x² + 2 → ${k * k} − 2 = ${ans}.`, 2, 40);
  },
  mensuration: (r) => {
    if (r() < 0.5) {
      const rad = pick(r, [7, 14, 21, 28, 35]);
      const area = (22 / 7) * rad * rad;
      return mcq(r, fmt(area), [fmt(2 * (22 / 7) * rad), fmt(area * 2), fmt(area / 2)], `Find the area of a circle of radius ${rad} cm (use π = 22/7), in cm².`, `Area = πr² = 22/7 × ${rad}² = ${fmt(area)} cm².`, 1, 35);
    }
    const a = int(r, 3, 12);
    return mcq(r, fmt(6 * a * a), [fmt(a ** 3), fmt(4 * a * a), fmt(12 * a)], `What is the total surface area of a cube of edge ${a} cm (cm²)?`, `TSA = 6a² = 6 × ${a * a} = ${6 * a * a} cm².`, 1, 30);
  },
  trigonometry: (r) => {
    const items: [string, string, string[], string][] = [
      ["sin 30° + cos 60°", "1", ["1/2", "√3/2", "0"], "sin 30° = cos 60° = 1/2, so the sum is 1."],
      ["tan 45° × cot 45°", "1", ["0", "√3", "2"], "tan 45° = cot 45° = 1."],
      ["sin² 37° + cos² 37°", "1", ["0", "2", "sin 74°"], "sin²θ + cos²θ = 1 for every θ."],
      ["sec² 60° − tan² 60°", "1", ["3", "4", "2"], "sec²θ − tan²θ = 1."],
      ["2 sin 30° cos 30°", "√3/2", ["1/2", "1", "√3"], "2 sinθ cosθ = sin 2θ = sin 60° = √3/2."],
      ["cos 0° + sin 90°", "2", ["1", "0", "√2"], "cos 0° = sin 90° = 1."],
    ];
    const [e, a, d, ex] = pick(r, items);
    return mcq(r, a, d, `Find the value of ${e}.`, ex, 2, 35);
  },
  geometry: (r) => {
    const n = int(r, 5, 12);
    const interior = ((n - 2) * 180) / n;
    return mcq(r, `${fmt(interior)}°`, [`${fmt(360 / n)}°`, `${fmt(interior + 10)}°`, `${fmt((n - 2) * 180)}°`], `What is each interior angle of a regular polygon with ${n} sides?`,
      `Each interior angle = (n − 2) × 180° / n = ${(n - 2) * 180}/${n} = ${fmt(interior)}°.`, 2, 40);
  },
  dataInterpretation: (r) => {
    const base = int(r, 20, 60) * 10;
    const vals = [base, base + int(r, 2, 8) * 10, base + int(r, 5, 14) * 10, base + int(r, 8, 20) * 10];
    const yrs = ["2021", "2022", "2023", "2024"];
    const table = yrs.map((y, i) => `${y}: ${vals[i]}`).join(" | ");
    if (r() < 0.5) {
      const inc = ((vals[3] - vals[0]) / vals[0]) * 100;
      return mcq(r, `${fmt(inc)}%`, [`${fmt(inc + 5)}%`, `${fmt(inc - 4)}%`, `${fmt(((vals[3] - vals[0]) / vals[3]) * 100)}%`],
        `Units sold by a company (in thousands): ${table}. By what percent did sales grow from 2021 to 2024?`, `(${vals[3]} − ${vals[0]}) / ${vals[0]} × 100 = ${fmt(inc)}%.`, 3, 70);
    }
    const avg = vals.reduce((a, b) => a + b, 0) / 4;
    return mcq(r, fmt(avg), near(avg, [10, -10, 25]), `Units sold by a company (in thousands): ${table}. What is the average annual sale (thousands)?`, `Sum = ${vals.reduce((a, b) => a + b, 0)}; ÷ 4 = ${fmt(avg)}.`, 2, 60);
  },
  numberSeries: (r) => {
    const v = int(r, 0, 3);
    let seq: number[];
    let next: number;
    let rule: string;
    if (v === 0) {
      const s = int(r, 2, 20), d = int(r, 3, 13);
      seq = [0, 1, 2, 3, 4].map((i) => s + i * d); next = s + 5 * d; rule = `add ${d} each time`;
    } else if (v === 1) {
      const s = int(r, 2, 5), m = pick(r, [2, 3]);
      seq = [0, 1, 2, 3, 4].map((i) => s * m ** i); next = s * m ** 5; rule = `multiply by ${m}`;
    } else if (v === 2) {
      const s = int(r, 2, 8);
      seq = [0, 1, 2, 3, 4].map((i) => (s + i) ** 2); next = (s + 5) ** 2; rule = `consecutive squares from ${s}²`;
    } else {
      const s = int(r, 3, 12), d = int(r, 2, 4);
      seq = [s]; for (let i = 1; i < 5; i++) seq.push(seq[i - 1] + d * i); next = seq[4] + d * 5; rule = `differences increase by ${d} (${d}, ${2 * d}, ${3 * d}, …)`;
    }
    return mcq(r, fmt(next), near(next, [1, -2, 4]), `Find the next number: ${seq.join(", ")}, ?`, `Pattern: ${rule}. Next = ${next}.`, v >= 2 ? 3 : 2, 45);
  },
  quadratic: (r) => {
    const x1 = int(r, 1, 9), x2 = int(r, 1, 9), y1 = int(r, -9, -1) * (r() < 0.5 ? -1 : 1), y2 = int(r, 1, 9);
    const xs = [x1, x2], ys = [y1, y2];
    const rel = Math.min(...xs) > Math.max(...ys) ? "x > y" : Math.max(...xs) < Math.min(...ys) ? "x < y" : Math.min(...xs) >= Math.max(...ys) ? "x ≥ y" : Math.max(...xs) <= Math.min(...ys) ? "x ≤ y" : "Relationship cannot be established";
    const eq = (a: number, b: number, v: string) => `${v}² ${-(a + b) >= 0 ? "+" : "−"} ${Math.abs(a + b)}${v} ${a * b >= 0 ? "+" : "−"} ${Math.abs(a * b)} = 0`;
    return mcq(r, rel, ["x > y", "x < y", "x ≥ y", "x ≤ y", "Relationship cannot be established"].filter((o) => o !== rel),
      `I. ${eq(x1, x2, "x")}   II. ${eq(y1, y2, "y")}. Which relation holds?`, `Roots: x = ${x1}, ${x2}; y = ${y1}, ${y2}. So: ${rel}.`, 3, 60);
  },
  probability: (r) => {
    const red = int(r, 2, 7), blue = int(r, 2, 7);
    const g = gcd(red, red + blue);
    const ans = `${red / g}/${(red + blue) / g}`;
    const g2 = gcd(blue, red + blue);
    return mcq(r, ans, [`${blue / g2}/${(red + blue) / g2}`, `1/${red + blue}`, `${red}/${blue}`], `A bag has ${red} red and ${blue} blue balls. One ball is drawn at random. What is the probability that it is red?`,
      `P(red) = favourable/total = ${red}/${red + blue}${g > 1 ? ` = ${ans}` : ""}.`, 1, 30);
  },
  codingDecoding: (r) => {
    const words = ["CAT", "DOG", "SUN", "PEN", "BOOK", "GAME", "TRAIN", "PLANE", "LEAF", "ROAD"];
    const k = int(r, 1, 3);
    const [w1, w2] = [pick(r, words), pick(r, words)];
    if (w1 === w2) return GENERATORS.codingDecoding(r);
    const enc = (w: string, s: number) => w.split("").map((c) => String.fromCharCode(((c.charCodeAt(0) - 65 + s + 26) % 26) + 65)).join("");
    return mcq(r, enc(w2, k), [enc(w2, k + 1), enc(w2, k - 1 || -1), enc(w2, k).split("").reverse().join("")], `If ${w1} is coded as ${enc(w1, k)}, how is ${w2} coded?`,
      `Each letter moves ${k} place${k > 1 ? "s" : ""} forward: ${w2} → ${enc(w2, k)}.`, 1, 40);
  },
  analogy: (r) => {
    const f = pick(r, [
      { name: "cube", fn: (n: number) => n ** 3 },
      { name: "square", fn: (n: number) => n ** 2 },
      { name: "square + 1", fn: (n: number) => n ** 2 + 1 },
      { name: "n × (n + 1)", fn: (n: number) => n * (n + 1) },
    ]);
    const a = int(r, 2, 6);
    let b = int(r, 3, 9);
    if (b === a) b++;
    return mcq(r, fmt(f.fn(b)), near(f.fn(b), [1, -1, b]), `${a} : ${f.fn(a)} :: ${b} : ?`, `Rule: ${f.name}. ${b} → ${f.fn(b)}.`, 2, 35);
  },
  direction: (r) => {
    const [a, b, c] = pick(r, [[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17], [9, 12, 15]]);
    return mcq(r, `${c} km`, [`${a + b} km`, `${b - a} km`, `${c + 1} km`], `Ravi walks ${a} km north, turns right and walks ${b} km. How far is he from the starting point?`,
      `North then east form a right angle: √(${a}² + ${b}²) = ${c} km.`, 2, 40);
  },
  ranking: (r) => {
    const left = int(r, 5, 20), right = int(r, 5, 25);
    const total = left + right - 1;
    return mcq(r, String(total), [String(total + 1), String(total - 1), String(total + 2)], `In a row of students, Meena is ${left}th from the left and ${right}th from the right. How many students are in the row?`,
      `Total = left + right − 1 = ${left} + ${right} − 1 = ${total}.`, 1, 30);
  },
  alphabetSeries: (r) => {
    const start = int(r, 0, 8), step = int(r, 2, 4);
    const L = (i: number) => String.fromCharCode(65 + ((start + i * step) % 26));
    const seq = [0, 1, 2, 3].map(L);
    return mcq(r, L(4), [L(5), String.fromCharCode(L(4).charCodeAt(0) + 1 > 90 ? 65 : L(4).charCodeAt(0) + 1), L(3)], `Find the next letter: ${seq.join(", ")}, ?`, `Each letter skips ${step - 1} letter${step > 2 ? "s" : ""} (+${step}). Next is ${L(4)}.`, 1, 30);
  },
  oddOne: (r) => {
    const primes = [7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47];
    const opts = [...primes].sort(() => r() - 0.5).slice(0, 3);
    const odd = pick(r, [21, 27, 33, 39, 49, 51, 57]);
    return mcq(r, String(odd), opts.map(String), `Find the odd one out: ${[...opts, odd].sort((a, b) => a - b).join(", ")}`, `All except ${odd} are prime; ${odd} is composite.`, 1, 30);
  },
};

export function generate(key: string, count: number, seedKey: string): GenQuestion[] {
  const g = GENERATORS[key];
  if (!g) throw new Error(`Unknown generator ${key}`);
  const r = mulberry32(hashSeed(seedKey));
  const out: GenQuestion[] = [];
  const seen = new Set<string>();
  let guard = 0;
  while (out.length < count && guard++ < count * 20) {
    const q = g(r);
    if (seen.has(q.stem) || new Set(q.options).size !== 4 || q.correctIndex < 0) continue;
    seen.add(q.stem);
    out.push(q);
  }
  return out;
}
