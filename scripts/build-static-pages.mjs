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
const entries = archiveData.entries.filter((entry) => entry.kind !== "Broadcast");
const siteUrl = settings.metadata.siteUrl.replace(/\/+$/, "");
const baseIndex = fs.readFileSync(indexFilename, "utf8");

const escapeHtml = (value = "") =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );

const escapeXml = escapeHtml;
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

const entryTitleBase = (entry) => `${entry.artist} — ${entry.title}`;
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
    );

const wordmark = (href) => `
  <a class="wordmark" href="${escapeHtml(href)}" aria-label="${escapeHtml(settings.wordmark.homeLabel)}">
    <span>${escapeHtml(settings.wordmark.lineOne)}</span>
    <span>${escapeHtml(settings.wordmark.lineTwo)}</span>
    <small>${escapeHtml(settings.wordmark.label)}</small>
  </a>`;

const archiveNavigation = () => `
  <nav aria-label="Primary navigation">
    <a data-view="All" href="${siteUrl}/#archive">Browse</a>
    <a data-view="Interview" href="${siteUrl}/#interviews"><span class="kind-dot" data-kind="Interview" aria-hidden="true"></span> Interviews</a>
    <a data-view="Live" href="${siteUrl}/#live"><span class="kind-dot" data-kind="Live" aria-hidden="true"></span> Live</a>
    <a data-view="Guest mix" href="${siteUrl}/#mixes"><span class="kind-dot" data-kind="Guest mix" aria-hidden="true"></span> Mixes</a>
  </nav>`;

const homepageFallback = () => `
  <main class="static-fallback" id="top">
    <header class="site-header shell">
      ${wordmark("/#top")}
      ${archiveNavigation()}
    </header>
    <section class="static-index shell" aria-labelledby="static-index-title">
      <p class="eyebrow">${escapeHtml(settings.hero.eyebrow)}</p>
      <h1 id="static-index-title">${escapeHtml(settings.metadata.title)}</h1>
      <p>${escapeHtml(settings.hero.introduction)}</p>
      <div class="static-index-list">
        ${entries
          .map(
            (entry) => `
          <a href="${escapeHtml(entryPath(entry))}">
            <span>${escapeHtml(entry.kind)}</span>
            <strong>${escapeHtml(entry.artist)}</strong>
            <small>${escapeHtml(entry.title)}</small>
            <em>${escapeHtml(entry.year ?? "Date unconfirmed")}</em>
          </a>`,
          )
          .join("")}
      </div>
    </section>
    <footer class="site-footer shell">
      <p>${escapeHtml(settings.footer.text)}</p>
      <a href="#top">${escapeHtml(settings.footer.backToTopLabel)} →</a>
    </footer>
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

const sourceRows = (entry) =>
  entry.sources
    .map(
      (source, index) => `
      <a class="holding-row" data-holding="${index === 0 ? "primary" : "alternate"}" href="${escapeHtml(source.href)}" target="_blank" rel="noopener noreferrer">
        <span class="holding-disc" aria-hidden="true"></span>
        <span class="holding-label">${escapeHtml(source.label)}</span>
        <small class="holding-access">${escapeHtml(source.access)}</small>
        <span class="holding-duration">${escapeHtml(source.duration || "—")}</span>
        <span aria-hidden="true">→</span>
      </a>`,
    )
    .join("");

const transcriptBlock = (entry) => {
  if (!entry.transcript?.trim()) return "";
  const paragraphs = entry.transcript
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");
  return `
    <details class="static-transcript">
      <summary><span class="transcript-marker" aria-hidden="true">T</span> Read transcript <span aria-hidden="true">↓</span></summary>
      <div class="transcript-copy">${paragraphs}</div>
    </details>`;
};

const relatedBlock = (entry) => {
  const related = relatedEntriesFor(entry);
  if (!related.length) return "";
  return `
    <section class="static-related" aria-labelledby="related-title">
      <p class="dialog-section-label" id="related-title">Elsewhere in the archive</p>
      ${related
        .map(
          (relatedEntry) => `
        <a href="${escapeHtml(entryPath(relatedEntry))}">
          <span>${escapeHtml(relatedEntry.artist)}</span>
          <small>${escapeHtml(relatedEntry.kind)} / ${escapeHtml(relatedEntry.year ?? "Date unconfirmed")}</small>
          <span aria-hidden="true">→</span>
        </a>`,
        )
        .join("")}
    </section>`;
};

const entryDocument = (entry) => {
  const title = entryPageTitle(entry);
  const description = entryDescription(entry);
  const url = entryUrl(entry);
  const mediaType = entry.kind === "Guest mix" || entry.kind === "Live" ? "AudioObject" : "CreativeWork";
  const media = {
    "@type": mediaType,
    name: entry.title,
    description,
    contentUrl: entry.href,
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

  const content = `
  <main class="static-entry-page" id="top">
    <header class="site-header shell">
      ${wordmark(`${siteUrl}/`)}
      ${archiveNavigation()}
    </header>
    <article class="static-entry shell" data-kind="${escapeHtml(entry.kind)}">
      <a class="static-back" href="${siteUrl}/#archive">← Back to the archive</a>
      <p class="eyebrow dialog-eyebrow">${escapeHtml(entry.kind)}${entry.date ? ` / ${escapeHtml(entry.date)}` : ""}</p>
      <h1>${escapeHtml(entry.artist)}</h1>
      <h2>${escapeHtml(entry.title)}</h2>
      ${entry.summary ? `<p class="dialog-summary">${escapeHtml(entry.summary)}</p>` : ""}
      ${transcriptBlock(entry)}
      <dl>
        ${entry.presenters ? `<div><dt>Presented by</dt><dd>${escapeHtml(entry.presenters)}</dd></div>` : ""}
        ${entry.duration ? `<div><dt>Duration</dt><dd>${escapeHtml(entry.duration)}</dd></div>` : ""}
        <div><dt>Access</dt><dd><span class="audio-status" aria-hidden="true"></span>${escapeHtml(entry.access)}</dd></div>
      </dl>
      <p class="dialog-section-label">${entry.sources.length === 1 ? "Source" : `${entry.sources.length} sources`}</p>
      <div class="holdings">${sourceRows(entry)}</div>
      <p class="dialog-section-label">Filed under</p>
      <div class="tag-list" aria-label="Subjects">
        ${entry.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
      </div>
      ${relatedBlock(entry)}
    </article>
    <footer class="site-footer shell">
      <p>${escapeHtml(settings.footer.text)}</p>
      <a href="#top">${escapeHtml(settings.footer.backToTopLabel)} →</a>
    </footer>
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
    `<div id="root"></div><noscript>${homepageFallback()}</noscript>`,
  ),
  {
    title: settings.metadata.title,
    description: settings.metadata.description,
    url: `${siteUrl}/`,
    schema: homepageSchema,
  },
);
fs.writeFileSync(indexFilename, homepage);

for (const entry of entries) {
  const directory = path.join(distDirectory, "archive", entry.id);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "index.html"), entryDocument(entry));
}

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${escapeXml(`${siteUrl}/`)}</loc></url>
${entries.map((entry) => `  <url><loc>${escapeXml(entryUrl(entry))}</loc></url>`).join("\n")}
</urlset>
`;
fs.writeFileSync(path.join(distDirectory, "sitemap.xml"), sitemap);
fs.writeFileSync(
  path.join(distDirectory, "robots.txt"),
  `User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: ${siteUrl}/sitemap.xml\n`,
);

console.log(`Generated ${entries.length} permanent archive pages and sitemap.xml.`);
