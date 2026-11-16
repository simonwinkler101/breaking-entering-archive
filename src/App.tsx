import {
  createElement,
  FormEvent,
  MouseEvent as ReactMouseEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import archiveIndex from "../data/archive-index.json";
import siteSettings from "../data/site-settings.json";
import about from "../data/about.json";
import { createSearchIndex, normaliseSearchText, searchArchive } from "./search";

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
  // Set at build time; the transcript text itself loads separately.
  hasTranscript?: boolean;
  audio?: { url: string; type: string };
  pullQuote?: { text: string; speaker: string };
  aliases?: string[];
  tags: string[];
  relatedIds?: string[];
  access: ArchiveAccess;
  sources: ArchiveSource[];
  // Derived at build time by scripts/build-content.mjs.
  display: { name: string; title: string; duration: string };
};

// Entries arrive sorted newest first, with undated entries last.
const archiveEntries = (archiveIndex.entries as unknown as ArchiveEntry[]).filter(
  (entry) => entry.kind !== "Broadcast",
);
const listIndex = createSearchIndex(archiveEntries);

// Transcripts are most of the archive's weight, so they arrive after the list:
// when the browser is idle, or as soon as someone starts to search.
type Transcripts = Record<string, string>;
let transcriptsRequest: Promise<Transcripts> | null = null;
const requestTranscripts = () =>
  (transcriptsRequest ??= import("../data/archive-transcripts.json")
    .then((module) => module.default as Transcripts)
    .catch((error) => {
      transcriptsRequest = null;
      throw error;
    }));

const formats = [
  { kind: "Interview", label: "Interviews", hash: "#interviews" },
  { kind: "Live", label: "Live", hash: "#live" },
  { kind: "Guest mix", label: "Mixes", hash: "#mixes" },
] as const;
type Format = (typeof formats)[number]["kind"];

const formatFromHash = (hash: string): Format | null =>
  formats.find((format) => format.hash === hash)?.kind ?? null;

const entryPath = (entry: ArchiveEntry) => `/archive/${encodeURIComponent(entry.id)}/`;

const entryIdFromLocation = () => {
  const routeMatch = window.location.pathname.match(/^\/archive\/([^/]+)\/?$/);
  try {
    if (routeMatch) return decodeURIComponent(routeMatch[1]);
    if (window.location.hash.startsWith("#entry/")) {
      return decodeURIComponent(window.location.hash.slice("#entry/".length));
    }
  } catch {
    return null;
  }
  return null;
};

const isUnmodifiedLeftClick = (event: ReactMouseEvent<HTMLAnchorElement>) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

const hasTranscript = (entry: ArchiveEntry) => Boolean(entry.hasTranscript);
const actionLabel = (entry: ArchiveEntry) =>
  entry.href.toLowerCase().includes("youtube.com") ? "Watch" : "Listen";
const isTripleRSource = (href: string) => /^https?:\/\/(?:www\.)?rrr\.org\.au(?:\/|$)/i.test(href);
const kindMark = (entry: ArchiveEntry) =>
  entry.kind === "Live" ? "live" : entry.kind === "Guest mix" ? "mix" : "";
const yearLabel = (entry: ArchiveEntry) => (entry.year ? String(entry.year) : "Undated");

const pageUrl = (format: Format | null) =>
  `/${formats.find((item) => item.kind === format)?.hash ?? ""}`;

function SubscriberArchiveCredit() {
  return (
    <p className="audio-credit">
      From Triple R’s subscriber audio archive.{" "}
      <a href="https://www.rrr.org.au/on-demand/archives" target="_blank" rel="noreferrer">
        Explore the full archive
      </a>.
    </p>
  );
}

