import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cachedDomainChecker } from "../src/sources/domains.ts";
import { OfflineCacheMiss } from "../src/http.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "ncc-domains-"));

describe("cachedDomainChecker (domainsweep result cache)", () => {
  test("offline: an unrecorded domain throws instead of touching the network", async () => {
    let calls = 0;
    const c = cachedDomainChecker(tmp(), "offline", undefined, async (d) => { calls++; return { domain: d, status: "taken", method: "dns", detail: "x", ms: 1 }; });
    await expect(c.check("nike.com")).rejects.toBeInstanceOf(OfflineCacheMiss);
    expect(calls).toBe(0);
  });
  test("a live answer is stored and replayed offline", async () => {
    const dir = tmp();
    let calls = 0;
    const lookup = async (d: string) => { calls++; return { domain: d, status: "available" as const, method: "rdap" as const, detail: "rdap 404", ms: 1 }; };
    expect(await cachedDomainChecker(dir, "live", undefined, lookup).check("zqxv.com")).toEqual({ status: "available", detail: "rdap 404" });
    expect(await cachedDomainChecker(dir, "offline", undefined, lookup).check("zqxv.com")).toEqual({ status: "available", detail: "rdap 404" });
    expect(calls).toBe(1);
  });
  test("a detail that already names its method is not prefixed twice", async () => {
    const lookup = async (d: string) => ({ domain: d, status: "taken" as const, method: "dns" as const, detail: "dns: 4 NS", ms: 1 });
    expect((await cachedDomainChecker(tmp(), "live", undefined, lookup).check("nike.com")).detail).toBe("dns: 4 NS");
  });
  test("unknown is not stored, so offline still misses", async () => {
    const dir = tmp();
    const lookup = async (d: string) => ({ domain: d, status: "unknown" as const, method: "whois" as const, detail: "timeout", ms: 1 });
    await cachedDomainChecker(dir, "live", undefined, lookup).check("zqxv.co");
    await expect(cachedDomainChecker(dir, "offline", undefined, lookup).check("zqxv.co")).rejects.toBeInstanceOf(OfflineCacheMiss);
  });
});
