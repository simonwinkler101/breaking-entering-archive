import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import associationData from "../data/archive-associations.json";
import archiveData from "../data/archive-data.json";
import siteSettings from "../data/site-settings.json";

type ArchiveKind = "Interview" | "Guest mix" | "Live" | "Broadcast" | "Special program";
type ArchiveAccess = "Public" | "RRR subscriber" | "Availability varies";

type ArchiveSource = {
  id: string;
  label: string;
  href: string;
  access: ArchiveAccess;
  duration: string;
  status: string;
};

type ArchiveEntry = {
  id: string;
  artist: string;
  title: string;
  kind: ArchiveKind;
  date: string;
  dateKey: string;
  year: number | null;
  duration: string;
  presenters: string;
  source: string;
  href: string;
  summary: string;
  transcript?: string;
  tags: string[];
  relatedIds?: string[];
  access: ArchiveAccess;
  sources: ArchiveSource[];
};

const archiveEntries = (archiveData.entries as unknown as ArchiveEntry[]).filter(
  (entry) => entry.kind !== "Broadcast",
);

const explicitAssociationLabels = new Map<string, Map<string, string>>();
for (const group of associationData.groups) {
  for (const entryId of group.entryIds) {
    const related = explicitAssociationLabels.get(entryId) ?? new Map<string, string>();
    for (const relatedId of group.entryIds) {
      if (relatedId !== entryId) related.set(relatedId, group.label);
    }
    explicitAssociationLabels.set(entryId, related);
  }
}

const filters = ["All", "Interview", "Guest mix", "Live", "Special program"] as const;
type Filter = (typeof filters)[number];
type Sort = "newest" | "oldest" | "artist";
type YearFilter = "All" | "Unknown" | `${number}`;

const PAGE_SIZE = siteSettings.layout.pageSize;
const archiveYears = [...new Set(
  archiveEntries.flatMap((entry) => (entry.year ? [entry.year] : [])),
)].sort((a, b) => b - a);

const hashForFilter = (filter: Filter) => {
  if (filter === "Interview") return "#interviews";
  if (filter === "Guest mix") return "#mixes";
  if (filter === "Live") return "#live";
  if (filter === "Special program") return "#programs";
  return "#archive";
};

const primaryActionLabel = (entry: ArchiveEntry) => {
  const href = entry.href.toLowerCase();
  if (href.includes("youtube.com")) return "Watch";
  return "Listen";
};

const genericArtists = new Set(["breaking entering"]);
const genericTags = new Set([
  "broadcast",
  "guest mix",
  "interview",
  "live",
  "live performance",
  "mixcloud",
  "special program",
  "subscriber archive",
  "video",
]);

const normalisePhrase = (value: string) =>
  value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

const includesPhrase = (value: string, phrase: string) =>
  phrase.length >= 4 && ` ${value} `.includes(` ${phrase} `);

type RelatedEntry = {
  entry: ArchiveEntry;
  score: number;
  dateDistance: number;
};

const scoreRelationship = (
  selected: ArchiveEntry,
  candidate: ArchiveEntry,
): RelatedEntry | null => {
  if (selected.id === candidate.id) return null;

  let score = 0;
  const hasEntryRelationship =
    selected.relatedIds?.includes(candidate.id) || candidate.relatedIds?.includes(selected.id);
  const isCuratedRelationship = Boolean(
    explicitAssociationLabels.get(selected.id)?.get(candidate.id) ||
    hasEntryRelationship,
  );
  if (isCuratedRelationship) score += 1000;

  const selectedArtist = normalisePhrase(selected.artist);
  const candidateArtist = normalisePhrase(candidate.artist);
  const selectedHasSpecificArtist = !genericArtists.has(selectedArtist);
  const candidateHasSpecificArtist = !genericArtists.has(candidateArtist);
  const selectedContext = normalisePhrase(
    [selected.artist, selected.title, selected.summary].join(" "),
  );
  const candidateContext = normalisePhrase(
    [candidate.artist, candidate.title, candidate.summary].join(" "),
  );

  if (
    selectedHasSpecificArtist &&
    candidateHasSpecificArtist &&
    selectedArtist === candidateArtist
  ) {
    score += 600;
  } else if (
    (selectedHasSpecificArtist && includesPhrase(candidateContext, selectedArtist)) ||
    (candidateHasSpecificArtist && includesPhrase(selectedContext, candidateArtist))
  ) {
    score += 260;
  }

  const selectedTags = new Set(selected.tags.filter((tag) => !genericTags.has(tag)));
  const sharedTags = candidate.tags.filter((tag) => selectedTags.has(tag) && !genericTags.has(tag));
  if (sharedTags.length > 0) {
    score += sharedTags.length * 24;
  }

  if (score === 0) return null;

  const dateDistance =
    selected.dateKey && candidate.dateKey
      ? Math.abs(Date.parse(selected.dateKey) - Date.parse(candidate.dateKey))
      : Number.MAX_SAFE_INTEGER;

  return { entry: candidate, score, dateDistance };
};

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <span aria-hidden="true">{diagonal ? "↗" : "→"}</span>;
}