function EntryDetail({ entry, id }: { entry: ArchiveEntry; id: string }) {
  const leaveForPermanentPage = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    // While an entry is open the address already shows its permanent page, so
    // a link to that page with a #fragment would only scroll this document.
    if (isUnmodifiedLeftClick(event)) {
      window.history.replaceState(null, "", `/${window.location.hash}`);
    }
  };

  return (
    <div className="detail" id={id}>
      {entry.display.title && <p className="detail-title">{entry.display.title}</p>}
      <p className="detail-meta">
        {[
          entry.year ? entry.date : "Undated",
          entry.display.duration,
        ]
          .filter(Boolean)
          .join(", ")}
      </p>
      {entry.summary && <p className="detail-summary">{entry.summary}</p>}
      {entry.audio && createElement(
        "archive-audio",
        { class: "audio-player", id: "listen", "data-title": entry.display.name, "data-duration": entry.duration, key: entry.audio.url },
        <audio controls preload="none" aria-label={`Audio recording: ${entry.display.name}`}>
          <source src={entry.audio.url} type={entry.audio.type} />
          <a href={entry.audio.url}>Open audio</a>
        </audio>,
      )}
      {entry.access === "RRR subscriber" && <SubscriberArchiveCredit />}
      {entry.audio && entry.access !== "RRR subscriber" && (
        <p className="audio-credit">
          {isTripleRSource(entry.href) ? "Broadcast on " : "Source: "}
          <a href={entry.href} target="_blank" rel="noreferrer">
            {isTripleRSource(entry.href) ? "Triple R" : entry.source}
          </a>
        </p>
      )}
      <p className="detail-actions">
        {entry.audio ? (
          <a href="#listen">Listen</a>
        ) : (
          <a href={entry.href} target="_blank" rel="noreferrer">{actionLabel(entry)}</a>
        )}
        {hasTranscript(entry) && (
          <a
            href={`${entryPath(entry)}#transcript`}
            onClick={leaveForPermanentPage}
            aria-label={`Read the ${entry.display.name} transcript`}
          >
            Read
          </a>
        )}
      </p>
    </div>
  );
}

