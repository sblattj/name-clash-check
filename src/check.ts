import type { CheckOptions, NameReport, SourceResult } from "./types.ts";
import { compact } from "./similar.ts";
import { checkUspto } from "./sources/uspto.ts";
import { checkAppStore } from "./sources/appstore.ts";
import { checkPlay } from "./sources/play.ts";
import { checkHandles } from "./sources/handles.ts";
import { checkDomains } from "./sources/domains.ts";
import { decide } from "./verdict.ts";

export const FITNESS_CLASSES = [9, 41, 42, 44];
export const DEFAULT_TLDS = ["com", "app", "fit", "co"];

/** Check one name against every enabled source. Sources run in parallel (different hosts). */
export async function checkName(name: string, o: CheckOptions): Promise<NameReport> {
  const skip = new Set(o.skip ?? []);
  const c = compact(name);
  const jobs: Promise<SourceResult>[] = [];
  if (!skip.has("uspto")) jobs.push(checkUspto(name, o.classes, o.fetcher));
  if (!skip.has("appstore")) jobs.push(checkAppStore(name, o.fetcher));
  if (!skip.has("play")) jobs.push(checkPlay(name, o.fetcher));
  const [sources, handles, domains] = await Promise.all([
    Promise.all(jobs),
    skip.has("handles") ? Promise.resolve([]) : checkHandles(c, o.fetcher, [...skip]),
    skip.has("domains") ? Promise.resolve([]) : checkDomains(c, o.tlds, o.domains),
  ]);
  const { verdict, reasons } = decide(sources);
  return { name, compact: c, verdict, reasons, sources, domains, handles, checkedAt: (o.now?.() ?? new Date()).toISOString() };
}