function KindDot({ kind }: { kind: ArchiveKind | "All" }) {
  return <span className="kind-dot" data-kind={kind} aria-hidden="true" />;
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [yearFilter, setYearFilter] = useState<YearFilter>("All");
  const [sort, setSort] = useState<Sort>("newest");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<ArchiveEntry | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const archiveRef = useRef<HTMLElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = siteSettings.metadata.title;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", siteSettings.metadata.description);
  }, []);

  const closeEntry = () => {
    setSelected(null);
    setShowTranscript(false);
    window.history.replaceState(null, "", "#archive");
  };

  const openEntry = (entry: ArchiveEntry) => {
    setShowTranscript(false);
    setSelected(entry);
    window.history.replaceState(null, "", `#entry/${encodeURIComponent(entry.id)}`);
  };

  useEffect(() => {
    const syncViewFromHash = () => {
      if (window.location.hash.startsWith("#entry/")) {
        const entryId = decodeURIComponent(window.location.hash.slice("#entry/".length));
        const entry = archiveEntries.find((candidate) => candidate.id === entryId);
        if (entry) {
          setShowTranscript(false);
          setSelected(entry);
        }
        return;
      }

      setSelected(null);
      const hashFilter: Filter | null =
        window.location.hash === "#interviews"
          ? "Interview"
          : window.location.hash === "#mixes"
            ? "Guest mix"
            : window.location.hash === "#live"
              ? "Live"
              : window.location.hash === "#programs"
                ? "Special program"
                : window.location.hash === "#archive"
                  ? "All"
                  : null;
      if (hashFilter) {
        setQuery("");
        setFilter(hashFilter);
        setTagFilter(null);
        setYearFilter("All");
      }
      setVisibleCount(PAGE_SIZE);
    };

    syncViewFromHash();
    window.addEventListener("hashchange", syncViewFromHash);
    window.addEventListener("popstate", syncViewFromHash);
    return () => {
      window.removeEventListener("hashchange", syncViewFromHash);
      window.removeEventListener("popstate", syncViewFromHash);
    };
  }, []);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT";
      if (event.key === "/" && !isTyping) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", focusSearch);
    return () => document.removeEventListener("keydown", focusSearch);
  }, []);

  useEffect(() => {
    if (!selected) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeEntry();
    };
    document.addEventListener("keydown", closeOnEscape);
    document.body.classList.add("dialog-open");
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.classList.remove("dialog-open");
    };
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    const frame = window.requestAnimationFrame(() => {
      dialogRef.current?.scrollTo({ top: 0 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selected]);

  const results = useMemo(() => {
    const normalisedQuery = query.trim().toLocaleLowerCase();
    const matching = archiveEntries.filter((entry) => {
      const matchesFilter = filter === "All" || entry.kind === filter;
      const matchesYear =
        yearFilter === "All" ||
        (yearFilter === "Unknown" ? entry.year === null : entry.year === Number(yearFilter));
      const matchesTag = !tagFilter || entry.tags.includes(tagFilter);
      const searchText = [
        entry.artist,
        entry.title,
        entry.kind,
        entry.date,
        entry.presenters,
        entry.source,
        entry.summary,
        entry.transcript,
        entry.access,
        ...entry.sources.flatMap((source) => [source.label, source.access, source.status]),
        ...entry.tags,
      ]
        .join(" ")
        .toLocaleLowerCase();
      return (
        matchesFilter &&
        matchesYear &&
        matchesTag &&
        (!normalisedQuery || searchText.includes(normalisedQuery))
      );
    });

    return [...matching].sort((a, b) => {
      if (sort === "artist") return a.artist.localeCompare(b.artist);
      if (!a.dateKey && !b.dateKey) return a.artist.localeCompare(b.artist);
      if (!a.dateKey) return 1;
      if (!b.dateKey) return -1;
      if (sort === "oldest") return a.dateKey.localeCompare(b.dateKey);
      return b.dateKey.localeCompare(a.dateKey);
    });
  }, [filter, query, sort, tagFilter, yearFilter]);

  const visibleResults = results.slice(0, visibleCount);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    archiveRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const openArchiveView = (nextFilter: Filter) => {
    setQuery("");
    setFilter(nextFilter);
    setTagFilter(null);
    setYearFilter("All");
    setVisibleCount(PAGE_SIZE);
    setSelected(null);
    window.history.pushState(null, "", hashForFilter(nextFilter));
    window.setTimeout(
      () => archiveRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      0,
    );
  };

  const clearSearch = () => {
    setQuery("");
    setFilter("All");
    setTagFilter(null);
    setYearFilter("All");
    setVisibleCount(PAGE_SIZE);
    window.history.replaceState(null, "", "#archive");
  };

  const featuredMix =
    archiveEntries.find((entry) => entry.id === siteSettings.featured.entryId) ??
    archiveEntries.find((entry) => entry.kind === "Guest mix");
  const featuredHeading =
    featuredMix?.title.replace(
      /^RISING:\s*Breaking (?:&|and) Entering\s*[-–—:]\s*/i,
      "RISING: ",
    ) ?? "";
  const relatedEntries = useMemo(() => {
    if (!selected) return [];
    const candidates: RelatedEntry[] = [];
    for (const entry of archiveEntries) {
      const relationship = scoreRelationship(selected, entry);
      if (relationship) candidates.push(relationship);
    }
    return candidates
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.dateDistance - b.dateDistance ||
          b.entry.dateKey.localeCompare(a.entry.dateKey),
      )
      .slice(0, 3);
  }, [selected]);

  return (
    <main>
      <div className="landing" id="top">
        <header className="site-header shell">
          <a className="wordmark" href="#top" aria-label={siteSettings.wordmark.homeLabel}>
            <span>{siteSettings.wordmark.lineOne}</span>
            <span>{siteSettings.wordmark.lineTwo}</span>
            <small>{siteSettings.wordmark.label}</small>
          </a>
          <nav aria-label="Primary navigation">
            <button
              type="button"
              data-view="All"
              className={filter === "All" ? "active" : ""}
              aria-current={filter === "All" ? "page" : undefined}
              onClick={() => openArchiveView("All")}
            >
              Browse
            </button>
            <button
              type="button"
              data-view="Interview"
              className={filter === "Interview" ? "active" : ""}
              aria-current={filter === "Interview" ? "page" : undefined}
              onClick={() => openArchiveView("Interview")}
            >
              <KindDot kind="Interview" /> Interviews
            </button>
            <button
              type="button"
              data-view="Live"
              className={filter === "Live" ? "active" : ""}
              aria-current={filter === "Live" ? "page" : undefined}
              onClick={() => openArchiveView("Live")}
            >
              <KindDot kind="Live" /> Live
            </button>
            <button
              type="button"
              data-view="Guest mix"
              className={filter === "Guest mix" ? "active" : ""}
              aria-current={filter === "Guest mix" ? "page" : undefined}
              onClick={() => openArchiveView("Guest mix")}
            >
              <KindDot kind="Guest mix" /> Mixes
            </button>
          </nav>
        </header>

        <section className="hero shell">
          <p className="eyebrow">{siteSettings.hero.eyebrow}</p>
          <p className="hero-copy">{siteSettings.hero.introduction}</p>

          <form className="hero-search" role="search" onSubmit={submitSearch}>
            <label className="sr-only" htmlFor="archive-search">Search the archive</label>
            <input
              id="archive-search"
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(event) => {
                const nextQuery = event.target.value;
                setQuery(nextQuery);
                if (nextQuery.trim()) {
                  setFilter("All");
                  setTagFilter(null);
                  setYearFilter("All");
                  window.history.replaceState(null, "", "#archive");
                }
                setVisibleCount(PAGE_SIZE);
              }}
              placeholder={siteSettings.hero.searchPlaceholder}
            />
            <button type="submit" aria-label="Show search results"><Arrow /></button>
          </form>
        </section>

        <div className="featured-wrap">
          {siteSettings.featured.visible && featuredMix && (
            <section
              className="featured shell"
              data-kind={featuredMix.kind}
              aria-labelledby="featured-title"
            >
              <div className="featured-label">
                <span className="featured-label-heading">
                  <KindDot kind={featuredMix.kind} />
                  <span id="featured-title">{siteSettings.featured.label}</span>
                </span>
                <span>{siteSettings.featured.volume}</span>
              </div>
              <div className="featured-main">
                <p className="featured-kicker">{siteSettings.featured.kicker}</p>
                <h2>{featuredHeading}</h2>
              </div>
              <div className="featured-meta">
                <span>{featuredMix.date}</span>
                {featuredMix.duration && <span>{featuredMix.duration}</span>}
                <a href={featuredMix.href} target="_blank" rel="noreferrer">
                  {siteSettings.featured.linkLabel} <Arrow diagonal />
                </a>
              </div>
            </section>
          )}
        </div>

        <div className="land-foot shell">
          <p>{siteSettings.footer.text}</p>
          <button type="button" onClick={() => openArchiveView("All")}>
            {siteSettings.hero.browseLabel} <span aria-hidden="true">↓</span>
          </button>
        </div>
      </div>

      <section className="archive shell" id="archive" ref={archiveRef} aria-label="Archive collection">
        <span className="archive-anchor" id="interviews" aria-hidden="true" />
        <span className="archive-anchor" id="mixes" aria-hidden="true" />
        <span className="archive-anchor" id="live" aria-hidden="true" />
        <span className="archive-anchor" id="programs" aria-hidden="true" />
        <header className="archive-intro">
          <div>
            <p className="eyebrow">Archive index</p>
            <h2>Browse the archive</h2>
          </div>
          <p className="archive-result-count" aria-live="polite">
            <strong>{results.length}</strong>
            <span>{results.length === 1 ? "entry" : "entries"}</span>
            {results.length !== archiveEntries.length && (
              <small>of {archiveEntries.length}</small>
            )}
          </p>
        </header>
        <div className="archive-controls">
          <div className="filter-group" aria-label="Filter by format">
            {filters.map((item) => (
              <button
                type="button"
                data-filter={item}
                className={filter === item ? "active" : ""}
                aria-pressed={filter === item}
                key={item}
                onClick={() => openArchiveView(item)}
              >
                <KindDot kind={item} />
                {item === "All" ? "All formats" : item}
                <span className="filter-count">
                  {item === "All"
                    ? archiveEntries.length
                    : archiveEntries.filter((entry) => entry.kind === item).length}
                </span>
              </button>
            ))}
          </div>
          <div className="select-controls">
            <label className="sort-control">
              <span>Year</span>
              <select
                value={yearFilter}
                onChange={(event) => {
                  setYearFilter(event.target.value as YearFilter);
                  setVisibleCount(PAGE_SIZE);
                }}
              >
                <option value="All">All years</option>
                {archiveYears.map((year) => (
                  <option value={year} key={year}>{year}</option>
                ))}
                <option value="Unknown">Date unconfirmed</option>
              </select>
            </label>
            <label className="sort-control">
              <span>Sort</span>
              <select
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value as Sort);
                  setVisibleCount(PAGE_SIZE);
                }}
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="artist">Artist A–Z</option>
              </select>
            </label>
          </div>
        </div>

        {(query.trim() || tagFilter || yearFilter !== "All") && (
          <div className="active-filters" aria-live="polite">
            <span>Active filters</span>
            <div>
              {query.trim() && <strong>Search: “{query.trim()}”</strong>}
              {tagFilter && <strong>Subject: {tagFilter}</strong>}
              {yearFilter !== "All" && (
                <strong>
                  Year: {yearFilter === "Unknown" ? "Date unconfirmed" : yearFilter}
                </strong>
              )}
            </div>
            <button type="button" onClick={clearSearch}>
              Clear all <span aria-hidden="true">×</span>
            </button>
          </div>
        )}

        {results.length > 0 ? (
          <>
            <div className="archive-list">
            {visibleResults.map((entry) => (
              <article className="archive-row" data-kind={entry.kind} key={entry.id}>
                <button className="entry-open" type="button" onClick={() => openEntry(entry)}>
                  <span className="entry-kind">
                    <span>{entry.kind}</span>
                    {entry.access !== "Public" && (
                      <small>{entry.access === "RRR subscriber" ? "Subscriber" : "Check availability"}</small>
                    )}
                  </span>
                  <span className="entry-title">
                    <strong>{entry.artist}</strong>
                    <span className="entry-subtitle">
                      <span>{entry.title}</span>
                      {entry.transcript?.trim() && (
                        <small
                          className="transcript-marker"
                          aria-label="Transcript available"
                          title="Transcript available"
                        >
                          T
                        </small>
                      )}
                    </span>
                  </span>
                  <span className="entry-year">{entry.year ?? "—"}</span>
                  <span className="entry-duration">{entry.duration || "—"}</span>
                </button>
                <a className="entry-listen" href={entry.href} target="_blank" rel="noreferrer" aria-label={`Open ${entry.artist}: ${entry.title}`}>
                  <span>{primaryActionLabel(entry)}</span> <Arrow diagonal />
                </a>
              </article>
            ))}
            </div>
            {visibleResults.length < results.length && (
              <button
                className="load-more"
                type="button"
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
              >
                <span>Show more</span>
                <small>{results.length - visibleResults.length} remaining</small>
                <Arrow />
              </button>
            )}
          </>
        ) : (
          <div className="empty-state">
            <p>No entries match the current search and filters.</p>
            <button type="button" onClick={clearSearch}>Clear search and filters</button>
          </div>
        )}
      </section>

      <footer className="site-footer shell">
        <p>{siteSettings.footer.text}</p>
        <a href="#top">{siteSettings.footer.backToTopLabel} <Arrow /></a>
      </footer>

      {selected && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) closeEntry();
        }}>
          <section ref={dialogRef} className="entry-dialog" data-kind={selected.kind} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
            <button className="dialog-close" type="button" onClick={closeEntry} aria-label="Close details">Close</button>
            <p className="eyebrow dialog-eyebrow">{selected.kind} / {selected.date}</p>
            <h2 id="dialog-title">{selected.artist}</h2>
            <h3>{selected.title}</h3>
            {selected.summary && <p className="dialog-summary">{selected.summary}</p>}
            {selected.transcript?.trim() && (
              <div className="transcript-panel">
                <button
                  className="transcript-toggle"
                  type="button"
                  aria-expanded={showTranscript}
                  onClick={() => setShowTranscript((visible) => !visible)}
                >
                  <span className="transcript-marker" aria-hidden="true">T</span>
                  <span>{showTranscript ? "Close transcript" : "Read transcript"}</span>
                  <Arrow />
                </button>
                {showTranscript && (
                  <div className="transcript-copy">
                    {selected.transcript
                      .trim()
                      .split(/\n{2,}/)
                      .map((paragraph, index) => <p key={index}>{paragraph}</p>)}
                  </div>
                )}
              </div>
            )}
            <dl>
              {selected.presenters && (
                <div><dt>Presented by</dt><dd>{selected.presenters}</dd></div>
              )}
              {selected.duration && (
                <div><dt>Duration</dt><dd>{selected.duration}</dd></div>
              )}
              <div>
                <dt>Access</dt>
                <dd><span className="audio-status" aria-hidden="true" />{selected.access}</dd>
              </div>
            </dl>
            <p className="dialog-section-label">
              {selected.sources.length === 1 ? "Source" : `${selected.sources.length} sources`}
            </p>
            <div className="holdings">
              {selected.sources.map((source, index) => (
                <a
                  className="holding-row"
                  data-holding={index === 0 ? "primary" : "alternate"}
                  href={source.href}
                  target="_blank"
                  rel="noreferrer"
                  key={source.id}
                >
                  <span className="holding-disc" aria-hidden="true" />
                  <span className="holding-label">{source.label}</span>
                  <small className="holding-access">{source.access}</small>
                  <span className="holding-duration">{source.duration || "—"}</span>
                  <Arrow diagonal />
                </a>
              ))}
            </div>
            <p className="dialog-section-label">Filed under</p>
            <div className="tag-list" aria-label="Subjects">
              {selected.tags.map((tag) => (
                <button
                  type="button"
                  key={tag}
                  onClick={() => {
                    setQuery("");
                    setTagFilter(tag);
                    setFilter("All");
                    setYearFilter("All");
                    setVisibleCount(PAGE_SIZE);
                    setSelected(null);
                    window.history.replaceState(null, "", "#archive");
                    window.setTimeout(
                      () => archiveRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
                      0,
                    );
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>
            {relatedEntries.length > 0 && (
              <div className="related-entries">
                <p className="dialog-section-label">Elsewhere in the archive</p>
                {relatedEntries.map(({ entry }) => (
                  <button type="button" key={entry.id} onClick={() => openEntry(entry)}>
                    <span>{entry.artist}</span>
                    <small>{entry.kind} / {entry.year ?? "Date unconfirmed"}</small>
                    <Arrow />
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
