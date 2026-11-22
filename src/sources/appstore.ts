import type { Fetcher, SourceResult } from "../types.ts";
import { OfflineCacheMiss } from "../http.ts";
import { classifyApps, type StoreApp } from "./stores.ts";

/** iTunes Search API: public, keyless (https://performance-partners.apple.com/search-api). */
export async function checkAppStore(name: string, fetcher: Fetcher, country = "us"): Promise<SourceResult> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(name)}&entity=software&country=${country}&limit=50`;
  const searchUrl = `https://www.apple.com/us/search/${encodeURIComponent(name)}?src=serp`;
  try {
    // Keep only the fields read here; full results carry long descriptions.
    const slim = (t: string) => {
      const d = JSON.parse(t) as { results?: Record<string, unknown>[] };
      const keep = ["trackId", "trackName", "sellerName", "artistName", "primaryGenreName", "trackViewUrl"];
      return JSON.stringify({ results: d.results?.map((r) => Object.fromEntries(keep.map((k) => [k, r[k]]))) });
    };
    const res = await fetcher.request({ method: "GET", url }, { transform: slim, transformId: "itunes-slim-v1" });
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    const d = JSON.parse(res.text) as { results?: { trackId: number; trackName: string; sellerName?: string; artistName?: string; primaryGenreName?: string; trackViewUrl?: string }[] };
    if (!Array.isArray(d.results)) throw new Error("unexpected response shape");
    const apps: StoreApp[] = d.results.map((r) => ({ id: String(r.trackId), title: r.trackName, developer: r.sellerName ?? r.artistName ?? "", category: r.primaryGenreName, url: r.trackViewUrl?.replace(/\?.*$/, "") }));
    return classifyApps("appstore", name, apps, searchUrl);
  } catch (err) {
    if (err instanceof OfflineCacheMiss) throw err;
    return { source: "appstore", status: "unknown", hits: [], url: searchUrl, summary: `App Store search failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}
