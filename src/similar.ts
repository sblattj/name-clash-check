import { doubleMetaphone } from "double-metaphone";

/** Lowercase letters and digits only. "&" reads as "and", the way trademark examiners read it. */
export function compact(s: string): string {
  return s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
}

/** Split a name into lowercase words: on spaces, punctuation and camelCase boundaries. */
export function words(s: string): string[] {
  return s
    .replace(/&/g, " and ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** The case and spacing variants worth searching: spaced, joined, hyphenated. */
export function spellings(s: string): string[] {
  const w = words(s);
  const out = new Set<string>([w.join(" "), w.join(""), w.join("-")]);
  return [...out].filter(Boolean);
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
    }
    prev = cur;
  }
  return prev[b.length]!;
}

/** Edits allowed before two compacted names stop counting as "near". */
export function nearBudget(len: number): number {
  return len >= 8 ? 2 : len >= 4 ? 1 : 0;
}

/**
 * One name is the other with its two halves swapped, as a whole or inside a longer name:
 * "BodyMindHub" holds MINDBODY turned around. Each half must be 3+ letters and the
 * swapped form 6+, so "Oxbow" vs "BOWOX" does not count.
 */
export function swapped(a: string, b: string): boolean {
  for (const [x, y] of [[a, b], [b, a]] as const) {
    if (x.length < 6) continue;
    for (let k = 3; k <= x.length - 3; k++) {
      const r = x.slice(k) + x.slice(0, k);
      if (r !== x && y.includes(r)) return true;
    }
  }
  return false;
}

/** Every ordered pair of distinct words (3+ letters each) in swapped order, joined and spaced. */
export function swappedPairs(s: string): { joined: string; spaced: string }[] {
  const w = [...new Set(words(s).filter((x) => x.length >= 3))].slice(0, 6);
  const out: { joined: string; spaced: string }[] = [];
  for (let i = 0; i < w.length; i++) {
    for (let j = 0; j < w.length; j++) {
      if (i === j) continue;
      // the pair as it already reads in the name is covered by the normal spellings
      if (j === i + 1) continue;
      out.push({ joined: w[i]! + w[j]!, spaced: `${w[i]} ${w[j]}` });
    }
  }
  return out;
}

function soundsAlike(a: string, b: string): boolean {
  if (a.length < 3 || b.length < 3) return false;
  if (Math.abs(a.length - b.length) > 2) return false;
  const [pa, sa] = doubleMetaphone(a);
  const [pb, sb] = doubleMetaphone(b);
  return pa === pb || pa === sb || sa === pb;
}

/**
 * How close a found label (a word mark, an app title, a handle) is to the candidate name.
 * exact: identical once case, spacing and punctuation are dropped.
 * near: a small edit distance, the same sound (Double Metaphone), or the label contains the
 *       name as a run of whole words ("NIKE AIR" for "Nike"), or one holds the other with its
 *       halves swapped ("BodyMindHub" for "MINDBODY").
 */
export function compareName(name: string, label: string): "exact" | "near" | null {
  const n = compact(name);
  const l = compact(label);
  if (!n || !l) return null;
  if (n === l) return "exact";
  if (levenshtein(n, l) <= nearBudget(n.length)) return "near";
  if (soundsAlike(n, l)) return "near";
  // one form is the other plus a short ending ("RIVERBEND" vs "River Benders", a plural, "-er"):
  // a stem of 6+ letters with at most 3 letters added reads as the same brand.
  const [short, long] = n.length <= l.length ? [n, l] : [l, n];
  if (short.length >= 6 && long.length - short.length <= 3 && long.startsWith(short)) return "near";
  if (swapped(n, l)) return "near";
  const nw = words(name).join(" ");
  const lw = ` ${words(label).join(" ")} `;
  if (n.length >= 3 && lw.includes(` ${nw} `)) return "near";
  // joined name against a spaced label: "RocketLedger" vs "ROCKET LEDGER PRO"
  const lwords = words(label);
  for (let i = 0; i < lwords.length; i++) {
    let acc = "";
    for (let j = i; j < lwords.length && acc.length < n.length; j++) {
      acc += lwords[j];
      if (acc === n && n.length >= 3) return "near";
    }
  }
  return null;
}
