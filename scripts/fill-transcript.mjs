#!/usr/bin/env node
// fill-transcript.mjs — add a prepared public transcript to an
// EXISTING archive entry, without touching any of its other fields.
//
// This is the "Stage 2" publish step: the website record already holds the
// metadata (title, date, sources, …); all this does is fill the two gaps a
// new interview leaves behind — `transcript` and `pullQuote`. It is the
// codified version of the in-place edit used for the Lael Neale and Mark
// Ronson entries.
//
// Usage:
//   node scripts/fill-transcript.mjs <slug> [options]
//   npm run fill:transcript -- <slug> [options]
//
// Options:
//   --md <path>        Public-only transcript markdown. Defaults to
//                      <BNE_MEDIA_ROOT>/transcripts/ready-to-publish/<slug>.md
//   --quote "<text>"   Pull-quote text. Overrides the options in the markdown.
//   --quote-index <n>  Pick the n-th (1-based) quote from the markdown's
//                      "## Pull quote options" list. Quotes are used only
//                      when --quote or --quote-index is explicitly supplied.
//   --speaker "<name>" Pull-quote speaker. Defaults to the entry's artist.
//   --no-quote         Do not add a pull quote at all.
//   --gaps-checked     Publish despite an unclear-audio gap of a minute or
//                      more, once someone has listened and it stays
//                      unintelligible (docs/transcription-workflow.md §4).
//   --dry-run          Show what would change; write nothing.
//
// It deliberately REFUSES to run when content/archive/<slug>.json does not
// already exist, so it can never overwrite metadata or drop a source. To
// create a brand-new entry, add the JSON first, then run this.
//
// It does not commit, push or deploy. After it runs: `npm run build`, then
// branch / PR / merge as usual (or use the /publish-transcript command).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { publicTranscriptMarkdown, unclearAudioProblems, LONG_GAP_SECONDS } from "./transcript-status.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mediaRoot =
  process.env.BNE_MEDIA_ROOT ||
  path.join(os.homedir(), "Documents-Local", "breaking-entering-archive-media");

const fail = (message) => {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
};

// --- parse args ---
const argv = process.argv.slice(2);
const opts = {};
let slug;
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  if (a === "--dry-run") opts.dryRun = true;
  else if (a === "--no-quote") opts.noQuote = true;
  else if (a === "--gaps-checked") opts.gapsChecked = true;
  else if (a === "--md") opts.md = argv[++i];
  else if (a === "--quote") opts.quote = argv[++i];
  else if (a === "--quote-index") opts.quoteIndex = Number(argv[++i]);
  else if (a === "--speaker") opts.speaker = argv[++i];
  else if (a.startsWith("--")) fail(`Unknown option "${a}".`);
  else if (!slug) slug = a;
  else fail(`Unexpected extra argument "${a}".`);
}

if (!slug) {
  fail("Give the entry's slug, e.g.  npm run fill:transcript -- mark-ronson");
}
if (!/^[a-z0-9-]+$/.test(slug)) {
  fail(`"${slug}" should be lowercase words joined by hyphens, e.g. mark-ronson.`);
}

const entryPath = path.join(repoRoot, "content", "archive", `${slug}.json`);
if (!fs.existsSync(entryPath)) {
  fail(
    `No existing entry at content/archive/${slug}.json.\n` +
      `  This tool fills an existing record; create the entry JSON first.`,
  );
}

const mdPath = opts.md
  ? path.resolve(opts.md)
  : path.join(mediaRoot, "transcripts", "ready-to-publish", `${slug}.md`);
if (!fs.existsSync(mdPath)) {
  fail(
    `Can't find the transcript:\n    ${mdPath}\n` +
      `  Save it there, or pass --md <path>.`,
  );
}

