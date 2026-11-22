import type { SourceResult, Verdict } from "./types.ts";

const LABEL: Record<string, string> = { uspto: "USPTO", appstore: "App Store", play: "Google Play" };

/**
 * Combine per-source results into one call.
 * blocked: an identical live US mark in the chosen classes.
 * caution: a similar mark, an identical mark in other classes, an app already using the name
 *          or something close, or the trademark check did not answer.
 * clear:   the trademark check answered with nothing close and no store clash.
 * Store sources that could not answer are listed but do not stop a clear.
 */
export function decide(sources: SourceResult[]): { verdict: Verdict; reasons: string[] } {
  const reasons: string[] = [];
  const tm = sources.find((s) => s.source === "uspto");
  let verdict: Verdict = "clear";
  const bump = (v: Verdict) => {
    const rank = { clear: 0, caution: 1, blocked: 2 } as const;
    if (rank[v] > rank[verdict]) verdict = v;
  };
  if (!tm || tm.status === "unknown") {
    bump("caution");
    reasons.push(`trademark check did not answer${tm ? `: ${tm.summary}` : ""}`);
  } else if (tm.status === "blocked") {
    bump("blocked");
    reasons.push(`USPTO: ${tm.summary}`);
  } else if (tm.status === "caution") {
    bump("caution");
    reasons.push(`USPTO: ${tm.summary}`);
  }
  for (const s of sources) {
    if (s.source === "uspto") continue;
    const label = LABEL[s.source] ?? s.source;
    if (s.status === "blocked" || s.status === "caution") {
      bump("caution");
      reasons.push(`${label}: ${s.summary}`);
    } else if (s.status === "unknown") {
      reasons.push(`${label} not checked: ${s.summary}`);
    }
  }
  if (verdict === "clear" && !reasons.length) reasons.push("no identical or similar live US marks in the chosen classes, and no store app with this name");
  return { verdict, reasons };
}
