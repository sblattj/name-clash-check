/** Per-source outcome. "unknown" = the source could not answer (error, rate limit, parse failure). */
export type SourceStatus = "clear" | "caution" | "blocked" | "unknown" | "manual";

/** Final call per name. Only three values: an unanswered trademark check can never be "clear". */
export type Verdict = "clear" | "caution" | "blocked";

export type HitKind = "exact" | "near" | "other-class";

export interface Hit {
  kind: HitKind;
  /** The clashing thing as the source spells it: a word mark, an app title, a handle. */
  label: string;
  /** Short extra context: owner, classes, developer, registration number. */
  detail?: string;
  url?: string;
}

export interface SourceResult {
  source: string;
  status: SourceStatus;
  /** One line a person can read: why this status. */
  summary: string;
  hits: Hit[];
  /** Where a person can check this by hand. */
  url?: string;
}

export type Availability = "available" | "taken" | "unknown";

export interface DomainRow {
  domain: string;
  tld: string;
  status: Availability;
  detail: string;
}

export interface HandleRow {
  platform: string;
  handle: string;
  status: Availability | "manual";
  detail: string;
  url: string;
}

export interface NameReport {
  name: string;
  /** Lowercase letters and digits only: the form used for handles, packages and domains. */
  compact: string;
  verdict: Verdict;
  reasons: string[];
  sources: SourceResult[];
  domains: DomainRow[];
  handles: HandleRow[];
  checkedAt: string;
}

export interface HttpRequest {
  method: "GET" | "POST";
  url: string;
  body?: string;
  headers?: Record<string, string>;
}

export interface HttpResponse {
  status: number;
  text: string;
}

export interface Fetcher {
  /**
   * `transform` runs on a 2xx body before it is cached, so a big page can be stored as just the
   * part a source reads. The cache key includes `transformId`.
   */
  request(req: HttpRequest, opts?: { transform?: (text: string) => string; transformId?: string }): Promise<HttpResponse>;
}

export interface DomainChecker {
  check(domain: string): Promise<{ status: Availability; detail: string }>;
}

export interface CheckOptions {
  /** Nice classes as numbers, e.g. [9, 41, 42, 44]. */
  classes: number[];
  /** TLDs without dots, in display order. */
  tlds: string[];
  fetcher: Fetcher;
  domains: DomainChecker;
  /** Skip a source by id (uspto, appstore, play, github, npm, pypi, bluesky, domains). */
  skip?: string[];
  now?: () => Date;
}
