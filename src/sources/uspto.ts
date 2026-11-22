import type { Fetcher, Hit, SourceResult } from "../types.ts";
import { OfflineCacheMiss } from "../http.ts";
import { compact, compareName, levenshtein, spellings, swappedPairs } from "../similar.ts";

/**
 * USPTO Trademark Search (https://tmsearch.uspto.gov) is free and needs no account. Its page
 * queries this JSON backend; there is no published SLA, so a failure here is reported as
 * "unknown", never as clear. Field aliases (WM word mark, PM pseudo-mark, WMP5 phonetic form,
 * IC class as "009", LD live) follow the query the search page itself builds, as documented by
 * the MIT-licensed foreverworks/mcps trademarks server (src/infra/uspto/query.ts).
 */
export const TMSEARCH_URL = "https://tmsearch.uspto.gov/prod-stage-v1-0-0/tmsearch";

const FIELDS = ["id", "wordmark", "alive", "statusDescription", "registrationId", "internationalClass", "ownerName", "filedDate"];

export interface Mark {
  id?: string;
  wordmark?: string;
  alive?: boolean;
  statusDescription?: string;
  registrationId?: string;
  internationalClass?: string[];
  ownerName?: string[];
}

const pad = (n: number) => String(n).padStart(3, "0");

/** Live marks in `classes` that read, sound or spell like the name. */
export function usptoSearchBody(name: string, classes: number[]) {
  const forms = spellings(name).filter((s) => !s.includes("-"));
  const joined = compact(name);
  const should: unknown[] = [];
  for (const f of forms) {
    should.push({ match_phrase: { WM: { query: f, boost: 5 } } });
    should.push({ match_phrase: { PM: { query: f, boost: 3 } } });
  }
  should.push({ term: { WM: { value: joined, boost: 6 } } });
  should.push({ match_phrase_prefix: { WM: { query: forms[0], boost: 2 } } });
  should.push({ match_phrase: { WMP5: { query: joined } } });
  should.push({ match: { WM: { query: joined, fuzziness: "AUTO" } } });
  // the name's words in another order: BodyMindHub must find MINDBODY
  for (const p of swappedPairs(name)) {
    should.push({ term: { WM: { value: p.joined, boost: 4 } } });
    should.push({ match_phrase: { WM: { query: p.spaced, boost: 3 } } });
  }
  const filter: unknown[] = [{ term: { LD: "true" } }];
  if (classes.length) filter.push({ terms: { IC: classes.map(pad) } });
  return { query: { bool: { should, minimum_should_match: 1, filter } }, size: 100, from: 0, track_total_hits: true, _source: FIELDS };
}

/** Live marks identical to the name in ANY class (famous marks reach past their classes). */
export function usptoAnyClassBody(name: string) {
  const forms = spellings(name).filter((s) => !s.includes("-"));
  const should: unknown[] = forms.map((f) => ({ match_phrase: { WM: { query: f } } }));
  should.push({ term: { WM: { value: compact(name) } } });
  for (const p of swappedPairs(name)) {
    should.push({ term: { WM: { value: p.joined } } });
    should.push({ match_phrase: { WM: { query: p.spaced } } });
  }
  return { query: { bool: { should, minimum_should_match: 1, filter: [{ term: { LD: "true" } }] } }, size: 50, from: 0, track_total_hits: true, _source: FIELDS };
}

const classNums = (m: Mark) => (m.internationalClass ?? []).map((c) => Number(c.replace(/\D/g, ""))).filter((n) => !Number.isNaN(n));

