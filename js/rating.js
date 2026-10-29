// Glicko-2 rating for the reader, one rating per skill. Items carry a fixed
// rating derived from their difficulty level, so beating hard items quickly
// and correctly is the only way up.

const SCALE = 173.7178;
const TAU = 0.5;
const ITEM_RD = 80;
export const RD_FLOOR = 60;      // keep the rating responsive after many games
export const LEVELS = 7;

export const itemRating = level => 1125 + 125 * level;           // L1=1250 … L7=2000
export const levelFor = r => Math.max(1, Math.min(LEVELS, Math.round((r - 1125) / 125)));

function g(phi) { return 1 / Math.sqrt(1 + 3 * phi * phi / (Math.PI * Math.PI)); }
function E(mu, muj, phij) { return 1 / (1 + Math.exp(-g(phij) * (mu - muj))); }

// One-game Glicko-2 update. score in [0, 1] (fractional scores allowed).
export function update(player, oppRating, score, oppRd = ITEM_RD) {
  const mu = (player.r - 1500) / SCALE;
  const phi = player.rd / SCALE;
  const sigma = player.vol;
  const muj = (oppRating - 1500) / SCALE;
  const phij = oppRd / SCALE;

  const gj = g(phij);
  const Ej = E(mu, muj, phij);
  const v = 1 / (gj * gj * Ej * (1 - Ej));
  const delta = v * gj * (score - Ej);

  // volatility (Illinois algorithm)
  const a = Math.log(sigma * sigma);
  const f = x => {
    const ex = Math.exp(x);
    return (ex * (delta * delta - phi * phi - v - ex)) / (2 * Math.pow(phi * phi + v + ex, 2)) - (x - a) / (TAU * TAU);
  };
  let A = a;
  let B;
  if (delta * delta > phi * phi + v) B = Math.log(delta * delta - phi * phi - v);
  else {
    let k = 1;
    while (f(a - k * TAU) < 0) k++;
    B = a - k * TAU;
  }
  let fA = f(A), fB = f(B);
  for (let i = 0; i < 60 && Math.abs(B - A) > 1e-6; i++) {
    const C = A + (A - B) * fA / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) { A = B; fA = fB; } else { fA = fA / 2; }
    B = C; fB = fC;
  }
  const sigmaP = Math.exp(A / 2);
  const phiStar = Math.sqrt(phi * phi + sigmaP * sigmaP);
  const phiP = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muP = mu + phiP * phiP * gj * (score - Ej);

  return {
    r: muP * SCALE + 1500,
    rd: Math.max(RD_FLOOR, phiP * SCALE),
    vol: Math.min(0.12, sigmaP),
    n: (player.n || 0) + 1,
  };
}

export const expected = (r, level) => 1 / (1 + Math.pow(10, (itemRating(level) - r) / 400));

// ---- scoring: correctness dominates, speed is a bounded bonus ----

export const parseTargetSec = (level, tasks) => (9 + 2 * level) * tasks;
export const functionTargetSec = level => 8 + 1.5 * level;
export const readTargetWpm = level => 300 - 15 * (level - 1);

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export function scoreParse(correct, total, ms, level) {
  const acc = correct / total;
  const speed = clamp(parseTargetSec(level, total) / (ms / 1000), 0, 1);
  return { score: acc * (0.7 + 0.3 * speed), acc, speed };
}

export function scoreFunction(ok, ms, level) {
  const speed = clamp(functionTargetSec(level) / (ms / 1000), 0, 1);
  return { score: ok ? 0.7 + 0.3 * speed : 0, acc: ok ? 1 : 0, speed };
}

// comprehension = MC share plus gist (0-3) weighted as one question
export function comprehension(mcCorrect, mcTotal, gist) {
  if (gist == null) return mcCorrect / mcTotal;
  return (mcCorrect + gist / 3) / (mcTotal + 1);
}

export function scoreRead(comp, wpm, level) {
  const speed = clamp(wpm / readTargetWpm(level), 0, 1);
  return { score: comp * (0.7 + 0.3 * speed), speed };
}

// Pick the level to serve: mostly at rating, sometimes one above (stretch).
export function pickLevel(rating, stretch = 0.3) {
  const base = levelFor(rating);
  return Math.min(LEVELS, base + (Math.random() < stretch ? 1 : 0));
}
