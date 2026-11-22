import { describe, expect, test } from "bun:test";
import { compact, spellings, levenshtein, compareName } from "../src/similar.ts";

describe("compact", () => {
  test("drops case, spaces and punctuation", () => {
    expect(compact("Rocket Ledger")).toBe("rocketledger");
    expect(compact("MIND & BODY")).toBe("mindandbody");
    expect(compact("Bright-Spark!")).toBe("brightspark");
  });
});

describe("spellings", () => {
  test("two-word name yields spaced, joined and hyphenated forms", () => {
    const s = spellings("Rocket Ledger");
    expect(s).toContain("rocket ledger");
    expect(s).toContain("rocketledger");
    expect(s).toContain("rocket-ledger");
  });
  test("camel case is split into words", () => {
    expect(spellings("RocketLedger")).toContain("rocket ledger");
  });
});

describe("levenshtein", () => {
  test("counts edits", () => {
    expect(levenshtein("nike", "nike")).toBe(0);
    expect(levenshtein("mindbodi", "mindbody")).toBe(1);
    expect(levenshtein("kitten", "sitting")).toBe(3);
  });
});

describe("compareName", () => {
  test("identical after compaction is exact", () => {
    expect(compareName("Nike", "NIKE")).toBe("exact");
    expect(compareName("Mind Body", "MINDBODY")).toBe("exact");
  });
  test("a short suffix on a whole mark is near (RIVERBEND vs River Benders)", () => {
    expect(compareName("River Benders", "RIVERBEND")).toBe("near");
    expect(compareName("RiverBend", "RIVER BENDERS")).toBe("near");
  });
  test("a common short word as a prefix is not near", () => {
    expect(compareName("HarborLoop", "HARBOR")).toBeNull();
  });
  test("one letter off is near", () => {
    expect(compareName("Mindbodi", "MINDBODY")).toBe("near");
  });
  test("sounds alike is near", () => {
    expect(compareName("Nyke", "NIKE")).toBe("near");
  });
  test("mark that contains the name as words is near", () => {
    expect(compareName("Nike", "NIKE AIR")).toBe("near");
  });
  test("unrelated is null", () => {
    expect(compareName("Zqxvbloomtrak", "BLOOM")).toBeNull();
    expect(compareName("Nike", "KNOCK KNOCK")).toBeNull();
  });
  test("the mark's words swapped, inside a longer name, is near (MINDBODY vs BodyMindHub)", () => {
    expect(compareName("BodyMindHub", "MINDBODY")).toBe("near");
    expect(compareName("Body Mind Hub", "MIND BODY")).toBe("near");
    expect(compareName("bodymindhub", "MINDBODY")).toBe("near");
  });
  test("a name whose words are a mark's words swapped is near (BodyMind vs MIND BODY)", () => {
    expect(compareName("BodyMind", "MINDBODY")).toBe("near");
    expect(compareName("LedgerRocket", "ROCKET LEDGER PRO")).toBe("near");
  });
  test("a swap needs both halves to be 3+ letters", () => {
    expect(compareName("Zqxvbloomtrak", "TRAKZQXVBLOOM")).toBe("near");
    expect(compareName("HarborLoop", "LOOP")).toBeNull();
    expect(compareName("Oxbow", "BOWOX")).toBeNull();
  });
});
