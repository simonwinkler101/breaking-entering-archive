import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDirectory = path.join(root, "dist");
const indexFilename = path.join(distDirectory, "index.html");
const archiveData = JSON.parse(fs.readFileSync(path.join(root, "data/archive-data.json"), "utf8"));
const associations = JSON.parse(
  fs.readFileSync(path.join(root, "data/archive-associations.json"), "utf8"),
);
const settings = JSON.parse(fs.readFileSync(path.join(root, "data/site-settings.json"), "utf8"));
const about = JSON.parse(fs.readFileSync(path.join(root, "data/about.json"), "utf8"));
const entries = archiveData.entries.filter((entry) => entry.kind !== "Broadcast");
const siteUrl = settings.metadata.siteUrl.replace(/\/+$/, "");
const fontFile = fs
  .readdirSync(path.join(distDirectory, "assets"))
  .find((filename) => /^geist-latin-wght-normal.*\.woff2$/.test(filename));
const baseIndex = fs
  .readFileSync(indexFilename, "utf8")
  .replace(
    "</head>",
    fontFile
      ? `  <link rel="preload" href="/assets/${fontFile}" as="font" type="font/woff2" crossorigin />\n  </head>`
      : "</head>",
  );

const escapeHtml = (value = "") =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );

const escapeXml = escapeHtml;
const projectGroups = () => about.groups.map((group) => `
      <section class="projects-group">
        <h3>${escapeHtml(group.heading)}</h3>
        <ul class="project-links">${group.links.map((link) => `
          <li><a href="${escapeHtml(link.url)}">${escapeHtml(link.label)}</a></li>`).join("")}
        </ul>
      </section>`).join("");
const projectsDialog = () => `
  <dialog class="projects-dialog" id="projects-dialog" aria-labelledby="projects-title">
    <div class="projects-heading">
      <h2 id="projects-title">${escapeHtml(about.title)}</h2>
      <button type="button" data-projects-close autofocus>Close</button>
    </div>
    ${projectGroups()}
  </dialog>`;
const jsonLd = (value) => JSON.stringify(value).replace(/</g, "\\u003c");
const entryPath = (entry) => `/archive/${encodeURIComponent(entry.id)}/`;
const entryUrl = (entry) => `${siteUrl}${entryPath(entry)}`;
const cleanText = (value = "") => String(value).replace(/\s+/g, " ").trim();
const shorten = (value, limit = 190) => {
  const text = cleanText(value);
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).replace(/\s+\S*$/, "")}…`;
};

const entryDescription = (entry) =>
  shorten(
    entry.summary ||
      `${entry.kind} with ${entry.artist}${entry.date ? `, ${entry.date}` : ""}, from the Breaking and Entering Archive.`,
  );

const display = (entry) => entry.display ?? { name: entry.artist, title: entry.title, duration: entry.duration };
const entryTitleBase = (entry) => {
  const { name, title } = display(entry);
  return title ? `${name} — ${title}` : name;
};
const titleCounts = entries.reduce((counts, entry) => {
  const title = entryTitleBase(entry);
  counts.set(title, (counts.get(title) ?? 0) + 1);
  return counts;
}, new Map());

const entryPageTitle = (entry) => {
  const title = entryTitleBase(entry);
  const datedTitle = titleCounts.get(title) > 1 && entry.year ? `${title} (${entry.year})` : title;
  return `${datedTitle} | ${settings.metadata.title}`;
};

const durationToIso = (value = "") => {
  const parts = value
    .split(":")
    .map(Number)
    .filter((part) => Number.isFinite(part));
  if (parts.length === 2) return `PT${parts[0]}M${parts[1]}S`;
  if (parts.length === 3) return `PT${parts[0]}H${parts[1]}M${parts[2]}S`;
  return undefined;
};

const normalise = (value = "") =>
  value
    .replace(/&/g, " and ")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("en-AU")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

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
const associationPairs = new Map();
for (const group of associations.groups ?? []) {
  for (const id of group.entryIds) {
    const related = associationPairs.get(id) ?? new Set();
    for (const relatedId of group.entryIds) {
      if (relatedId !== id) related.add(relatedId);
    }
    associationPairs.set(id, related);
  }
}

const relatedEntriesFor = (selected) =>
  entries
    .filter((candidate) => candidate.id !== selected.id)
    .map((candidate) => {
      let score = 0;
      if (
        selected.relatedIds?.includes(candidate.id) ||
        candidate.relatedIds?.includes(selected.id) ||
        associationPairs.get(selected.id)?.has(candidate.id)
      ) {
        score += 1000;
      }
      const selectedArtist = normalise(selected.artist);
      const candidateArtist = normalise(candidate.artist);
      if (selectedArtist && selectedArtist === candidateArtist && selectedArtist !== "breaking entering") {
        score += 600;
      }
      const selectedTags = new Set(
        selected.tags.map(normalise).filter((tag) => tag && !genericTags.has(tag)),
      );
      const sharedTags = candidate.tags
        .map(normalise)
        .filter((tag) => selectedTags.has(tag) && !genericTags.has(tag));
      score += sharedTags.length * 24;
      return { entry: candidate, score };
    })
    .filter(({ score }) => score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        (right.entry.dateKey ?? "").localeCompare(left.entry.dateKey ?? "") ||
        left.entry.artist.localeCompare(right.entry.artist),
    )
    .slice(0, 3)
    .map(({ entry }) => entry);

const headTags = ({ title, description, url, entry }) => {
  const verification = settings.metadata.googleSiteVerification?.trim();
  const published = entry?.dateKey
    ? `<meta property="article:published_time" content="${escapeHtml(entry.dateKey)}" />`
    : "";
  const verificationTag = verification
    ? `<meta name="google-site-verification" content="${escapeHtml(verification)}" />`
    : "";
  return `
    <link rel="canonical" href="${escapeHtml(url)}" />
    <meta property="og:site_name" content="${escapeHtml(settings.metadata.title)}" />
    <meta property="og:type" content="${entry ? "article" : "website"}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(url)}" />
    ${published}
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    ${verificationTag}`;
};

const decorateDocument = (html, { title, description, url, schema, entry }) =>
  html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`)
    .replace(
      /<meta\s+name="description"[\s\S]*?\/>/i,
      `<meta name="description" content="${escapeHtml(description)}" />`,
    )
    .replace(
      "</head>",
      `${headTags({ title, description, url, entry })}
    <script type="application/ld+json">${jsonLd(schema)}</script>
  </head>`,
    )
    .replace("</body>", `${projectsDialog()}\n  </body>`);

