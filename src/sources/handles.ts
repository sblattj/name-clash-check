import type { Fetcher, HandleRow } from "../types.ts";
import { OfflineCacheMiss } from "../http.ts";

type Probe = { platform: string; url: (h: string) => string; page: (h: string) => string; headers?: Record<string, string>; read: (status: number, text: string) => HandleRow["status"] | null };

/**
 * Keyless, logged-out lookups only. Each returns taken/available from a documented public API;
 * anything else (403, 429, an unexpected body) is "unknown", never "available".
 */
const PROBES: Probe[] = [
  {
    platform: "github",
    url: (h) => `https://api.github.com/users/${h}`, // covers user and org logins
    page: (h) => `https://github.com/${h}`,
    headers: { Accept: "application/vnd.github+json", ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) },
    read: (s) => (s === 200 ? "taken" : s === 404 ? "available" : null),
  },
  {
    platform: "npm",
    url: (h) => `https://registry.npmjs.org/${h}`,
    page: (h) => `https://www.npmjs.com/package/${h}`,
    read: (s) => (s === 200 ? "taken" : s === 404 ? "available" : null),
  },
  {
    platform: "pypi",
    url: (h) => `https://pypi.org/pypi/${h}/json`,
    page: (h) => `https://pypi.org/project/${h}/`,
    read: (s) => (s === 200 ? "taken" : s === 404 ? "available" : null),
  },
  {
    platform: "bluesky",
    url: (h) => `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${h}.bsky.social`,
    page: (h) => `https://bsky.app/profile/${h}.bsky.social`,
    read: (s, t) => (s === 200 && t.includes('"did"') ? "taken" : s === 400 && t.includes("Unable to resolve handle") ? "available" : null),
  },
];

/** Platforms whose public profile check needs a login or breaks their terms when scripted. */
const MANUAL: { platform: string; page: (h: string) => string }[] = [
  { platform: "instagram", page: (h) => `https://www.instagram.com/${h}/` },
  { platform: "x", page: (h) => `https://x.com/${h}` },
  { platform: "tiktok", page: (h) => `https://www.tiktok.com/@${h}` },
];

export async function checkHandles(handle: string, fetcher: Fetcher, skip: string[] = []): Promise<HandleRow[]> {
  const rows = await Promise.all(
    PROBES.filter((p) => !skip.includes(p.platform)).map(async (p): Promise<HandleRow> => {
      try {
        const res = await fetcher.request({ method: "GET", url: p.url(handle), headers: p.headers });
        const status = p.read(res.status, res.text);
        return { platform: p.platform, handle, status: status ?? "unknown", detail: status ? `HTTP ${res.status}` : `unexpected HTTP ${res.status}`, url: p.page(handle) };
      } catch (err) {
    if (err instanceof OfflineCacheMiss) throw err;
        return { platform: p.platform, handle, status: "unknown", detail: err instanceof Error ? err.message : String(err), url: p.page(handle) };
      }
    }),
  );
  for (const m of MANUAL) rows.push({ platform: m.platform, handle, status: "manual", detail: "needs a login to check; open the link", url: m.page(handle) });
  return rows;
}
