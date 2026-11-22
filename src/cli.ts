#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CachedFetcher, type CacheMode } from "./http.ts";
import { cachedDomainChecker } from "./sources/domains.ts";
import { checkName, DEFAULT_TLDS, FITNESS_CLASSES } from "./check.ts";
import { renderHtml, renderText } from "./render.ts";
import type { NameReport } from "./types.ts";

const HELP = `name-clash-check: screen candidate names for trademark, app store, domain and handle clashes.

Usage: name-clash-check [options] <name> [<name> ...]

  --classes 9,41,42,44   Nice classes to search for live US marks (default: ${FITNESS_CLASSES.join(",")})
  --tlds com,app,fit,co  domains to check (default: ${DEFAULT_TLDS.join(",")})
  --file <path>          read more names from a file, one per line (# comments ok)
  --json <path|->        write the full reports as JSON ("-" = stdout, text goes to stderr)
  --html <path>          write a self-contained HTML report
  --title <text>         HTML page title
  --skip a,b             skip sources: uspto, appstore, play, handles, domains, github, npm, pypi, bluesky
  --cache <dir>          response cache (default: ~/.cache/name-clash-check)
  --offline              answer only from the cache; an unrecorded request is an error
  --refresh              ignore cached answers and fetch again
  -h, --help

Verdicts: blocked = identical live US mark in those classes; caution = similar mark, identical
mark in other classes, a store app with the name, or a trademark check that did not answer;
clear = none of those. This is a screening, not legal clearance.`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    classes: { type: "string" },
    tlds: { type: "string" },
    file: { type: "string" },
    json: { type: "string" },
    html: { type: "string" },
    title: { type: "string" },
    skip: { type: "string" },
    cache: { type: "string" },
    offline: { type: "boolean" },
    refresh: { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
});

const names = [...positionals];
if (values.file) {
  names.push(...readFileSync(values.file, "utf8").split("\n").map((l) => l.replace(/#.*/, "").trim()).filter(Boolean));
}
if (values.help || !names.length) {
  console.log(HELP);
  process.exit(values.help ? 0 : 1);
}

const list = (s: string | undefined) => (s ? s.split(",").map((x) => x.trim()).filter(Boolean) : undefined);
const classes = list(values.classes)?.map(Number) ?? FITNESS_CLASSES;
const tlds = list(values.tlds)?.map((t) => t.replace(/^\./, "").toLowerCase()) ?? DEFAULT_TLDS;
const mode: CacheMode = values.offline ? "offline" : values.refresh ? "refresh" : "live";
const cacheDir = values.cache ?? join(homedir(), ".cache", "name-clash-check");

const fetcher = new CachedFetcher({ cacheDir, mode });
const domains = cachedDomainChecker(cacheDir, mode);
const log = values.json === "-" ? (s: string) => console.error(s) : (s: string) => console.log(s);

const reports: NameReport[] = [];
for (const [i, name] of names.entries()) {
  if (names.length > 1) process.stderr.write(`[${i + 1}/${names.length}] ${name}\n`);
  reports.push(await checkName(name, { classes, tlds, fetcher, domains, skip: list(values.skip) }));
}

log(renderText(reports));
if (values.json) {
  const json = JSON.stringify(reports, null, 2);
  if (values.json === "-") process.stdout.write(json + "\n");
  else writeFileSync(values.json, json);
}
if (values.html) writeFileSync(values.html, renderHtml(reports, values.title));