const yearLabel = (entry) => (entry.year ? String(entry.year) : "Undated");
const kindMark = (entry) => (entry.kind === "Live" ? "live" : entry.kind === "Guest mix" ? "mix" : "");
const actionLabel = (entry) => (entry.href.toLowerCase().includes("youtube.com") ? "Watch" : "Listen");
const isTripleRSource = (href) => /^https?:\/\/(?:www\.)?rrr\.org\.au(?:\/|$)/i.test(href);
const hasTranscript = (entry) => Boolean(entry.transcript?.trim());

const masthead = () => `
  <header class="masthead" id="top">
    <p class="credit"><a href="/about/" data-projects-trigger aria-haspopup="dialog" aria-controls="projects-dialog">${escapeHtml(settings.hero.eyebrow)}</a></p>
    <h1 class="title"><a href="/" aria-label="${escapeHtml(settings.wordmark.homeLabel)}"><span>${escapeHtml(settings.wordmark.lineOne)}</span> <span>${escapeHtml(settings.wordmark.lineTwo)}</span></a></h1>
    <p class="intro">${escapeHtml(settings.hero.introduction)} ${escapeHtml(settings.hero.archiveLine)}</p>
  </header>`;

const footer = () => `
  <footer class="foot">
    <p>${escapeHtml(settings.footer.text)}</p>
    <a href="/about/" data-projects-trigger aria-haspopup="dialog" aria-controls="projects-dialog">${escapeHtml(about.title)}</a>
    <a href="#top">${escapeHtml(settings.footer.backToTopLabel)}</a>
  </footer>`;

// The homepage as built: it paints before the application script arrives,
// and stands on its own without JavaScript. The application replaces it with
// the same structure (src/main.tsx). The search row needs the script, so it
// is hidden when scripting is off.
const staticControls = () => `
    <noscript><style>.controls { display: none; }</style></noscript>
    <div class="controls">
      <form class="search" role="search">
        <input type="search" placeholder="${escapeHtml(settings.hero.searchPlaceholder)}" aria-label="Search the archive" autocomplete="off" spellcheck="false" enterkeyhint="search" />
      </form>
      <nav class="formats" aria-label="Formats">
        ${["Interviews", "Live", "Mixes"].map((label) => `<button type="button" aria-pressed="false">${label}</button>`).join("\n        ")}
      </nav>
    </div>`;

