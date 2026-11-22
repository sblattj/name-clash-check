import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CachedFetcher } from "../src/http.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "ncc-http-"));

describe("CachedFetcher", () => {
  test("offline mode throws on a cache miss instead of touching the network", async () => {
    let calls = 0;
    const f = new CachedFetcher({ cacheDir: tmp(), mode: "offline", rawFetch: async () => { calls++; return { status: 200, text: "x" }; } });
    await expect(f.request({ method: "GET", url: "https://example.test/a" })).rejects.toThrow(/offline cache miss/);
    expect(calls).toBe(0);
  });

  test("a live response is cached and replayed offline", async () => {
    const dir = tmp();
    const live = new CachedFetcher({ cacheDir: dir, mode: "live", rawFetch: async () => ({ status: 200, text: "hello" }) });
    expect((await live.request({ method: "GET", url: "https://example.test/b" })).text).toBe("hello");
    const off = new CachedFetcher({ cacheDir: dir, mode: "offline", rawFetch: async () => { throw new Error("network"); } });
    expect((await off.request({ method: "GET", url: "https://example.test/b" })).text).toBe("hello");
  });

  test("transform is applied before caching", async () => {
    const dir = tmp();
    const live = new CachedFetcher({ cacheDir: dir, mode: "live", rawFetch: async () => ({ status: 200, text: "a big page" }) });
    const r = await live.request({ method: "GET", url: "https://example.test/c" }, { transform: (t) => t.toUpperCase(), transformId: "up" });
    expect(r.text).toBe("A BIG PAGE");
    const off = new CachedFetcher({ cacheDir: dir, mode: "offline" });
    expect((await off.request({ method: "GET", url: "https://example.test/c" }, { transformId: "up" })).text).toBe("A BIG PAGE");
  });

  test("5xx and 429 answers are not cached", async () => {
    const dir = tmp();
    let n = 0;
    const live = new CachedFetcher({ cacheDir: dir, mode: "live", retries: 0, rawFetch: async () => { n++; return { status: n === 1 ? 429 : 200, text: String(n) }; } });
    expect((await live.request({ method: "GET", url: "https://example.test/d" })).status).toBe(429);
    expect((await live.request({ method: "GET", url: "https://example.test/d" })).text).toBe("2");
  });

  test("requests to one host are spaced by its minimum interval", async () => {
    const stamps: number[] = [];
    const f = new CachedFetcher({
      cacheDir: tmp(), mode: "refresh", minIntervalMs: { "slow.test": 120 },
      rawFetch: async () => { stamps.push(Date.now()); return { status: 200, text: "" }; },
    });
    await Promise.all([
      f.request({ method: "GET", url: "https://slow.test/1" }),
      f.request({ method: "GET", url: "https://slow.test/2" }),
      f.request({ method: "GET", url: "https://slow.test/3" }),
    ]);
    expect(stamps.length).toBe(3);
    expect(stamps[1]! - stamps[0]!).toBeGreaterThanOrEqual(110);
    expect(stamps[2]! - stamps[1]!).toBeGreaterThanOrEqual(110);
  });
});
