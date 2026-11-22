import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Fetcher, HttpRequest, HttpResponse } from "./types.ts";

export type CacheMode =
  /** Use a fresh cache entry if there is one, else hit the network and store the answer. */
  | "live"
  /** Cache only. A miss throws: this is how the tests prove they never touch the network. */
  | "offline"
  /** Always hit the network, then store the answer. */
  | "refresh";

/** Thrown in offline mode for an unrecorded request. Sources rethrow it so a test fails loudly. */
export class OfflineCacheMiss extends Error {}

export const USER_AGENT = "name-clash-check/0.1 (local name screening CLI)";

/** Default spacing between two requests to the same host, in ms. */
export const DEFAULT_MIN_INTERVAL_MS: Record<string, number> = {
  "tmsearch.uspto.gov": 2000,
  "itunes.apple.com": 3000, // Apple documents roughly 20 calls a minute
  "play.google.com": 2500,
  "api.github.com": 1000,
  "registry.npmjs.org": 250,
  "pypi.org": 250,
  "public.api.bsky.app": 500,
};

export interface CachedFetcherOptions {
  cacheDir: string;
  mode: CacheMode;
  /** Max age of a cache entry in live mode. Default 7 days. */
  ttlMs?: number;
  minIntervalMs?: Record<string, number>;
  /** Retries on 429/5xx/network errors, with backoff. Default 2. */
  retries?: number;
  timeoutMs?: number;
  rawFetch?: (req: HttpRequest, timeoutMs: number) => Promise<HttpResponse>;
}

interface CacheEntry {
  method: string;
  url: string;
  body?: string;
  transformId?: string;
  status: number;
  text: string;
  savedAt: string;
}

async function defaultRawFetch(req: HttpRequest, timeoutMs: number): Promise<HttpResponse> {
  const res = await fetch(req.url, {
    method: req.method,
    body: req.body,
    headers: { "User-Agent": USER_AGENT, ...req.headers },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });
  return { status: res.status, text: await res.text() };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const cacheable = (status: number) => (status >= 200 && status < 300) || status === 404 || status === 400;

export class CachedFetcher implements Fetcher {
  private readonly o: Required<Omit<CachedFetcherOptions, "rawFetch">> & { rawFetch: NonNullable<CachedFetcherOptions["rawFetch"]> };
  /** Per host: the earliest time the next request may start. */
  private readonly nextSlot = new Map<string, number>();

  constructor(opts: CachedFetcherOptions) {
    this.o = {
      ttlMs: 7 * 24 * 3600 * 1000,
      minIntervalMs: DEFAULT_MIN_INTERVAL_MS,
      retries: 2,
      timeoutMs: 30000,
      rawFetch: defaultRawFetch,
      ...opts,
    };
  }

  private keyFor(req: HttpRequest, transformId?: string): { dir: string; file: string } {
    const host = new URL(req.url).host;
    const h = createHash("sha256").update(`${req.method} ${req.url}\n${req.body ?? ""}\n${transformId ?? ""}`).digest("hex").slice(0, 20);
    const dir = join(this.o.cacheDir, host);
    return { dir, file: join(dir, `${h}.json`) };
  }

  private async waitTurn(host: string): Promise<void> {
    const gap = this.o.minIntervalMs[host] ?? 0;
    const now = Date.now();
    const slot = Math.max(now, this.nextSlot.get(host) ?? 0);
    this.nextSlot.set(host, slot + gap);
    if (slot > now) await sleep(slot - now);
  }

  async request(req: HttpRequest, opts: { transform?: (text: string) => string; transformId?: string } = {}): Promise<HttpResponse> {
    const { dir, file } = this.keyFor(req, opts.transformId);
    if (this.o.mode !== "refresh" && existsSync(file)) {
      const e = JSON.parse(readFileSync(file, "utf8")) as CacheEntry;
      const fresh = this.o.mode === "offline" || Date.now() - Date.parse(e.savedAt) < this.o.ttlMs;
      if (fresh) return { status: e.status, text: e.text };
    }
    if (this.o.mode === "offline") {
      throw new OfflineCacheMiss(`offline cache miss: ${req.method} ${req.url}${req.body ? ` body=${req.body.slice(0, 120)}` : ""}`);
    }

    const host = new URL(req.url).host;
    let last: HttpResponse | undefined;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.o.retries; attempt++) {
      if (attempt > 0) await sleep(1500 * 2 ** (attempt - 1));
      await this.waitTurn(host);
      try {
        last = await this.o.rawFetch(req, this.o.timeoutMs);
        lastErr = undefined;
        if (last.status !== 429 && last.status < 500) break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (!last) throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));

    let text = last.text;
    if (opts.transform && last.status >= 200 && last.status < 300) text = opts.transform(text);
    const out = { status: last.status, text };
    if (cacheable(last.status)) {
      mkdirSync(dir, { recursive: true });
      const entry: CacheEntry = { method: req.method, url: req.url, body: req.body, transformId: opts.transformId, status: out.status, text, savedAt: new Date().toISOString() };
      writeFileSync(file, JSON.stringify(entry, null, 1));
    }
    return out;
  }
}
