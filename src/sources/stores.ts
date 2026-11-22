import type { Hit, SourceResult } from "../types.ts";
import { compareName } from "../similar.ts";

export interface StoreApp {
  id: string;
  title: string;
  developer: string;
  category?: string;
  url?: string;
}

/** The part of an app title before a ":" or " - " tagline, which is the name the store enforces. */
export function leadingName(title: string): string {
  return title.split(/\s*[:|–—]\s*|\s+-\s+/)[0] ?? title;
}

/**
 * Classify store search results against the name.
 * blocked: an app already uses the exact name (both stores reject a duplicate app name, so you
 *          would need a different title or a tagline);
 * caution: a similar title; clear: nothing close in the results read.
 */
export function classifyApps(source: string, name: string, apps: StoreApp[], searchUrl: string): SourceResult {
  const hits: Hit[] = [];
  for (const a of apps) {
    const lead = compareName(name, leadingName(a.title));
    const kind = lead === "exact" ? "exact" : compareName(name, a.title) ?? lead;
    if (!kind) continue;
    hits.push({ kind, label: a.title, detail: [a.developer, a.category].filter(Boolean).join("; "), url: a.url });
  }
  hits.sort((x, y) => (x.kind === "exact" ? 0 : 1) - (y.kind === "exact" ? 0 : 1));
  const exact = hits.filter((h) => h.kind === "exact");
  if (exact.length) return { source, status: "blocked", hits, url: searchUrl, summary: `${exact.length} app(s) named exactly this, e.g. "${exact[0]!.label}" by ${exact[0]!.detail}` };
  if (hits.length) return { source, status: "caution", hits, url: searchUrl, summary: `${hits.length} similar app title(s), e.g. "${hits[0]!.label}" by ${hits[0]!.detail}` };
  return { source, status: "clear", hits, url: searchUrl, summary: `no same or similar titles in the top ${apps.length} results` };
}
