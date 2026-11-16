import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { publicTranscriptMarkdown, validateTranscriptStatus } from "./transcript-status.mjs";

const exec = promisify(execFile);
const scripts = path.dirname(fileURLToPath(import.meta.url));

test("only transcript-bearing draft/reviewed statuses are accepted; legacy entries stay valid", () => {
  for (const entry of [
    { id: "legacy", transcript: "Existing approved words", pullQuote: { text: "words", speaker: "Guest" } },
    { id: "draft", transcript: "Unreviewed words", transcriptStatus: "draft" },
    { id: "reviewed", transcript: "Checked words", transcriptStatus: "reviewed" },
    { id: "empty" },
  ]) assert.doesNotThrow(() => validateTranscriptStatus(entry));
  for (const entry of [
    { id: "bad", transcript: "Words", transcriptStatus: "approved" },
    { id: "empty", transcriptStatus: "draft" },
    { id: "quote", transcript: "Words", transcriptStatus: "draft", pullQuote: { text: "Words", speaker: "Guest" } },
  ]) assert.throws(() => validateTranscriptStatus(entry));
});

test("private review metadata is extracted only at an explicit transcript section", () => {
  const privateDraft = "# Guest — private reading draft\n\nStatus: not reviewed\n\nSource path: /Users/example/audio.wav\n\n## Unverified transcript text\n\nWords stay exactly.\n\n## Private review notes\n\nDo not publish this.\n";
  assert.equal(publicTranscriptMarkdown(privateDraft).trim(), "Words stay exactly.");
  assert.throws(() => publicTranscriptMarkdown(privateDraft.replace("## Unverified transcript text", "## Notes")), /Private review metadata/);
  assert.throws(() => publicTranscriptMarkdown("Public intro\n\n/Users/example/private.md"), /Private paths/);
  assert.throws(() => publicTranscriptMarkdown("Source: `/Users/example/private.md`"), /Private paths/);
  assert.throws(() => publicTranscriptMarkdown("## Transcript\n\nSee editorial-review.md"), /review-file references/);
});

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bne-transcript-fill-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "scripts"));
  await fs.mkdir(path.join(root, "content/archive"), { recursive: true });
  for (const name of ["fill-transcript.mjs", "transcript-status.mjs"]) await fs.copyFile(path.join(scripts, name), path.join(root, "scripts", name));
  const entry = { id: "guest", artist: "Guest", title: "Interview", summary: "Existing summary", href: "https://example.com/source", sources: [{ href: "https://example.com/source" }], audio: { url: "https://example.com/audio.m4a", type: "audio/mp4" } };
  const entryPath = path.join(root, "content/archive/guest.json");
  await fs.writeFile(entryPath, JSON.stringify(entry));
  const md = path.join(root, "reading.md");
  return { root, entry, entryPath, md, run: (...args) => exec(process.execPath, [path.join(root, "scripts/fill-transcript.mjs"), "guest", "--md", md, ...args]) };
}

test("filler defaults to a labelled draft, excludes private headers and preserves all entry metadata", async (t) => {
  const f = await fixture(t);
  await fs.writeFile(f.md, "# Guest — private reading draft\n\nStatus: machine draft\n\nSource path: /Users/example/audio.wav\n\n## Unverified transcript text\n\nThe spoken words stay.\n\n## Private review notes\n\nDo not publish these.\n");
  await f.run();
  const actual = JSON.parse(await fs.readFile(f.entryPath, "utf8"));
  assert.deepEqual(actual, { ...f.entry, transcript: "The spoken words stay.", transcriptStatus: "draft" });
});

test("filler refuses unsectioned private metadata and invalid status without changing the entry", async (t) => {
  const f = await fixture(t);
  const before = await fs.readFile(f.entryPath, "utf8");
  await fs.writeFile(f.md, "# Guest — private reading draft\n\nStatus: machine draft\n\nUnsectioned words.");
  await assert.rejects(f.run(), /Private review metadata/);
  assert.equal(await fs.readFile(f.entryPath, "utf8"), before);
  await fs.writeFile(f.md, "# Guest\n\nPublic words.");
  await assert.rejects(f.run("--status", "approved"), /draft or reviewed/);
  assert.equal(await fs.readFile(f.entryPath, "utf8"), before);
});

test("reviewed publication remains explicit and draft publication cannot select a quote", async (t) => {
  const f = await fixture(t);
  await fs.writeFile(f.md, "# Guest\n\nThe checked words.\n\n## Pull quote options\n\n- “The checked words.”\n");
  await assert.rejects(f.run("--quote", "The checked words."), /Draft transcripts do not use pull quotes/);
  await f.run("--status", "reviewed");
  const actual = JSON.parse(await fs.readFile(f.entryPath, "utf8"));
  assert.equal(actual.transcriptStatus, "reviewed");
  assert.deepEqual(actual.pullQuote, { text: "The checked words.", speaker: "Guest" });
});