function describe(m: Mark): string {
  const owner = (m.ownerName?.[0] ?? "").replace(/\s*\(.*$/, "");
  const cls = (m.internationalClass ?? []).join(", ");
  const reg = m.registrationId ? `reg ${m.registrationId}` : m.id ? `serial ${m.id}` : "";
  return [owner, cls, reg, m.statusDescription].filter(Boolean).join("; ");
}

const markUrl = (m: Mark) => (m.id ? `https://tsdr.uspto.gov/#caseNumber=${m.id}&caseType=SERIAL_NO&searchType=statusSearch` : undefined);

export function classifyMarks(name: string, inClass: Mark[], anyClass: Mark[], classes: number[]): SourceResult {
  const want = new Set(classes);
  const hits: Hit[] = [];
  const seen = new Set<string>();
  for (const m of inClass) {
    if (!m.wordmark || m.alive === false) continue;
    if (classes.length && !classNums(m).some((c) => want.has(c))) continue;
    const kind = compareName(name, m.wordmark);
    if (!kind) continue;
    const key = m.id ?? `${m.wordmark}|${describe(m)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({ kind, label: m.wordmark, detail: describe(m), url: markUrl(m) });
  }
  for (const m of anyClass) {
    if (!m.wordmark || m.alive === false) continue;
    const key = m.id ?? `${m.wordmark}|${describe(m)}`;
    if (seen.has(key)) continue;
    if (compareName(name, m.wordmark) !== "exact") continue;
    seen.add(key);
    hits.push({ kind: "other-class", label: m.wordmark, detail: describe(m), url: markUrl(m) });
  }
  const order = { exact: 0, near: 1, "other-class": 2 } as const;
  const dist = (h: Hit) => levenshtein(compact(name), compact(h.label));
  hits.sort((a, b) => order[a.kind] - order[b.kind] || dist(a) - dist(b));
  const exact = hits.filter((h) => h.kind === "exact");
  const near = hits.filter((h) => h.kind === "near");
  const other = hits.filter((h) => h.kind === "other-class");
  const cls = classes.map(pad).join("/");
  const url = `https://tmsearch.uspto.gov/search/search-results?query=${encodeURIComponent(name)}`;
  if (exact.length) {
    return { source: "uspto", status: "blocked", hits, url, summary: `${exact.length} identical live mark(s) in IC ${cls}, e.g. "${exact[0]!.label}" (${exact[0]!.detail})` };
  }
  if (near.length) {
    return { source: "uspto", status: "caution", hits, url, summary: `${near.length} similar live mark(s) in IC ${cls}, e.g. "${near[0]!.label}" (${near[0]!.detail})` };
  }
  if (other.length) {
    return { source: "uspto", status: "caution", hits, url, summary: `identical live mark(s) only outside IC ${cls}, e.g. "${other[0]!.label}" (${other[0]!.detail}); a famous mark can still block` };
  }
  return { source: "uspto", status: "clear", hits, url, summary: `no identical or similar live marks in IC ${cls}` };
}

async function search(fetcher: Fetcher, body: unknown): Promise<Mark[]> {
  const res = await fetcher.request({
    method: "POST",
    url: TMSEARCH_URL,
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: "https://tmsearch.uspto.gov",
      Referer: "https://tmsearch.uspto.gov/search/search-information",
    },
  });
  if (res.status !== 200) throw new Error(`tmsearch HTTP ${res.status}`);
  const d = JSON.parse(res.text) as { hits?: { hits?: { source?: Mark; _source?: Mark }[] } };
  if (!d.hits || !Array.isArray(d.hits.hits)) throw new Error("tmsearch: unexpected response shape");
  return d.hits.hits.map((h) => h.source ?? h._source ?? {});
}

export async function checkUspto(name: string, classes: number[], fetcher: Fetcher): Promise<SourceResult> {
  try {
    const inClass = await search(fetcher, usptoSearchBody(name, classes));
    const anyClass = await search(fetcher, usptoAnyClassBody(name));
    return classifyMarks(name, inClass, anyClass, classes);
  } catch (err) {
    if (err instanceof OfflineCacheMiss) throw err;
    return { source: "uspto", status: "unknown", hits: [], summary: `trademark search failed: ${err instanceof Error ? err.message : String(err)}`, url: "https://tmsearch.uspto.gov" };
  }
}
