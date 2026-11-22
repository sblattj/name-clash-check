import { describe, expect, test } from "bun:test";
import { join } from "node:path";

// Runs the real CLI entry point against the recorded cache only (--offline): any request
// that was not recorded throws, so these tests never touch the network.
const root = join(import.meta.dir, "..");
async function run(...names: string[]) {
  const p = Bun.spawn(["bun", "src/cli.ts", "--offline", "--cache", "test/fixtures/http", "--json", "-", ...names], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  if (code !== 0) throw new Error(`cli exit ${code}: ${err}`);
  return JSON.parse(out) as { name: string; verdict: string; reasons: string[]; domains: { domain: string; status: string }[] }[];
}

describe("cli on recorded fixtures", () => {
  test("control: Nike is blocked by a live USPTO mark", async () => {
    const [nike] = await run("Nike");
    expect(nike!.verdict).toBe("blocked");
    expect(nike!.reasons.join(" ")).toMatch(/NIKE/);
    expect(nike!.domains.find((d) => d.domain === "nike.com")?.status).toBe("taken");
  }, 30000);

  test("control: a made-up word is clear", async () => {
    const [z] = await run("Zqxvbloomtrak");
    expect(z!.verdict).toBe("clear");
  }, 30000);

  test("control: a one-letter misspelling of a fitness software mark is caution", async () => {
    const [m] = await run("Mindbodi");
    expect(m!.verdict).toBe("caution");
    expect(m!.reasons.join(" ")).toMatch(/MINDBODY/);
  }, 30000);

  test("a famous mark with its words swapped inside the name is not clear (BodyMindHub)", async () => {
    const [p] = await run("BodyMindHub");
    expect(["caution", "blocked"]).toContain(p!.verdict);
    expect(p!.reasons.join(" ")).toMatch(/MINDBODY/);
  }, 30000);
});
