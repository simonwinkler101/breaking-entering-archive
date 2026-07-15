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
  if (!Array.isArray(entry.sources) || !entry.sources.length) {
    throw new Error(`${entry.id} needs at least one source.`);
  }
  if (ids.has(entry.id)) throw new Error(`Duplicate archive id: ${entry.id}`);
  ids.add(entry.id);
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
