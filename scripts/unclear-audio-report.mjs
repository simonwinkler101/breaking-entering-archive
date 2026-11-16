#!/usr/bin/env node
// unclear-audio-report.mjs — the listening list.
//
// Lists every [Unclear audio] marker in the private reading drafts, so the
// "correct afterwards" half of publishing actually happens: markers with no
// time first (they need one from the timestamped source), then timed gaps,
// longest first, with the words on either side. Public transcripts carry no
// markers (docs/transcription-workflow.md section 4); without --from, the
// report checks the published pages and should find none.
//
// The list is review state, so keep it private: print it, or write it outside
// the repository, e.g. under BNE_MEDIA_ROOT.
//
// Usage:
//   npm run transcripts:gaps -- --from <draft.md or folder>  # the listening list
//   npm run transcripts:gaps                                 # check public pages
//   npm run transcripts:gaps -- --out <path>                 # write it to a private file
//   npm run transcripts:gaps -- --min 15                     # only gaps of 15 seconds or more

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findUnclearMarkers, LONG_GAP_SECONDS } from "./transcript-status.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
let out;
let from;
let min = 0;
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === "--out") out = argv[++i];
  else if (argv[i] === "--from") from = argv[++i];
  else if (argv[i] === "--min") min = Number(argv[++i]) || 0;
  else {
    console.error(`Unknown option "${argv[i]}".`);
    process.exit(1);
  }
}
if (out && path.resolve(out).startsWith(repoRoot + path.sep)) {
  console.error("The listening list is private review state; write it outside the repository.");
  process.exit(1);
}

const words = (text, count, fromEnd) => {
  const list = text.replace(/\[[^\]]*\]/g, "[…]").split(/\s+/).filter(Boolean);
  return (fromEnd ? list.slice(-count) : list.slice(0, count)).join(" ");
};
const clock = (value) => {
  const total = Math.round(value);
  const m = Math.floor(total / 60);
  return m ? `${m} min ${String(total % 60).padStart(2, "0")} s` : `${total} s`;
};

const sources = [];
if (from) {
  const target = path.resolve(from);
  const files = fs.statSync(target).isDirectory()
    ? fs.readdirSync(target).filter((name) => name.endsWith(".md")).sort().map((name) => path.join(target, name))
    : [target];
  for (const file of files) {
    const id = path.basename(file, ".md");
    sources.push({ entry: { id, label: id }, transcript: fs.readFileSync(file, "utf8") });
  }
} else {
  const dir = path.join(repoRoot, "content", "archive");
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".json")).sort()) {
    const entry = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    sources.push({
      entry: { id: entry.id, label: `${entry.artist}, ${entry.date || "undated"}` },
      transcript: entry.transcript || "",
    });
  }
}

const rows = [];
for (const { entry, transcript } of sources) {
  for (const marker of findUnclearMarkers(transcript)) {
    if (marker.timed && marker.length < min) continue;
    rows.push({
      entry,
      marker,
      before: words(transcript.slice(0, marker.index), 8, true),
      after: words(transcript.slice(marker.index + marker.text.length), 8, false),
    });
  }
}

const line = ({ entry, marker, before, after }) =>
  `- ${entry.label} (\`${entry.id}\`): ${marker.text}` +
  `${marker.timed ? `, ${clock(marker.length)}` : ""}\n  …${before} ▮ ${after}…`;

const untimed = rows.filter((row) => !row.marker.timed);
const timed = rows.filter((row) => row.marker.timed).sort((a, b) => b.marker.length - a.marker.length);
const long = timed.filter((row) => row.marker.length >= LONG_GAP_SECONDS);
const entries = new Set(rows.map((row) => row.entry.id));

const report = [
  "# Unclear audio: listening list",
  "",
  `${rows.length} markers in ${entries.size} ${from ? "drafts" : "published transcripts"}. ` +
    `${untimed.length} have no time; ` +
    `${long.length} run a minute or more (probably songs: confirm and mark [Music], or transcribe).`,
  "",
  "## Needs a time",
  "",
  ...(untimed.length ? untimed.map(line) : ["None."]),
  "",
  "## Timed, longest first",
  "",
  ...(timed.length ? timed.map(line) : ["None."]),
  "",
].join("\n");

if (out) {
  fs.writeFileSync(out, report);
  console.log(`Wrote ${rows.length} markers to ${out}`);
} else {
  process.stdout.write(report);
}
