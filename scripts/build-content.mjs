import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

entries.sort((a, b) => {
  if (!a.dateKey && !b.dateKey) return a.artist.localeCompare(b.artist);
  if (!a.dateKey) return 1;
  if (!b.dateKey) return -1;
  return b.dateKey.localeCompare(a.dateKey) || a.artist.localeCompare(b.artist);
});

const existingArchive = readJson(path.join(dataDirectory, "archive-data.json"));
const kindCounts = Object.fromEntries(
  [...new Set(entries.map((entry) => entry.kind))].map((kind) => [
    kind,
    entries.filter((entry) => entry.kind === kind).length,
  ]),
);

writeJson(path.join(dataDirectory, "archive-data.json"), {
  ...existingArchive,
  metadata: {
    ...existingArchive.metadata,
    sourceRecordCount: entries.reduce((count, entry) => count + (entry.sources?.length ?? 0), 0),
    itemCount: entries.length,
    dateUnconfirmedCount: entries.filter((entry) => !entry.dateKey).length,
    subscriberOnlyItemCount: entries.filter((entry) => entry.access === "RRR subscriber").length,
    kindCounts,
  },
  entries,
});

for (const filename of ["site-settings.json", "archive-associations.json"]) {
  fs.copyFileSync(path.join(root, "content", filename), path.join(dataDirectory, filename));
}

console.log(`Built ${entries.length} public archive records.`);
