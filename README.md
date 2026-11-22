# name-clash-check

Before you pick a name, see who already has it. Give it candidate names; for each one it checks:

- **US trademarks**: live marks in the Nice classes you choose (default 9, 41, 42, 44 for a
  fitness or software app), identical and similar (case, spacing, one or two letters off,
  sound-alike), plus identical marks in any other class.
- **App Store and Google Play**: apps already using the name, or a close title.
- **Domains**: `.com`, `.app`, `.fit`, `.co` by default (RDAP, then WHOIS, via
  [domainsweep](https://www.npmjs.com/package/domainsweep)).
- **Names and handles**: GitHub, npm, PyPI, Bluesky. Instagram, X and TikTok need a login to
  check, so you get a link to check by hand instead of a guess.

Each name gets one verdict:

| verdict | means |
|---|---|
| **blocked** | an identical live US mark in your classes |
| **caution** | a similar live mark, an identical mark in other classes, a store app with this name or a close one, or the trademark search did not answer |
| **clear** | the trademark search answered with nothing close, and no store clash |

A source that fails (error, rate limit, a page it can't read) is reported as `unknown`, never
as free. A name whose trademark search failed can't come out clear.

**This is a screening, not legal clearance.** It reads public search systems. It can miss
marks, unregistered (common-law) use, state registrations and non-US filings. Ask a trademark
attorney before you file or launch.

## Use

```bash
git clone https://github.com/sblattj/name-clash-check && cd name-clash-check
bun install
bun src/cli.ts "Rocket Ledger" Mindbodi Nike
bun src/cli.ts --file names.txt --html report.html --json report.json
bun src/cli.ts --classes 9,42 --tlds com,io,dev MyName
```

Options: `--classes`, `--tlds`, `--file`, `--json <path|->`, `--html <path>`, `--title`,
`--skip uspto,appstore,play,handles,domains,github,npm,pypi,bluesky`, `--cache <dir>`,
`--offline`, `--refresh`. Run `bun src/cli.ts --help` for details.

Responses are cached in `~/.cache/name-clash-check` (7 days for HTTP, 1 day for domains), so a
second run is instant and light on the services. Set `GITHUB_TOKEN` to lift GitHub's 60
requests an hour for anonymous lookups.

## Sources, and what is free and keyless

| source | how | key? |
|---|---|---|
| USPTO marks | the JSON backend behind the public [Trademark Search](https://tmsearch.uspto.gov) page | none |
| App Store | [iTunes Search API](https://performance-partners.apple.com/search-api) | none |
| Google Play | the public search page, which `play.google.com/robots.txt` allows; results parsed from its embedded data | none (best effort) |
| domains | RDAP via the [IANA bootstrap](https://data.iana.org/rdap/dns.json), WHOIS port 43 where a TLD has no RDAP | none |
| GitHub | `api.github.com/users/<name>` (users and orgs) | none (60/hour), optional token |
| npm, PyPI | `registry.npmjs.org/<name>`, `pypi.org/pypi/<name>/json` | none |
| Bluesky | `com.atproto.identity.resolveHandle` on the public AppView | none |

Notes on USPTO:

- The search backend has no published SLA and has moved before (the old `/api-v1-0-0/` path
  now returns 405). If it moves again, the tool reports `unknown`.
- The USPTO [terms of use](https://www.uspto.gov/terms-use-uspto-websites) say the online
  databases are not meant for bulk downloads, and that unusually high access volume can get an
  IP blocked. This tool makes two searches per name, at least 2 seconds apart, and caches them.
  For bulk work, use the [trademark bulk data](https://www.uspto.gov/trademarks/apply/check-status-view-documents/trademark-bulk-data)
  products instead.
- The [TSDR API](https://developer.uspto.gov/api-catalog) (case status and documents) now
  needs a free API key from a USPTO account, so this tool does not use it.

Rate limits: at least 2 s between USPTO requests, 3 s for iTunes (Apple documents about 20
calls a minute), 2.5 s for Play and 1 s for GitHub. Requests that get 429 or 5xx back off and
retry, and are never cached.

## How "similar" is decided

The USPTO query asks for the spaced and joined spellings as phrases, the phonetic field, a
prefix and a fuzzy match, filtered to live marks in your classes. The field names follow the
query the search page builds, as documented in the MIT-licensed
[foreverworks/mcps trademarks server](https://github.com/foreverworks/mcps/tree/main/servers/trademarks).
Each returned mark is then compared locally (`src/similar.ts`):

- **exact**: identical once case, spaces and punctuation are dropped (`&` reads as "and").
- **near**: within 1 edit (2 for names of 8+ letters), the same Double Metaphone sound, or the
  mark contains the name as whole words (`NIKE AIR` for "Nike").

Store titles use the same comparison. An app titled "Name: tagline" counts as an exact use.

## Tests

`bun test` runs offline against recorded responses in `test/fixtures/http`. An unrecorded
request is an error, so the tests can't reach the network. The controls go through the real
CLI: `Nike` must come back **blocked**, a made-up word **clear**, `Mindbodi` **caution**
(one letter from a fitness software mark), and `BodyMindHub` **caution** (MINDBODY with its
words swapped). Re-record with `bun run record`.

## Prior art

- [namae](https://github.com/uetchy/namae): a web app across many registries and stores; the
  Play parsing idea comes from it. No trademark search.
- [calldibs](https://github.com/avigoldman/dibs): a CLI with many platforms; the trademark check
  is a manual link.
- [Namera](https://github.com/solozerolabs/Namera): a Python CLI; trademark lookups go to a
  hosted database and come back taken/available, without classes.
- [foreverworks trademarks MCP](https://github.com/foreverworks/mcps/tree/main/servers/trademarks):
  thorough USPTO and EUIPO search for AI assistants; covers trademarks only.

## License

MIT