const homepageFallback = () => `
  <main class="site">
    ${masthead()}
    ${staticControls()}
    <section class="index" aria-label="Archive">
      <ol class="rows" data-mode="browse">
        ${entries
          .map((entry, index) => {
            const startsGroup = index === 0 || yearLabel(entries[index - 1]) !== yearLabel(entry);
            const marks = [kindMark(entry)].filter(Boolean);
            return `
        <li class="row"${startsGroup ? " data-group" : ""}>
          ${startsGroup ? `<span class="row-year">${escapeHtml(yearLabel(entry))}</span>` : ""}
          <div class="row-body">
            <p class="row-line">
              <a class="row-name" href="${escapeHtml(entryPath(entry))}">${escapeHtml(display(entry).name)}</a>
              ${marks.length ? `<span class="row-marks">${marks.map((mark) => `<span>${mark}</span>`).join("")}</span>` : ""}
            </p>
          </div>
        </li>`;
          })
          .join("")}
      </ol>
    </section>
    ${footer()}
  </main>`;

const homepageSchema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      url: `${siteUrl}/`,
      name: settings.metadata.title,
      description: settings.metadata.description,
      inLanguage: "en-AU",
    },
    {
      "@type": "CollectionPage",
      "@id": `${siteUrl}/#archive`,
      url: `${siteUrl}/`,
      name: settings.metadata.title,
      description: settings.metadata.description,
      isPartOf: { "@id": `${siteUrl}/#website` },
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: entries.length,
        itemListElement: entries.map((entry, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: entryUrl(entry),
          name: `${entry.artist} — ${entry.title}`,
        })),
      },
    },
  ],
};

