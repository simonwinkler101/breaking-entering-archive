import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateTranscriptStatus } from "./transcript-status.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const archiveDirectory = path.join(root, "content/archive");
const dataDirectory = path.join(root, "data");

const readJson = (filename) => JSON.parse(fs.readFileSync(filename, "utf8"));
const writeJson = (filename, value) =>
  fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`);

const entries = fs
  .readdirSync(archiveDirectory)
  .filter((filename) => filename.endsWith(".json"))
  .map((filename) => readJson(path.join(archiveDirectory, filename)));

if (!entries.length) throw new Error("The public archive has no entries.");
if (entries.some((entry) => entry.kind === "Broadcast")) {
  throw new Error("Broadcast entries belong in content/private/broadcast-archive.json, not the public archive.");
}

const ids = new Set();
for (const entry of entries) {
  validateTranscriptStatus(entry);
  for (const required of ["id", "artist", "title", "kind", "href"]) {
    if (!entry[required]) throw new Error(`${entry.id || "Unknown entry"} is missing ${required}.`);
  }
  if (!Array.isArray(entry.tags)) throw new Error(`${entry.id} needs a subjects array.`);
  if (entry.aliases !== undefined && !Array.isArray(entry.aliases)) {
    throw new Error(`${entry.id} aliases must be an array.`);
  }
  if (!Array.isArray(entry.sources) || !entry.sources.length) {
    throw new Error(`${entry.id} needs at least one source.`);
  }
  if (entry.pullQuote !== undefined) {
    const quote = entry.pullQuote;
    if (typeof quote !== "object" || Array.isArray(quote) || quote === null) {
      throw new Error(`${entry.id} pullQuote must be an object.`);
    }
    if (typeof quote.text !== "string" || !quote.text.trim()) {
      throw new Error(`${entry.id} pullQuote.text must be a non-empty string.`);
    }
    if (typeof quote.speaker !== "string" || !quote.speaker.trim()) {
      throw new Error(`${entry.id} pullQuote.speaker must be a non-empty string.`);
    }
    if (!entry.transcript?.trim()) {
      throw new Error(`${entry.id} has a pullQuote but no transcript.`);
    }
  }
  if (entry.audio !== undefined && entry.audio !== null) {
    const audio = entry.audio;
    try {
      if (typeof audio !== "object" || Array.isArray(audio)) throw new Error();
      const url = new URL(audio.url);
      // Published audio must have a stable address, not a credential-bearing
      // or expiring signed URL. Original recordings stay outside Git.
      if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
        throw new Error();
      }
      if (!["audio/mpeg", "audio/mp4", "audio/ogg", "audio/wav", "audio/webm"].includes(audio.type)) {
        throw new Error();
      }
    } catch {
      throw new Error(`${entry.id} audio needs a stable https URL without credentials, query or fragment, and a supported audio MIME type.`);
    }
  }
  if (ids.has(entry.id)) throw new Error(`Duplicate archive id: ${entry.id}`);
  if (!/^[A-Za-z0-9._-]+$/.test(entry.id)) {
    throw new Error(`${entry.id} is not safe to use in a permanent archive address.`);
  }
  if (!/^https?:\/\//.test(entry.href)) {
    throw new Error(`${entry.id} has an invalid primary link: ${entry.href}`);
  }
  for (const source of entry.sources) {
    if (!/^https?:\/\//.test(source.href)) {
      throw new Error(`${entry.id} has an invalid source link: ${source.href}`);
    }
  }
  ids.add(entry.id);
}

const siteSettings = readJson(path.join(root, "content/site-settings.json"));
const about = readJson(path.join(root, "content/about.json"));
if (!about.title?.trim() || !about.introduction?.trim() || !Array.isArray(about.groups) || !about.groups.length) {
  throw new Error("The project directory needs a title, introduction and link groups.");
}
const projectUrls = new Set();
for (const group of about.groups) {
  if (!group.heading?.trim() || !Array.isArray(group.links) || !group.links.length) {
    throw new Error("Every project directory group needs a heading and links.");
  }
  for (const link of group.links) {
    try {
      const url = new URL(link.url);
      if (!link.label?.trim() || url.protocol !== "https:" || url.username || url.password) throw new Error();
      if (/(^|\.)spotify\.(com|link)$/.test(url.hostname)) throw new Error();
      if (projectUrls.has(url.href)) throw new Error();
      projectUrls.add(url.href);
    } catch {
      throw new Error("Project links need unique, verified public HTTPS addresses and plain labels. Spotify links are excluded.");
    }
  }
}
try {
  const publicSiteUrl = new URL(siteSettings.metadata.siteUrl);
  if (
    publicSiteUrl.protocol !== "https:" ||
    publicSiteUrl.pathname !== "/" ||
    publicSiteUrl.search ||
    publicSiteUrl.hash ||
    publicSiteUrl.username ||
    publicSiteUrl.password
  ) {
    throw new Error();
  }
} catch {
  throw new Error("Site settings metadata.siteUrl must be a complete https origin without a path.");
}

// Display fields are derived here so the application and the permanent pages
// agree. Most source titles repeat the artist and the program name; the public
// site shows a name, plus a title only when it adds something.
const showName = String.raw`breaking\s*(?:and|&)\s*entering`;
const fold = (value = "") =>
  value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isGenericArtist = (artist) => fold(artist) === "breaking and entering";

const cleanTitle = (entry) => {
  const artist = escapeRegExp(entry.artist.trim());
  let title = entry.title.trim();
  title = title.replace(new RegExp(String.raw`^${showName}\s*[:\-–—]\s*`, "i"), "");
  title = title.replace(new RegExp(String.raw`^${showName}\s+with\s+`, "i"), "");
  title = title.replace(new RegExp(String.raw`\s*(?:[\-–—:]|\bon)?\s*${showName}$`, "i"), "");
  if (new RegExp(String.raw`^${showName}$`, "i").test(title)) title = "";
  title = title.replace(new RegExp(String.raw`^(rising:\s*)${showName}\s*[\-–—:]\s*`, "i"), "$1");
  title = title.replace(/\s*\(interviewed at 3rrr\)$/i, "");
  title = title.replace(new RegExp(String.raw`^${artist}\s*[\-–—:]\s*`, "i"), "");
  title = title.replace(new RegExp(String.raw`\s+with\s+${artist}$`, "i"), "");
  title = title.replace(
    new RegExp(String.raw`^live at (?:rrr|3rrr|triple r)\s*:\s*${artist}(?:\s*\(live stream\))?$`, "i"),
    "",
  );
  title = title.replace(
    new RegExp(String.raw`^${artist}\s+(?:interview\s+)?on\s+(?:3rrr|triple r)(?:\s*fm)?$`, "i"),
    "",
  );
  title = title.replace(new RegExp(String.raw`\s+by\s+${artist}$`, "i"), "");
  title = title.replace(new RegExp(String.raw`^${artist}\s+(?=\()`, "i"), "");
  title = title.replace(/\s*\(live (?:at|from)[^)]*\)$/i, "");
  title = title.replace(/^\((.*)\)$/, "$1").trim();
  return fold(title) === fold(entry.artist) ? "" : title;
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

for (const entry of entries) {
  const title = cleanTitle(entry);
  const useTitleAsName =
    Boolean(title) && (isGenericArtist(entry.artist) || entry.kind === "Special program");
  const displayName = useTitleAsName ? title : entry.artist;
  let displayTitle = useTitleAsName ? (isGenericArtist(entry.artist) ? "" : entry.artist) : title;
  if (displayTitle && fold(displayName).includes(fold(displayTitle))) displayTitle = "";
  entry.display = {
    name: displayName,
    title: displayTitle,
    duration: formatDuration(entry.duration),
  };
}

entries.sort((a, b) => {
  if (!a.dateKey && !b.dateKey) return a.artist.localeCompare(b.artist);
  if (!a.dateKey) return 1;
  if (!b.dateKey) return -1;
  return b.dateKey.localeCompare(a.dateKey) || a.artist.localeCompare(b.artist);
});

// data/ holds generated outputs only; everything is derived from canonical
// content/ sources. content/archive-research.json carries the non-derived
// research material (researchSnapshot, scopeNote, recoveryLeads, sourceHubs).
const research = readJson(path.join(root, "content/archive-research.json"));
for (const required of ["researchSnapshot", "scopeNote", "recoveryLeads", "sourceHubs"]) {
  if (research[required] === undefined) {
    throw new Error(`content/archive-research.json is missing ${required}.`);
  }
}
const kindCounts = Object.fromEntries(
  [...new Set(entries.map((entry) => entry.kind))].map((kind) => [
    kind,
    entries.filter((entry) => entry.kind === kind).length,
  ]),
);

fs.mkdirSync(dataDirectory, { recursive: true });
writeJson(path.join(dataDirectory, "archive-data.json"), {
  metadata: {
    researchSnapshot: research.researchSnapshot,
    sourceRecordCount: entries.reduce((count, entry) => count + (entry.sources?.length ?? 0), 0),
    itemCount: entries.length,
    dateUnconfirmedCount: entries.filter((entry) => !entry.dateKey).length,
    subscriberOnlyItemCount: entries.filter((entry) => entry.access === "RRR subscriber" && !entry.audio).length,
    kindCounts,
    recoveryLeadCount: research.recoveryLeads.length,
    scopeNote: research.scopeNote,
  },
  entries,
  recoveryLeads: research.recoveryLeads,
  sourceHubs: research.sourceHubs,
});

for (const filename of ["site-settings.json", "archive-associations.json", "about.json"]) {
  fs.copyFileSync(path.join(root, "content", filename), path.join(dataDirectory, filename));
}

console.log(`Built ${entries.length} public archive records.`);
