import { describe, expect, test } from "bun:test";
import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { usptoSearchBody, usptoAnyClassBody, classifyMarks } from "../src/sources/uspto.ts";
import { parsePlayApps } from "../src/sources/play.ts";
import { decide } from "../src/verdict.ts";
import type { SourceResult } from "../src/types.ts";

describe("uspto query", () => {
  test("filters to live marks in the requested classes, zero padded", () => {
    const body = usptoSearchBody("Nike", [9, 41, 42, 44]) as any;
    const filter = JSON.stringify(body.query.bool.filter);
    expect(filter).toContain('"LD":"true"');
    expect(filter).toContain('["009","041","042","044"]');
  });
  test("asks for both the spaced and the joined spelling", () => {
    const s = JSON.stringify(usptoSearchBody("Mind Body", [9]));
    expect(s).toContain('"mind body"');
    expect(s).toContain('"mindbody"');
  });
  test("also asks for the words in swapped order, so MINDBODY is found for BodyMindHub", () => {
    const s = JSON.stringify(usptoSearchBody("BodyMindHub", [41]));
    expect(s).toContain('"mindbody"');
    expect(s).toContain('"mind body"');
    const any = JSON.stringify(usptoAnyClassBody("Body Mind Hub"));
    expect(any).toContain('"mindbody"');
  });
});

describe("classifyMarks", () => {
  test("identical live mark in a requested class blocks", () => {
    const r = classifyMarks("Nike", [{ wordmark: "NIKE", alive: true, internationalClass: ["IC 009"], ownerName: ["Nike, Inc."], registrationId: "1" }], [], [9, 41]);
    expect(r.status).toBe("blocked");
  });
  test("near live mark in class is caution", () => {
    const r = classifyMarks("Mindbodi", [{ wordmark: "MINDBODY", alive: true, internationalClass: ["IC 042"], ownerName: ["Mindbody"], registrationId: "2" }], [], [42]);
    expect(r.status).toBe("caution");
  });
  test("identical mark only in other classes is caution", () => {
    const r = classifyMarks("Acme", [], [{ wordmark: "ACME", alive: true, internationalClass: ["IC 025"], ownerName: ["x"], registrationId: "3" }], [9]);
    expect(r.status).toBe("caution");
    expect(r.hits[0]!.kind).toBe("other-class");
  });
  test("nothing similar is clear", () => {
    expect(classifyMarks("BodyMindHub", [{ wordmark: "MINDBODY", alive: true, internationalClass: ["IC 041"], ownerName: ["x"], registrationId: "4" }], [], [41]).status).toBe("caution");
    expect(classifyMarks("Zqxvbloomtrak", [{ wordmark: "KNOCK KNOCK", alive: true, internationalClass: ["IC 009"] }], [], [9]).status).toBe("clear");
  });
});

describe("parsePlayApps", () => {
  test("reads titles and developers from a recorded Play search page", () => {
    const html = gunzipSync(readFileSync(new URL("./fixtures/play-search-mindbody.html.gz", import.meta.url))).toString("utf8");
    const apps = parsePlayApps(html);
    expect(apps.length).toBeGreaterThan(5);
    const biz = apps.find((a) => a.id === "com.mindbodyonline.express");
    expect(biz?.title).toBe("Mindbody Business");
    expect(biz?.developer).toBe("MINDBODY Inc");
  });
  test("a page with no embedded data yields no apps (caller reports unknown)", () => {
    expect(parsePlayApps("<html>captcha</html>")).toEqual([]);
  });
});

describe("decide", () => {
  const src = (source: string, status: SourceResult["status"]): SourceResult => ({ source, status, summary: `${source} ${status}`, hits: [] });
  test("a failed trademark check is never clear", () => {
    const d = decide([src("uspto", "unknown"), src("appstore", "clear")]);
    expect(d.verdict).toBe("caution");
    expect(d.reasons.join(" ")).toMatch(/trademark check did not answer/);
  });
  test("uspto blocked makes the name blocked", () => {
    expect(decide([src("uspto", "blocked"), src("appstore", "clear")]).verdict).toBe("blocked");
  });
  test("an exact store app makes a clear trademark result caution", () => {
    expect(decide([src("uspto", "clear"), src("appstore", "blocked")]).verdict).toBe("caution");
  });
  test("all clear is clear", () => {
    expect(decide([src("uspto", "clear"), src("appstore", "clear"), src("play", "unknown")]).verdict).toBe("clear");
  });
});