export default function App({ initialQuery = "" }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [transcripts, setTranscripts] = useState<Transcripts | null>(null);
  const [format, setFormat] = useState<Format | null>(() => formatFromHash(window.location.hash));
  const [openId, setOpenId] = useState<string | null>(() => {
    const id = entryIdFromLocation();
    return id && archiveEntries.some((entry) => entry.id === id) ? id : null;
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const mastheadRef = useRef<HTMLElement>(null);
  // Set when the next change to the results should start the list from its
  // top, just under the search row. An address with a format opens there.
  const enterRef = useRef<ScrollBehavior | null>(
    formatFromHash(window.location.hash) ? "auto" : null,
  );
  const openIdRef = useRef(openId);
  openIdRef.current = openId;
  const rowRefs = useRef(new Map<string, HTMLAnchorElement>());
  // Set when a tap or click opens an entry, so its details can be brought on screen.
  const revealRef = useRef(false);
  const searching = Boolean(normaliseSearchText(query));
  const openEntry = archiveEntries.find((entry) => entry.id === openId) ?? null;

  const searchIndex = useMemo(
    () =>
      transcripts
        ? createSearchIndex(
            archiveEntries.map((entry) => ({ ...entry, transcript: transcripts[entry.id] })),
          )
        : listIndex,
    [transcripts],
  );

  const loadTranscripts = () => {
    requestTranscripts().then(setTranscripts, () => {});
  };

  useEffect(() => {
    if (initialQuery) {
      loadTranscripts();
      return;
    }
    // On a data-saver connection, wait until someone searches.
    if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(loadTranscripts, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = globalThis.setTimeout(loadTranscripts, 2000);
    return () => globalThis.clearTimeout(id);
  }, []);

  const results = useMemo(() => {
    const matches = searchArchive(searchIndex, query).filter(
      ({ entry }) => !format || entry.kind === format,
    );
    if (!normaliseSearchText(query)) return matches;
    return [...matches].sort(
      (a, b) =>
        b.score - a.score ||
        (b.entry.dateKey ?? "").localeCompare(a.entry.dateKey ?? "") ||
        a.entry.display.name.localeCompare(b.entry.display.name),
    );
  }, [searchIndex, query, format]);

  // An entry hidden by a new search or format closes.
  useEffect(() => {
    if (openId && !results.some(({ entry }) => entry.id === openId)) setOpenId(null);
  }, [results, openId]);

  // Keep the address in step without adding history entries: an open entry
  // shows its permanent page address, so it can be copied and shared.
  useEffect(() => {
    const url = openEntry ? entryPath(openEntry) : pageUrl(format);
    const current = `${window.location.pathname}${window.location.hash}`;
    if (current !== url) window.history.replaceState(null, "", url);
  }, [openEntry, format]);

  useEffect(() => {
    const title = openEntry
      ? `${openEntry.display.name}${openEntry.display.title ? ` — ${openEntry.display.title}` : ""} | ${siteSettings.metadata.title}`
      : siteSettings.metadata.title;
    const description = openEntry
      ? openEntry.summary ||
        `${openEntry.kind} with ${openEntry.artist}${openEntry.date ? `, ${openEntry.date}` : ""}, from the Breaking and Entering Archive.`
      : siteSettings.metadata.description;
    document.title = title;
    document.querySelector('meta[name="description"]')?.setAttribute("content", description);
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.append(canonical);
    }
    canonical.href = new URL(
      openEntry ? entryPath(openEntry) : "/",
      siteSettings.metadata.siteUrl,
    ).toString();
  }, [openEntry]);

  // The list begins where the search row sits at rest: the foot of the title
  // page. Scrolling there pins the row to the top with the list below it.
  const listTop = () =>
    (mastheadRef.current?.getBoundingClientRect().bottom ?? 0) + window.scrollY;
  const motion = (): ScrollBehavior =>
    window.matchMedia("(prefers-reduced-motion: reduce), (pointer: coarse)").matches
      ? "auto"
      : "smooth";

  useLayoutEffect(() => {
    const behavior = enterRef.current;
    if (!behavior) return;
    enterRef.current = null;
    window.scrollTo({ top: listTop(), behavior });
  }, [results]);

  // An entry address opened inside the application (for example after a
  // history step) brings that entry into view.
  useLayoutEffect(() => {
    if (!openId) return;
    rowRefs.current.get(openId)?.scrollIntoView({ block: "center" });
  }, []); // First render only.

  // An entry opened near the foot of the screen (common on a phone) scrolls up
  // just enough to show its details, without pushing its name under the
  // search row.
  useLayoutEffect(() => {
    if (!openId || !revealRef.current) return;
    revealRef.current = false;
    const name = rowRefs.current.get(openId);
    const detail = document.getElementById(`entry-${openId}`);
    if (!name || !detail) return;
    const bar = document.querySelector(".controls")?.getBoundingClientRect().bottom ?? 0;
    const hidden = detail.getBoundingClientRect().bottom + 16 - window.innerHeight;
    const room = name.getBoundingClientRect().top - bar - 8;
    const by = Math.min(hidden, room);
    if (by > 0) window.scrollBy({ top: by, behavior: motion() });
  }, [openId]);

  useEffect(() => {
    const syncFromLocation = () => {
      const id = entryIdFromLocation();
      if (id && archiveEntries.some((entry) => entry.id === id)) {
        setOpenId(id);
        return;
      }
      setOpenId(null);
      setFormat(formatFromHash(window.location.hash));
    };
    // Returning from an entry page restores this page from the back-forward
    // cache with its entry still open; put the entry's address back.
    const restoreAddress = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      const open = archiveEntries.find((entry) => entry.id === openIdRef.current);
      if (open) window.history.replaceState(null, "", entryPath(open));
    };
    window.addEventListener("hashchange", syncFromLocation);
    window.addEventListener("popstate", syncFromLocation);
    window.addEventListener("pageshow", restoreAddress);
    return () => {
      window.removeEventListener("hashchange", syncFromLocation);
      window.removeEventListener("popstate", syncFromLocation);
      window.removeEventListener("pageshow", restoreAddress);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      if (event.key === "/" && !typing) {
        event.preventDefault();
        inputRef.current?.focus();
        return;
      }
      if (event.key !== "Escape") return;
      if (target === inputRef.current && inputRef.current?.value) {
        setQuery("");
        return;
      }
      const current = openIdRef.current;
      if (!current) return;
      rowRefs.current.get(current)?.focus();
      setOpenId(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const toggleEntry = (event: ReactMouseEvent<HTMLAnchorElement>, entry: ArchiveEntry) => {
    if (!isUnmodifiedLeftClick(event)) return;
    event.preventDefault();
    revealRef.current = openId !== entry.id;
    setOpenId((current) => (current === entry.id ? null : entry.id));
  };

  // Search and the three words are doorways into the list.
  const chooseFormat = (next: Format) => {
    enterRef.current = window.scrollY < listTop() - 1 ? motion() : "auto";
    setFormat((current) => (current === next ? null : next));
  };

  const enterFromSearch = () => {
    const top = listTop();
    if (window.scrollY < top - 1) window.scrollTo({ top, behavior: motion() });
  };

  const reset = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (!isUnmodifiedLeftClick(event)) return;
    event.preventDefault();
    setQuery("");
    setFormat(null);
    setOpenId(null);
    window.scrollTo({ top: 0 });
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    inputRef.current?.blur();
  };

  return (
    <main className="site">
      <header className="masthead" id="top" ref={mastheadRef}>
        <p className="credit"><a href="/about/" data-projects-trigger aria-haspopup="dialog" aria-controls="projects-dialog">{siteSettings.hero.eyebrow}</a></p>
        <h1 className="title">
          <a href="/" onClick={reset} aria-label={siteSettings.wordmark.homeLabel}>
            <span>{siteSettings.wordmark.lineOne}</span>{" "}
            <span>{siteSettings.wordmark.lineTwo}</span>
          </a>
        </h1>
        <p className="intro">
          {siteSettings.hero.introduction} {siteSettings.hero.archiveLine}
        </p>
      </header>

      <div className="controls">
        <form className="search" role="search" onSubmit={submitSearch}>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => {
              // A new search from deep in the list starts from its top.
              if (window.scrollY > listTop() + 1) enterRef.current = "auto";
              setQuery(event.target.value);
            }}
            onFocus={() => {
              loadTranscripts();
              enterFromSearch();
            }}
            placeholder={siteSettings.hero.searchPlaceholder}
            aria-label="Search the archive"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
          />
          {query && (
            <button
              type="button"
              className="clear"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
            >
              Clear
            </button>
          )}
        </form>
        <nav className="formats" aria-label="Formats" data-filtered={format ? "" : undefined}>
          {formats.map((item) => (
            <button
              type="button"
              key={item.kind}
              aria-pressed={format === item.kind}
              onClick={() => chooseFormat(item.kind)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      <section className="index" aria-label="Archive">
        {(searching || format) && (
          <p className="sr-only" aria-live="polite">
            {results.length === 1 ? "1 entry" : `${results.length} entries`}
          </p>
        )}
        {results.length > 0 ? (
          <ol className="rows" data-mode={searching ? "search" : "browse"}>
            {results.map(({ entry, transcriptExcerpt }, index) => {
              const previous = results[index - 1]?.entry;
              const startsGroup =
                !searching && (!previous || yearLabel(previous) !== yearLabel(entry));
              const open = entry.id === openId;
              const detailId = `entry-${entry.id}`;
              const marks = [
                searching && entry.year ? String(entry.year) : "",
                format ? "" : kindMark(entry),
              ].filter(Boolean);
              return (
                <li
                  className="row"
                  key={entry.id}
                  data-open={open || undefined}
                  data-group={startsGroup || undefined}
                >
                  {startsGroup && <span className="row-year">{yearLabel(entry)}</span>}
                  <div className="row-body">
                    <p className="row-line">
                      <a
                        className="row-name"
                        href={entryPath(entry)}
                        ref={(node) => {
                          if (node) rowRefs.current.set(entry.id, node);
                          else rowRefs.current.delete(entry.id);
                        }}
                        aria-expanded={open}
                        aria-controls={open ? detailId : undefined}
                        onClick={(event) => toggleEntry(event, entry)}
                      >
                        {entry.display.name}
                      </a>
                      {marks.length > 0 && (
                        <span className="row-marks">
                          {marks.map((mark) => (
                            <span key={mark}>{mark}</span>
                          ))}
                        </span>
                      )}
                      {entry.display.title && !open && (
                        <span className="row-hint" aria-hidden="true">
                          {entry.display.title}
                        </span>
                      )}
                    </p>
                    {transcriptExcerpt && <p className="row-excerpt">{transcriptExcerpt}</p>}
                    {open && <EntryDetail entry={entry} id={detailId} />}
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="empty">Nothing found.</p>
        )}
      </section>

      <footer className="foot">
        <p>{siteSettings.footer.text}</p>
        <a href="/about/" data-projects-trigger aria-haspopup="dialog" aria-controls="projects-dialog">{about.title}</a>
        <a href="#top">{siteSettings.footer.backToTopLabel}</a>
      </footer>
    </main>
  );
}