const transcriptParagraph = (paragraph, index) => {
  if (index === 0) return `<p class="transcript-intro">${escapeHtml(paragraph)}</p>`;
  const speakerMatch = paragraph.match(/^(\p{L}[\p{L}\p{M} .'’-]{0,40}:)([\s\S]*)$/u);
  if (!speakerMatch) return `<p>${escapeHtml(paragraph)}</p>`;
  return `<p><span class="transcript-speaker">${escapeHtml(speakerMatch[1])}</span>${escapeHtml(speakerMatch[2])}</p>`;
};

const pullQuoteBlock = (entry) => {
  if (!entry.pullQuote?.text || !entry.pullQuote?.speaker) return "";
  return `
    <section class="entry-section" aria-labelledby="quote-label">
      <h2 class="entry-label" id="quote-label">Quote</h2>
      <figure class="entry-quote">
        <blockquote><p>“${escapeHtml(entry.pullQuote.text)}”</p></blockquote>
        <figcaption>${escapeHtml(entry.pullQuote.speaker)}</figcaption>
      </figure>
    </section>`;
};

// The opening section is labelled with the entry's format; its facts are
// plain text joined by commas, so they read and copy as a sentence.
const aboutBlock = (entry, duration) => {
  const facts = [entry.year ? entry.date : "Undated", duration]
    .filter(Boolean)
    .join(", ");
  return `
    <section class="entry-section" aria-labelledby="about-label">
      <h2 class="entry-label" id="about-label">${escapeHtml(kindWord(entry))}</h2>
      <div class="entry-about">
        <p class="entry-meta">${escapeHtml(facts)}</p>
        ${entry.summary ? `<p class="entry-summary">${escapeHtml(entry.summary)}</p>` : ""}
        ${!entry.audio ? subscriberArchiveCredit(entry) : ""}
      </div>
    </section>`;
};

const transcriptBlock = (entry) => {
  if (!hasTranscript(entry)) return "";
  const paragraphs = entry.transcript.trim().split(/\n{2,}/).map(transcriptParagraph).join("");
  return `
    <section class="entry-section" id="transcript" aria-labelledby="transcript-label">
      <h2 class="entry-label" id="transcript-label">Transcript</h2>
      <div class="transcript">${paragraphs}</div>
    </section>`;
};

const audioBlock = (entry) => {
  if (!entry.audio) return "";
  return `
    <section class="entry-section" id="listen" aria-labelledby="audio-label">
      <h2 class="entry-label" id="audio-label">Listen</h2>
      <archive-audio class="audio-player" data-title="${escapeHtml(display(entry).name)}" data-duration="${escapeHtml(entry.duration)}">
        <audio controls preload="none" aria-label="${escapeHtml(`Audio recording: ${display(entry).name}`)}">
          <source src="${escapeHtml(entry.audio.url)}" type="${escapeHtml(entry.audio.type)}" />
          <a href="${escapeHtml(entry.audio.url)}">Open audio</a>
        </audio>
      </archive-audio>
      ${subscriberArchiveCredit(entry) || `<p class="audio-credit">${isTripleRSource(entry.href) ? "Broadcast on " : "Source: "}<a href="${escapeHtml(entry.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(isTripleRSource(entry.href) ? "Triple R" : entry.source)}</a></p>`}
    </section>`;
};

const subscriberArchiveCredit = (entry) => entry.access === "RRR subscriber"
  ? `<p class="audio-credit">From Triple R’s subscriber audio archive. <a href="https://www.rrr.org.au/on-demand/archives" target="_blank" rel="noopener noreferrer">Explore the full archive</a>.</p>`
  : "";

const accessNote = (access) => (access === "RRR subscriber" ? "Triple R subscriber audio archive" : "");

const sourcesBlock = (entry) => {
  if (entry.sources.length < 2) return "";
  return `
    <section class="entry-section" aria-labelledby="sources-label">
      <h2 class="entry-label" id="sources-label">Sources</h2>
      <ul class="sources">
        ${entry.sources
          .map(
            (source) => `
        <li><a href="${escapeHtml(source.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.label)}</a>${[source.duration ? formatDuration(source.duration) : "", accessNote(source.access)].filter(Boolean).map((note) => `<span>, ${escapeHtml(note)}</span>`).join("")}</li>`,
          )
          .join("")}
      </ul>
    </section>`;
};

const formatDuration = (value = "") => {
  const parts = value.split(":").map(Number);
  if (!parts.length || parts.some((part) => !Number.isFinite(part))) return "";
  const seconds = parts.reduce((total, part) => total * 60 + part, 0);
  if (!seconds) return "";
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
};

const relatedBlock = (entry) => {
  const related = relatedEntriesFor(entry);
  if (!related.length) return "";
  return `
    <section class="entry-section" aria-labelledby="related-label">
      <h2 class="entry-label" id="related-label">Elsewhere</h2>
      <ul class="related">
        ${related
          .map(
            (relatedEntry) => `
        <li><a href="${escapeHtml(entryPath(relatedEntry))}">${escapeHtml(display(relatedEntry).name)}</a> <small>${escapeHtml(relatedEntry.year ?? "Undated")}</small></li>`,
          )
          .join("")}
      </ul>
    </section>`;
};

const kindWord = (entry) =>
  ({ Interview: "Interview", Live: "Live", "Guest mix": "Mix", "Special program": "Program" })[
    entry.kind
  ] ?? entry.kind;

const entryDocument = (entry) => {
  const title = entryPageTitle(entry);
  const description = entryDescription(entry);
  const url = entryUrl(entry);
  const mediaType = entry.audio || entry.kind === "Guest mix" || entry.kind === "Live" ? "AudioObject" : "CreativeWork";
  const media = {
    "@type": mediaType,
    name: entry.title,
    description,
    contentUrl: entry.audio?.url ?? entry.href,
    ...(entry.audio ? { encodingFormat: entry.audio.type } : {}),
    ...(entry.aliases?.length ? { alternateName: entry.aliases } : {}),
    ...(durationToIso(entry.duration) ? { duration: durationToIso(entry.duration) } : {}),
  };
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": url,
    url,
    name: title,
    headline: entry.title,
    description,
    inLanguage: "en-AU",
    ...(entry.dateKey ? { datePublished: entry.dateKey } : {}),
    keywords: entry.tags.join(", "),
    about: { "@type": "Thing", name: entry.artist },
    isPartOf: {
      "@type": "CollectionPage",
      "@id": `${siteUrl}/#archive`,
      name: settings.metadata.title,
      url: `${siteUrl}/`,
    },
    mainEntity: media,
  };

  const { name, title: displayTitle, duration } = display(entry);
  const content = `
  <main class="site entry-page">
    <header class="entry-top">
      <a href="/">${escapeHtml(settings.metadata.title.replace(/\s+Archive$/i, ""))}</a>
      <nav class="entry-nav" aria-label="This entry">${entry.audio ? '<a href="#listen">Listen</a>' : `<a href="${escapeHtml(entry.href)}" target="_blank" rel="noopener noreferrer">${actionLabel(entry)}</a>`}${hasTranscript(entry) ? `<a href="#transcript">Read</a>` : ""}</nav>
    </header>
    <article class="entry" data-kind="${escapeHtml(entry.kind)}">
      <h1 class="entry-name">${escapeHtml(name)}</h1>
      ${displayTitle ? `<p class="entry-title">${escapeHtml(displayTitle)}</p>` : ""}
      ${aboutBlock(entry, duration)}
      ${audioBlock(entry)}
      ${pullQuoteBlock(entry)}
      ${transcriptBlock(entry)}
      ${sourcesBlock(entry)}
      ${relatedBlock(entry)}
    </article>
    ${footer()}
  </main>`;

  const withoutApplication = baseIndex.replace(
    /\s*<script\s+type="module"[^>]*>[\s\S]*?<\/script>/gi,
    "",
  );
  return decorateDocument(
    withoutApplication.replace('<div id="root"></div>', `<div id="root">${content}</div>`),
    { title, description, url, schema, entry },
  );
};

const homepage = decorateDocument(
  baseIndex.replace(
    '<div id="root"></div>',
    `<div id="root">${homepageFallback()}</div>`,
  ),
  {
    title: settings.metadata.title,
    description: settings.metadata.description,
    url: `${siteUrl}/`,
    schema: homepageSchema,
  },
);
fs.writeFileSync(indexFilename, homepage);

const aboutUrl = `${siteUrl}/about/`;
const projectLinks = about.groups.flatMap((group) => group.links);
const aboutContent = `
  <main class="site about-page" id="top">
    <header class="entry-top"><a href="/">${escapeHtml(settings.metadata.title.replace(/\s+Archive$/i, ""))}</a></header>
    <article class="entry">
      <h1 class="entry-name">${escapeHtml(about.title)}</h1>
      <section class="entry-section" aria-labelledby="about-label">
        <h2 class="entry-label" id="about-label">About</h2>
        <p>${escapeHtml(about.introduction)}</p>
      </section>
      ${about.groups.map((group, index) => `
      <section class="entry-section" aria-labelledby="projects-${index}">
        <h2 class="entry-label" id="projects-${index}">${escapeHtml(group.heading)}</h2>
        <ul class="project-links">${group.links.map((link) => `
          <li><a href="${escapeHtml(link.url)}">${escapeHtml(link.label)}</a></li>`).join("")}
        </ul>
      </section>`).join("")}
    </article>
    ${footer()}
  </main>`;
const aboutBase = baseIndex
  .replace(/\s*<script\s+type="module"[^>]*>[\s\S]*?<\/script>/gi, "")
  .replace(/\s*<script\b[^>]*src="\/audio-player\.js"[^>]*><\/script>/gi, "");
const aboutDocument = decorateDocument(
  aboutBase.replace('<div id="root"></div>', `<div id="root">${aboutContent}</div>`),
  {
    title: `${about.title} | ${settings.metadata.title}`,
    description: about.introduction,
    url: aboutUrl,
    schema: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      url: aboutUrl,
      name: about.title,
      description: about.introduction,
      inLanguage: "en-AU",
      isPartOf: { "@id": `${siteUrl}/#website` },
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: projectLinks.length,
        itemListElement: projectLinks.map((link, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: link.label,
          url: link.url,
        })),
      },
    },
  },
);
fs.mkdirSync(path.join(distDirectory, "about"), { recursive: true });
fs.writeFileSync(path.join(distDirectory, "about/index.html"), aboutDocument);

for (const entry of entries) {
  const directory = path.join(distDirectory, "archive", entry.id);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "index.html"), entryDocument(entry));
}

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${escapeXml(`${siteUrl}/`)}</loc></url>
  <url><loc>${escapeXml(aboutUrl)}</loc></url>
${entries.map((entry) => `  <url><loc>${escapeXml(entryUrl(entry))}</loc></url>`).join("\n")}
</urlset>
`;
fs.writeFileSync(path.join(distDirectory, "sitemap.xml"), sitemap);
fs.writeFileSync(
  path.join(distDirectory, "robots.txt"),
  `User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: ${siteUrl}/sitemap.xml\n`,
);

console.log(`Generated ${entries.length} permanent archive pages, the project directory and sitemap.xml.`);
