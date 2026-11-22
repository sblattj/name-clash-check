import { join } from "node:path";
import { createChecker } from "domainsweep";
import type { DomainChecker, DomainRow } from "../types.ts";
import { OfflineCacheMiss, type CacheMode } from "../http.ts";

const MODE = { live: "use", refresh: "refresh", offline: "only" } as const;

/**
 * Domain availability through domainsweep (DNS for a fast "taken", then RDAP via the IANA
 * bootstrap, then WHOIS port 43 for TLDs without RDAP such as .co). domainsweep's own result
 * cache keeps finished answers in <cacheDir>/domainsweep/results, so tests replay them offline.
 */
export function cachedDomainChecker(cacheDir: string, mode: CacheMode, ttlMs = 24 * 3600 * 1000, lookup?: Parameters<typeof createChecker>[0]["lookup"]): DomainChecker {
  const c = createChecker({ timeoutMs: 12000, cacheDir: join(cacheDir, "domainsweep"), results: { ttlMs, mode: MODE[mode] }, lookup });
  return {
    async check(domain) {
      const r = await c.check(domain);
      if (mode === "offline" && r.method === "cache") throw new OfflineCacheMiss(`offline cache miss: domain ${domain}`);
      return { status: r.status, detail: r.detail.startsWith(`${r.method}`) ? r.detail : `${r.method}: ${r.detail}` };
    },
  };
}

export async function checkDomains(label: string, tlds: string[], checker: DomainChecker): Promise<DomainRow[]> {
  const rows: DomainRow[] = [];
  // Two at a time: registries rate-limit WHOIS hard.
  for (let i = 0; i < tlds.length; i += 2) {
    const batch = tlds.slice(i, i + 2);
    rows.push(
      ...(await Promise.all(
        batch.map(async (tld): Promise<DomainRow> => {
          const domain = `${label}.${tld}`;
          try {
            const r = await checker.check(domain);
            return { domain, tld, status: r.status, detail: r.detail };
          } catch (err) {
            if (err instanceof OfflineCacheMiss) throw err;
            return { domain, tld, status: "unknown", detail: err instanceof Error ? err.message : String(err) };
          }
        }),
      )),
    );
  }
  return rows;
}
