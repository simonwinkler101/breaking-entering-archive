import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { publicTranscriptMarkdown, findUnclearMarkers, unclearAudioProblems } from "./transcript-status.mjs";

const exec = promisify(execFile);
const scripts = path.dirname(fileURLToPath(import.meta.url));

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

test("filler excludes public status/private headers and preserves all other entry metadata", async (t) => {
  const f = await fixture(t);
  await fs.writeFile(f.entryPath, JSON.stringify({ ...f.entry, transcriptStatus: "draft" }));
  await fs.writeFile(f.md, "# Guest — private reading draft\n\nStatus: machine draft\n\nSource path: /Users/example/audio.wav\n\n## Unverified transcript text\n\nThe spoken words stay.\n\n## Private review notes\n\nDo not publish these.\n");
  await f.run();
  const actual = JSON.parse(await fs.readFile(f.entryPath, "utf8"));
  assert.deepEqual(actual, { ...f.entry, transcript: "The spoken words stay." });
});

test("filler refuses unsectioned private metadata and removed status options without changing the entry", async (t) => {
  const f = await fixture(t);
  const before = await fs.readFile(f.entryPath, "utf8");
  await fs.writeFile(f.md, "# Guest — private reading draft\n\nStatus: machine draft\n\nUnsectioned words.");
  await assert.rejects(f.run(), /Private review metadata/);
  assert.equal(await fs.readFile(f.entryPath, "utf8"), before);
  await fs.writeFile(f.md, "# Guest\n\nPublic words.");
  await assert.rejects(f.run("--status", "draft"), /Unknown option/);
  assert.equal(await fs.readFile(f.entryPath, "utf8"), before);
});

test("new publication uses no quote unless one is explicitly selected", async (t) => {
  const f = await fixture(t);
  await fs.writeFile(f.md, "# Guest\n\nThe checked words.\n\n## Pull quote options\n\n- “The checked words.”\n");
  await f.run();
  let actual = JSON.parse(await fs.readFile(f.entryPath, "utf8"));
  assert.equal(actual.pullQuote, undefined);
  assert.equal(actual.transcriptStatus, undefined);
  await f.run("--quote-index", "1");
  actual = JSON.parse(await fs.readFile(f.entryPath, "utf8"));
  assert.deepEqual(actual.pullQuote, { text: "The checked words.", speaker: "Guest" });
});

test("unclear-audio markers are parsed with their times", () => {
  const markers = findUnclearMarkers("A [Unclear audio at 00:01:46–00:01:49] b [Unclear audio at 00:04:17.800–00:04:18.840] c [Unclear audio] d [Unclear audio at 00:10:04–00:19:19]");
  assert.deepEqual(markers.map((m) => [m.timed, m.length && Math.round(m.length * 100) / 100]), [[true, 3], [true, 1.04], [false, null], [true, 555]]);
  const problems = unclearAudioProblems("x [Unclear audio] y [Unclear audio at 00:06:35–00:09:39] z [Unclear audio at 00:00:01–00:00:59]");
  assert.equal(problems.untimed.length, 1);
  assert.deepEqual(problems.long.map((m) => m.length), [184]);
});

test("filler refuses untimed markers and unidentified long gaps", async (t) => {
  const f = await fixture(t);
  const before = await fs.readFile(f.entryPath, "utf8");
  await fs.writeFile(f.md, "# Guest\n\nWords [Unclear audio] more words.");
  await assert.rejects(f.run(), /have no time/);
  await fs.writeFile(f.md, "# Guest\n\nWords.\n\n[Unclear audio at 00:06:35–00:09:39]\n\nMore words.");
  await assert.rejects(f.run(), /minute or more|60 seconds or more/);
  assert.equal(await fs.readFile(f.entryPath, "utf8"), before);
  await f.run("--gaps-checked");
  assert.match(JSON.parse(await fs.readFile(f.entryPath, "utf8")).transcript, /00:06:35–00:09:39/);
  await fs.writeFile(f.md, "# Guest\n\nWords [Unclear audio at 00:01:46–00:01:49] more words.");
  await f.run();
});

test("filler refuses new Host:/Guest: labels but keeps existing ones on correction", async (t) => {
  const f = await fixture(t);
  const labelled = "Intro.\n\nHost: A question?\n\nGuest: An answer.";
  await fs.writeFile(f.md, `# Guest\n\n${labelled}`);
  await assert.rejects(f.run(), /new Host:\/Guest:/);
  await fs.writeFile(f.entryPath, JSON.stringify({ ...f.entry, transcript: labelled }));
  await fs.writeFile(f.md, `# Guest\n\n${labelled.replace("Intro.", "Intro, corrected.")}`);
  await f.run();
  await fs.writeFile(f.md, `# Guest\n\n${labelled}\n\nGuest: Another answer.`);
  await assert.rejects(f.run(), /1 new Host:\/Guest:/);
});