// --- turn public markdown into the plain-text transcript the site stores ---
const toTranscript = (markdown) => {
  let text = publicTranscriptMarkdown(markdown).replace(/<!--[\s\S]*?-->/g, "");
  const pq = text.search(/^\s*#{1,6}\s*Pull quote options/im);
  if (pq !== -1) text = text.slice(0, pq); // drop the pull-quote-options section
  const lines = text
    .split("\n")
    .filter((line) => !/^\s*#\s+/.test(line)) // drop the H1 title line
    .filter((line) => !/^\s*-{3,}\s*$/.test(line)); // drop --- dividers
  return lines
    .join("\n")
    .replace(/\*\*/g, "") // drop bold markers
    .replace(/\*/g, "") // drop italic markers
    .replace(/\n{3,}/g, "\n\n") // collapse extra blank lines
    .trim();
};

// --- pull the "## Pull quote options" list, if present ---
const readQuoteOptions = (markdown) => {
  const lines = markdown.split("\n");
  const headingIdx = lines.findIndex((line) =>
    /^\s*#{1,6}\s*Pull quote options/i.test(line),
  );
  if (headingIdx === -1) return [];
  const quotes = [];
  for (let i = headingIdx + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*#{1,6}\s/.test(line)) break; // next heading ends the list
    const m = line.match(/^\s*[-*]\s+["“](.+)["”]\s*$/);
    if (m) quotes.push(m[1].trim());
  }
  return quotes;
};

const markdown = fs.readFileSync(mdPath, "utf8");
let transcript;
try { transcript = toTranscript(markdown); }
catch (error) { fail(error.message); }
if (!transcript) fail("The transcript file has no readable text after cleanup.");

// --- unclear audio: every marker timed; long gaps identified first ---
const gaps = unclearAudioProblems(transcript);
if (gaps.untimed.length) {
  fail(
    `${gaps.untimed.length} [Unclear audio] marker(s) have no time.\n` +
      `  Give each its time from the timestamped source, e.g. [Unclear audio at 00:12:34–00:12:41].`,
  );
}
if (gaps.long.length && !opts.gapsChecked) {
  fail(
    `Unclear-audio gap(s) of ${LONG_GAP_SECONDS} seconds or more:\n` +
      gaps.long.map((gap) => `    ${gap.text}  (${Math.round(gap.length)} s)`).join("\n") +
      `\n  Identify each first: mark music as [Music] once established, or transcribe the speech.\n` +
      `  If someone has listened and it stays unintelligible, rerun with --gaps-checked.`,
  );
}

const entry = JSON.parse(fs.readFileSync(entryPath, "utf8"));

// --- speakers: no new Host:/Guest: placeholders (workflow section 7) ---
const roleLabels = (text) => (String(text || "").match(/^(?:Host|Guest):/gm) || []).length;
const addedRoles = roleLabels(transcript) - roleLabels(entry.transcript);
if (addedRoles > 0) {
  fail(
    `${addedRoles} new Host:/Guest: label(s). New transcripts name every voice:\n` +
      `  use the recording or speaker separation, or credit an unnamed band member to the band and ask Simon or Lauren.`,
  );
}

// --- decide the pull quote ---
let pullQuote;
if (!opts.noQuote && (opts.quote || opts.quoteIndex !== undefined)) {
  let text = opts.quote;
  if (!text) {
    const options = readQuoteOptions(markdown);
    if (options.length) {
      const idx = opts.quoteIndex - 1;
      if (idx < 0 || idx >= options.length) {
        fail(`--quote-index ${opts.quoteIndex} is out of range (1..${options.length}).`);
      }
      text = options[idx];
    }
  }
  if (text) {
    pullQuote = { text, speaker: opts.speaker || entry.artist };
  } else {
    console.warn(
      `  ! No pull quote found (no "## Pull quote options" and no --quote). ` +
        `Continuing without one.`,
    );
  }
}

// --- rebuild preserving key order: transcript + pullQuote sit after summary ---
const rebuilt = {};
let placed = false;
for (const [k, v] of Object.entries(entry)) {
  if (k === "transcript" || k === "transcriptStatus" || k === "pullQuote") continue;
  rebuilt[k] = v;
  if (k === "summary") {
    rebuilt.transcript = transcript;
    if (pullQuote) rebuilt.pullQuote = pullQuote;
    placed = true;
  }
}
if (!placed) {
  // No "summary" key to anchor on: append at the end instead.
  rebuilt.transcript = transcript;
  if (pullQuote) rebuilt.pullQuote = pullQuote;
}

const hadTranscript = typeof entry.transcript === "string" && entry.transcript.length > 0;
const preview = transcript.slice(0, 200).replace(/\n+/g, " ");

console.log(`\n  Entry:       ${entry.artist} — ${entry.title}`);
console.log(`  File:        content/archive/${slug}.json${hadTranscript ? "  (replaces existing transcript)" : ""}`);
console.log(`  Source md:   ${mdPath}`);
console.log(`  Transcript:  ${transcript.length} characters`);
console.log(`  Starts:      "${preview}…"`);
console.log(`  Pull quote:  ${pullQuote ? `"${pullQuote.text}" — ${pullQuote.speaker}` : "(none)"}`);

if (opts.dryRun) {
  console.log(`\n  Dry run — nothing was written. Remove --dry-run to apply.\n`);
  process.exit(0);
}

fs.writeFileSync(entryPath, `${JSON.stringify(rebuilt, null, 2)}\n`);
console.log(`\n  ✓ Updated content/archive/${slug}.json`);
console.log(`\n  Next: npm run build, then branch / commit / PR / merge`);
console.log(`        (or run the whole flow with the /publish-transcript command).\n`);
