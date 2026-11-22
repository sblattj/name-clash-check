import type { NameReport } from "./types.ts";

const MARK: Record<string, string> = { clear: "ok", caution: "!!", blocked: "XX", unknown: "??", manual: "--", available: "free", taken: "taken" };

export function renderText(reports: NameReport[]): string {
  const out: string[] = [];
  for (const r of reports) {
    out.push(`${r.name}  ${r.verdict.toUpperCase()}`);
    for (const why of r.reasons) out.push(`  - ${why}`);
    for (const s of r.sources) out.push(`  ${s.source.padEnd(9)} ${s.status.padEnd(8)} ${s.summary}`);
    if (r.domains.length) out.push(`  domains   ${r.domains.map((d) => `${d.domain} ${MARK[d.status] ?? d.status}`).join("  ")}`);
    if (r.handles.length) out.push(`  handles   ${r.handles.map((h) => `${h.platform}:${h.status === "manual" ? "check by hand" : MARK[h.status] ?? h.status}`).join("  ")}`);
    out.push("");
  }
  const n = (v: string) => reports.filter((r) => r.verdict === v).length;
  out.push(`${reports.length} name(s): ${n("clear")} clear, ${n("caution")} caution, ${n("blocked")} blocked. A screening, not legal clearance.`);
  return out.join("\n");
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const link = (text: string, url?: string) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(text)}</a>` : esc(text));

/** A self-contained HTML report: one card per name, verdict first. */
export function renderHtml(reports: NameReport[], title = "Name clash report"): string {
  const cards = reports
    .map((r) => {
      const srcRows = r.sources
        .map((s) => {
          const hits = s.hits.slice(0, 6).map((h) => `<li><span class="k">${esc(h.kind)}</span> ${link(h.label, h.url)}${h.detail ? ` <span class="d">${esc(h.detail)}</span>` : ""}</li>`).join("");
          return `<tr><th>${link(s.source, s.url)}</th><td><span class="pill ${s.status}">${esc(s.status)}</span></td><td>${esc(s.summary)}${hits ? `<ul>${hits}</ul>` : ""}</td></tr>`;
        })
        .join("");
      const doms = r.domains.map((d) => `<span class="pill ${d.status}" title="${esc(d.detail)}">.${esc(d.tld)} ${esc(d.status)}</span>`).join(" ");
      const hands = r.handles.map((h) => `<a class="pill ${h.status}" href="${esc(h.url)}" target="_blank" rel="noopener" title="${esc(h.detail)}">${esc(h.platform)} ${esc(h.status === "manual" ? "check" : h.status)}</a>`).join(" ");
      return `<section class="card ${r.verdict}"><header><h2>${esc(r.name)}</h2><span class="verdict ${r.verdict}">${esc(r.verdict)}</span></header>
<ul class="why">${r.reasons.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
<table>${srcRows}<tr><th>domains</th><td></td><td>${doms}</td></tr><tr><th>handles</th><td></td><td>${hands}</td></tr></table></section>`;
    })
    .join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>
body{font:15px/1.45 -apple-system,system-ui,sans-serif;margin:0;background:#f6f7f9;color:#1d232b}
main{max-width:1000px;margin:0 auto;padding:24px}
h1{font-size:22px;margin:0 0 4px}.note{color:#5b6573;margin:0 0 20px}
.card{background:#fff;border-radius:10px;padding:16px 18px;margin:0 0 14px;border-left:6px solid #bbb;box-shadow:0 1px 2px #0001}
.card.clear{border-color:#1f9d55}.card.caution{border-color:#d69e2e}.card.blocked{border-color:#c53030}
header{display:flex;align-items:center;gap:12px}h2{margin:0;font-size:19px}
.verdict{font-weight:700;text-transform:uppercase;font-size:12px;padding:3px 8px;border-radius:99px;color:#fff;background:#888}
.verdict.clear{background:#1f9d55}.verdict.caution{background:#d69e2e}.verdict.blocked{background:#c53030}
.why{margin:8px 0;padding-left:18px;color:#374151}
table{border-collapse:collapse;width:100%;font-size:14px}th{text-align:left;width:90px;vertical-align:top;padding:6px 8px 6px 0}
td{vertical-align:top;padding:6px 8px 6px 0;border-top:1px solid #eef0f3}td ul{margin:4px 0 0;padding-left:18px}
.pill{display:inline-block;font-size:12px;padding:1px 7px;border-radius:99px;background:#e5e7eb;color:#1d232b;text-decoration:none;margin:1px 0}
.pill.clear,.pill.available{background:#d1fae5}.pill.caution{background:#fef3c7}.pill.blocked,.pill.taken{background:#fee2e2}.pill.unknown{background:#e0e7ff}.pill.manual{background:#f3f4f6}
.k{font-size:11px;text-transform:uppercase;color:#6b7280}.d{color:#6b7280}
</style></head><body><main><h1>${esc(title)}</h1>
<p class="note">Checked ${esc(reports[0]?.checkedAt.slice(0, 10) ?? "")}. A screening, not legal clearance: it reads public search systems and can miss marks, unregistered (common-law) use and non-US filings.</p>
${cards}</main></body></html>`;
}
