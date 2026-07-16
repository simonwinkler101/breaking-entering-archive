import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const archive = JSON.parse(fs.readFileSync(path.join(root, "data/archive-data.json"), "utf8"));
const curated = JSON.parse(fs.readFileSync(path.join(root, "data/curated-entries.json"), "utf8"));
const outputDirectory = path.join(root, "content/archive");

const importedBySourceUrl = new Map();
for (const entry of archive.entries) {
  for (const source of entry.sources) importedBySourceUrl.set(source.href, entry);
}

const matchedImportedIds = new Set();
const enrichedCuratedEntries = curated.map((entry) => {
  const imported = importedBySourceUrl.get(entry.href);
  if (imported) matchedImportedIds.add(imported.id);
  return {
    ...imported,
    ...entry,
    access: imported?.access ?? "Public",
    sources: imported?.sources ?? [
      {
        id: `curated-${entry.id}`,
        label: "Triple R segment",
        href: entry.href,
        access: "Public",
        duration: entry.duration,
        status: "Confirmed Triple R segment",
      },
    ],
    tags: [...new Set([...(imported?.tags ?? []), ...entry.tags])],
  };
});

const entries = [
  ...enrichedCuratedEntries,
  ...archive.entries.filter((entry) => !matchedImportedIds.has(entry.id)),
].filter((entry) => entry.kind !== "Broadcast");

fs.mkdirSync(outputDirectory, { recursive: true });
for (const filename of fs.readdirSync(outputDirectory)) {
  if (filename.endsWith(".json")) fs.unlinkSync(path.join(outputDirectory, filename));
}

for (const entry of entries) {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(entry.id)) {
    throw new Error(`Entry id cannot be used as a filename: ${entry.id}`);
  }
  fs.writeFileSync(
    path.join(outputDirectory, `${entry.id}.json`),
    `${JSON.stringify(entry, null, 2)}\n`,
  );
}

console.log(`Prepared ${entries.length} public archive records for editing.`);
