import type { Fetcher, SourceResult } from "../types.ts";
import { OfflineCacheMiss } from "../http.ts";
import { classifyApps, type StoreApp } from "./stores.ts";

const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

/**
 * Google Play has no public search API. The search page (allowed by play.google.com/robots.txt)
 * embeds its results as JSON in AF_initDataCallback blocks. Each app sits in an array whose
 * element 0 is ["<package id>", 7], element 3 the title, 5 the category and 14 the developer.
 * Best effort: when Google changes the layout this returns [] and the caller reports "unknown".
 */
export function parsePlayApps(html: string): StoreApp[] {
  const out = new Map<string, StoreApp>();
  const re = /AF_initDataCallback\(\{key: 'ds:\d+'[\s\S]*?data:([\s\S]*?), sideChannel: \{\}\}\);<\/script>/g;
  for (const m of html.matchAll(re)) {
    let data: unknown;
    try {
      data = JSON.parse(m[1]!);
    } catch {
      continue;
    }
    const walk = (x: unknown, parent: unknown[] | null) => {
      if (!Array.isArray(x)) return;
      if (x.length === 2 && x[1] === 7 && typeof x[0] === "string" && /^[A-Za-z][\w]*(\.[\w]+)+$/.test(x[0]) && parent) {
        const title = parent[3];
        if (typeof title === "string" && !out.has(x[0])) {
          out.set(x[0], {
            id: x[0],
            title,
            category: typeof parent[5] === "string" ? parent[5] : undefined,
            developer: typeof parent[14] === "string" ? parent[14] : "",
            url: `https://play.google.com/store/apps/details?id=${x[0]}`,
          });
        }
      }
      for (const c of x) walk(c, x);
    };
    walk(data, null);
  }
  return [...out.values()];
}

export async function checkPlay(name: string, fetcher: Fetcher): Promise<SourceResult> {
  const url = `https://play.google.com/store/search?q=${encodeURIComponent(name)}&c=apps&hl=en&gl=US`;
  try {
    const res = await fetcher.request(
      { method: "GET", url, headers: { "User-Agent": BROWSER_UA, "Accept-Language": "en-US" } },
      // Cache only the parsed apps, not the 1+ MB page.
      { transform: (html) => JSON.stringify(parsePlayApps(html)), transformId: "play-apps-v1" },
    );
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    const apps = JSON.parse(res.text) as StoreApp[];
    if (!apps.length) return { source: "play", status: "unknown", hits: [], url, summary: "Play page held no parsable results (layout change or a block page); check by hand" };
    return classifyApps("play", name, apps, url);
  } catch (err) {
    if (err instanceof OfflineCacheMiss) throw err;
    return { source: "play", status: "unknown", hits: [], url, summary: `Play search failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}
