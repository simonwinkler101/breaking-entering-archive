import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { createPlan, eligibleEntries, parseArgs, renderDraft, runQueue, sha256 } from "./transcribe-interviews.mjs";

async function fixture(t, records) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bne-transcription-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const repo = path.join(root, "repo"), media = path.join(root, "media");
  await fs.mkdir(path.join(repo, "content/archive"), { recursive: true });
  await fs.mkdir(path.join(media, "manifests"), { recursive: true });
  await fs.mkdir(path.join(media, "incoming"));
  const model = path.join(media, "model.bin"); await fs.writeFile(model, "fixed-test-model");
  const files = [];
  for (const record of records) {
    const entry = { id: record.id, artist: record.id, kind: record.kind || "Interview",
      dateKey: record.dateKey || "2026-01-22", transcript: record.transcript || "", href: "https://www.rrr.org.au/on-demand/segments/example" };
    await fs.writeFile(path.join(repo, "content/archive", `${entry.id}.json`), JSON.stringify(entry));
    if (record.source === false) continue;
    const filename = `${entry.id}.mp4`, source = path.join(media, "incoming", filename);
    await fs.writeFile(source, `immutable-source-${entry.id}`);
    files.push({ entryId: entry.id, filename, sha256: record.badHash ? "0".repeat(64) : await sha256(source),
      durationSeconds: 2, fragmentCount: record.fragmentCount || 1,
      entryAcquisitionComplete: record.complete !== false, sourcePageUrl: entry.href,
      method: "Synthetic test only" });
  }
  const manifest = path.join(media, "manifests/rrr-on-demand-acquisition-test.json");
  await fs.writeFile(manifest, JSON.stringify({ files, existingOriginals: [] }));
  const ffmpeg = path.join(root, "fake-ffmpeg.mjs");
  await fs.writeFile(ffmpeg, `#!${process.execPath}\nimport fs from 'node:fs'; const out=process.argv.at(-1);fs.writeFileSync(out,'derivative',{flag:'wx'});console.log('out_time_us=2000000\\nprogress=end');\n`, { mode: 0o755 });
  const engine = path.join(root, "fake-whisper.mjs");
  await fs.writeFile(engine, `#!${process.execPath}
import fs from 'node:fs';import path from 'node:path';
const args=process.argv.slice(2);
if(args.includes('--version')){console.log('whisper.cpp version: 1.9.5');process.exit(0);}
const value=flag=>args[args.indexOf(flag)+1];
if(value('--file').includes(path.sep+'fail'+path.sep)&&!fs.existsSync(path.join(path.dirname(value('--model')),'.retry-allow'))){process.stderr.write('private failure details\\n');process.exit(9);}
const segment=(from,to,text)=>({offsets:{from,to},text,tokens:[{text,p:0.95}]});
const raw={transcription:[segment(0,1000,' Exact original wording.'),segment(1000,2000,' And an unfinished thought...')]};
const out=value('--output-file');
fs.writeFileSync(out+'.args.json',JSON.stringify(args),{flag:'wx'});
for(const ext of ['json','txt','srt','vtt'])fs.writeFileSync(out+'.'+ext,ext==='json'?JSON.stringify(raw):'raw engine output',{flag:'wx'});
process.stderr.write('whisper_print_progress_callback: progress = 100%\\n');
`, { mode: 0o755 });
  const options = parseArgs(["--repo", repo, "--media-root", media, "--model", model,
    "--engine", engine, "--ffmpeg", ffmpeg]);
  return { root, repo, media, model, manifest, options };
}

test("scope accepts only dated interviews and sorts oldest first", () => {
  const entries = [
    { id: "new", kind: "Interview", dateKey: "2026-10-01" },
    { id: "old", kind: "Interview", dateKey: "2025-11-16" },
    ...["Guest mix", "Live", "Special program", "Broadcast"].map((kind) => ({ id: kind, kind, dateKey: "2026-01-01" })),
    { id: "outside", kind: "Interview", dateKey: "2025-11-15" },
    { id: "undated", kind: "Interview", dateKey: "" },
  ];
  assert.deepEqual(eligibleEntries(entries, "2025-11-16", "2026-11-16").map((entry) => entry.id), ["old", "new"]);
  assert.deepEqual(eligibleEntries(entries, "2025-11-16", "2026-11-16", "newest").map((entry) => entry.id), ["new", "old"]);
});

test("order and thread arguments retain defaults and reject invalid values", () => {
  const base = ["--media-root", "/tmp/private-test-media"];
  const defaults = parseArgs(base);
  assert.equal(defaults.order, "oldest"); assert.equal(defaults.threads, 4);
  assert.equal(parseArgs([...base, "--order", "newest", "--threads", "2"]).threads, 2);
  for (const value of ["0", "-1", "2.5", "NaN"]) assert.throws(() => parseArgs([...base, "--threads", value]), /positive integer/);
  assert.throws(() => parseArgs([...base, "--order", "random"]), /oldest or newest/);
});

test("max-context is optional, accepts zero, and rejects absent or non-integer values", () => {
  const base = ["--media-root", "/tmp/private-test-media"];
  assert.equal(Object.hasOwn(parseArgs(base), "maxContext"), false);
  assert.equal(parseArgs([...base, "--max-context", "0"]).maxContext, 0);
  assert.equal(parseArgs([...base, "--max-context", "64"]).maxContext, 64);
  assert.throws(() => parseArgs([...base, "--max-context"]), /needs a value/);
  assert.throws(() => parseArgs([...base, "--max-context", "--dry-run"]), /needs a value/);
  for (const value of ["-1", "2.5", "NaN", "Infinity", " ", "2e2", "9007199254740992"]) {
    assert.throws(() => parseArgs([...base, "--max-context", value]), /non-negative integer/);
  }
});

test("dry run verifies receipts, rejects partial/checksum failures and writes nothing", async (t) => {
  const f = await fixture(t, [{ id: "valid" }, { id: "published", transcript: "Published text without a listening-review claim", source: false },
    { id: "partial", complete: false }, { id: "fragmented", fragmentCount: 2 }, { id: "bad", badHash: true },
    { id: "mix", kind: "Guest mix" }]);
  const plan = await runQueue({ ...f.options, dryRun: true });
  assert.equal(plan.counts.queued, 1); assert.equal(plan.counts["published-transcript"], 1);
  assert.equal(plan.counts["missing-source"], 3);
  assert.deepEqual(plan.items.find((item) => item.entry.id === "bad").sourceIssues, ["source-checksum-mismatch"]);
  await assert.rejects(fs.stat(f.options.state));
  await assert.rejects(fs.stat(path.join(f.media, "transcripts")));
});

test("one failed job does not stop the next; resume skips completion and retains earlier attempts", async (t) => {
  const f = await fixture(t, [{ id: "fail", dateKey: "2026-01-01" }, { id: "success", dateKey: "2026-01-02" }]);
  const originalHash = await sha256(path.join(f.media, "incoming/success.mp4"));
  const previousExit = process.exitCode;
  const first = await runQueue(f.options); process.exitCode = previousExit;
  assert.equal(first.failed, 1); assert.equal(first.completed, 1);
  const firstState = JSON.parse(await fs.readFile(f.options.state));
  const success = Object.values(firstState.jobs).find((job) => job.entryId === "success");
  assert.equal(success.status, "complete");
  const draft = await fs.readFile(success.draftPath, "utf8");
  assert.match(draft, /Exact original wording\./); assert.match(draft, /And an unfinished thought\.\.\./);
  assert.match(draft, /not approved|Not approved/i);
  assert.equal(await sha256(path.join(f.media, "incoming/success.mp4")), originalHash);
  const afterFirst = await createPlan(f.options);
  assert.equal(afterFirst.counts["completed-private-draft"], 1); assert.equal(afterFirst.counts.queued, 1);
  await fs.writeFile(path.join(f.media, ".retry-allow"), "allowed");
  const second = await runQueue(f.options);
  assert.equal(second.completed, 1); assert.equal(second.failed, 0);
  const failedThenComplete = Object.values(second.state.jobs).find((job) => job.entryId === "fail");
  assert.equal(failedThenComplete.attempt, 2);
  assert.equal(await fs.readFile(success.draftPath, "utf8"), draft);
  const final = await createPlan(f.options);
  assert.equal(final.counts["completed-private-draft"], 2); assert.equal(final.counts.queued || 0, 0);
  await assert.rejects(fs.stat(`${f.options.state}.lock`));
});

test("completed pilot is reused only for matching model/settings and intact outputs", async (t) => {
  const f = await fixture(t, [{ id: "pilot" }]);
  const first = await createPlan(f.options), item = first.items[0];
  const folder = path.join(f.media, "transcripts/raw/pilot"); await fs.mkdir(folder, { recursive: true });
  const output = path.join(folder, "existing.txt"); await fs.writeFile(output, "existing private draft");
  const metadata = { entryId: "pilot", status: "succeeded", sourceSha256: item.sourceHash,
    engine: "whisper.cpp", engineVersion: "1.9.5", modelSha256: first.runtime.modelHash,
    language: "en", speakerDiarization: false,
    command: [f.options.engine, "--model", f.model, "--file", "source.wav", "--language", "en", "--no-fallback", "--output-json-full"],
    outputs: [{ path: output, sha256: await sha256(output) }] };
  const filename = path.join(folder, "run-metadata.json");
  await fs.writeFile(filename, JSON.stringify(metadata));
  assert.equal((await createPlan(f.options)).counts["completed-private-draft"], 1);
  assert.equal((await createPlan({ ...f.options, threads: 2 })).counts.queued, 1);
  await fs.writeFile(filename, JSON.stringify({ ...metadata, command: [...metadata.command, "--threads", "2"] }));
  assert.equal((await createPlan({ ...f.options, threads: 2 })).counts["completed-private-draft"], 1);
  assert.equal((await createPlan(f.options)).counts.queued, 1);
  await fs.writeFile(filename, JSON.stringify({ ...metadata, command: [...metadata.command, "--beam-size", "10"] }));
  assert.equal((await createPlan(f.options)).counts.queued, 1);
  await fs.writeFile(filename, JSON.stringify(metadata)); await fs.writeFile(output, "changed");
  assert.equal((await createPlan(f.options)).counts.queued, 1);
});

test("newest-first limits scheduling while threads reach the engine, signature and receipts", async (t) => {
  const f = await fixture(t, [{ id: "old", dateKey: "2025-11-16" }, { id: "new", dateKey: "2026-10-01" }]);
  const options = { ...f.options, order: "newest", threads: 2, limit: 1 };
  const plan = await createPlan(options);
  assert.deepEqual(plan.items.map((item) => item.entry.id), ["new", "old"]);
  const oldest = await createPlan({ ...options, order: "oldest" });
  const defaultThreads = await createPlan({ ...options, threads: 4 });
  for (const item of plan.items) {
    assert.equal(item.fingerprint, oldest.items.find((other) => other.entry.id === item.entry.id).fingerprint);
    assert.notEqual(item.fingerprint, defaultThreads.items.find((other) => other.entry.id === item.entry.id).fingerprint);
  }
  const run = await runQueue(options);
  assert.equal(run.completed, 1);
  const jobs = Object.values(run.state.jobs);
  assert.equal(jobs.find((job) => job.entryId === "old").status, "queued");
  const completed = jobs.find((job) => job.entryId === "new");
  assert.equal(completed.status, "complete");
  const receipt = JSON.parse(await fs.readFile(completed.receiptPath, "utf8"));
  assert.equal(receipt.command[receipt.command.indexOf("--threads") + 1], "2");
  assert.equal(receipt.command.includes("--max-context"), false);
  assert.equal(Object.hasOwn(receipt.settings, "maxContext"), false);
  assert.equal(receipt.settings.threads, 2);
  assert.equal(run.state.runtime.settings.threads, 2);
  assert.equal(run.state.scope.order, "newest");
  assert.deepEqual(run.state.planSnapshot.publishedTranscriptEntryIds, []);
  assert.equal((await createPlan({ ...options, order: "oldest" })).counts["completed-private-draft"], 1);
  assert.equal((await createPlan({ ...options, threads: 4 })).counts.queued, 2);
});

test("zero context reaches the engine and matching runs resume without changing legacy default identity", async (t) => {
  const f = await fixture(t, [{ id: "context" }]);
  const legacy = await createPlan(f.options), item = legacy.items[0];
  // Independently preserve the pre-option settings and serialized identity shape.
  const oldSettings = { language: "en", threads: 4, processors: 1, beamSize: 5, bestOf: 5,
    noFallback: true, diarization: false, vad: false, prompt: null };
  const oldFingerprint = createHash("sha256").update(JSON.stringify({ entryId: item.entry.id,
    sourceHash: item.sourceHash, modelHash: legacy.runtime.modelHash,
    engineVersion: legacy.runtime.engineVersion, settings: oldSettings })).digest("hex");
  assert.deepEqual(legacy.runtime.settings, oldSettings);
  assert.equal(item.fingerprint, oldFingerprint);
  const options = { ...f.options, maxContext: 0 };
  const explicit = await createPlan(options);
  assert.notEqual(explicit.items[0].fingerprint, oldFingerprint);
  const run = await runQueue(options);
  assert.equal(run.completed, 1);
  const job = Object.values(run.state.jobs).find((job) => job.status === "complete");
  const receipt = JSON.parse(await fs.readFile(job.receiptPath, "utf8"));
  const actualArgs = JSON.parse(await fs.readFile(path.join(path.dirname(job.receiptPath), "whisper.args.json"), "utf8"));
  assert.equal(actualArgs[actualArgs.indexOf("--max-context") + 1], "0");
  assert.equal(receipt.settings.maxContext, 0);
  assert.equal(run.state.runtime.settings.maxContext, 0);
  assert.equal(receipt.runFingerprint, explicit.items[0].fingerprint);
  assert.equal((await createPlan(options)).counts["completed-private-draft"], 1);
  assert.equal((await runQueue(options)).completed, 0);
  assert.equal((await createPlan(f.options)).counts.queued, 1);
  assert.equal((await createPlan({ ...options, maxContext: 64 })).counts.queued, 1);
  // Even a saved receipt carrying the requested fingerprint cannot override a
  // conflicting actual command/settings pair.
  const state = JSON.parse(await fs.readFile(f.options.state, "utf8"));
  state.jobs[oldFingerprint] = { receiptPath: job.receiptPath };
  await fs.writeFile(f.options.state, JSON.stringify(state));
  await fs.writeFile(job.receiptPath, JSON.stringify({ ...receipt, runFingerprint: oldFingerprint }));
  assert.equal((await createPlan(f.options)).counts.queued, 1);
});

test("legacy pilots remain valid only for matching omitted or explicit context", async (t) => {
  const f = await fixture(t, [{ id: "pilot-context" }]);
  const first = await createPlan(f.options), item = first.items[0];
  const folder = path.join(f.media, "transcripts/raw/pilot-context");
  await fs.mkdir(folder, { recursive: true });
  const output = path.join(folder, "existing.txt");
  await fs.writeFile(output, "legacy default draft");
  const metadata = { entryId: item.entry.id, status: "succeeded", sourceSha256: item.sourceHash,
    engine: "whisper.cpp", engineVersion: "1.9.5", modelSha256: first.runtime.modelHash,
    language: "en", speakerDiarization: false,
    command: [f.options.engine, "--model", f.model, "--file", "source.wav", "--language", "en", "--no-fallback", "--output-json-full"],
    outputs: [{ path: output, sha256: await sha256(output) }] };
  const filename = path.join(folder, "run-metadata.json");
  await fs.writeFile(filename, JSON.stringify(metadata));
  assert.equal((await createPlan(f.options)).counts["completed-private-draft"], 1);
  assert.equal((await createPlan({ ...f.options, maxContext: 0 })).counts.queued, 1);
  const zero = { ...metadata, command: [...metadata.command, "--max-context", "0"] };
  await fs.writeFile(filename, JSON.stringify(zero));
  assert.equal((await createPlan({ ...f.options, maxContext: 0 })).counts["completed-private-draft"], 1);
  assert.equal((await createPlan(f.options)).counts.queued, 1);
  assert.equal((await createPlan({ ...f.options, maxContext: 64 })).counts.queued, 1);
  await fs.writeFile(filename, JSON.stringify({ ...metadata, settings: { maxContext: 64 },
    command: [...metadata.command, "--max-context", "64"] }));
  assert.equal((await createPlan({ ...f.options, maxContext: 64 })).counts["completed-private-draft"], 1);
  assert.equal((await createPlan({ ...f.options, maxContext: 0 })).counts.queued, 1);
  assert.equal((await createPlan(f.options)).counts.queued, 1);
  // Inconsistent metadata cannot masquerade as either the default or zero.
  await fs.writeFile(filename, JSON.stringify({ ...metadata, settings: { maxContext: 0 } }));
  assert.equal((await createPlan(f.options)).counts.queued, 1);
  assert.equal((await createPlan({ ...f.options, maxContext: 0 })).counts.queued, 1);
  // Old default receipts with an existing fingerprint remain reusable too.
  await fs.writeFile(filename, JSON.stringify({ ...metadata, runFingerprint: item.fingerprint }));
  assert.equal((await createPlan(f.options)).counts["completed-private-draft"], 1);
});

test("a wider date window discovers valid completed attempts without its earlier state", async (t) => {
  const f = await fixture(t, [{ id: "recent", dateKey: "2026-01-01" }, { id: "older", dateKey: "2024-01-01" }]);
  const narrow = await runQueue(f.options);
  assert.equal(narrow.completed, 1);
  const job = Object.values(narrow.state.jobs)[0];
  const wider = parseArgs(["--repo", f.repo, "--media-root", f.media, "--model", f.model,
    "--engine", f.options.engine, "--ffmpeg", f.options.ffmpeg, "--since", "2023-01-01"]);
  assert.notEqual(wider.state, f.options.state);
  await assert.rejects(fs.stat(wider.state));
  let plan = await createPlan(wider);
  assert.equal(plan.counts["completed-private-draft"], 1);
  assert.equal(plan.counts.queued, 1);
  assert.equal(plan.items.find((item) => item.entry.id === "recent").receiptPath, job.receiptPath);
  // A newer incomplete attempt must not hide the earlier complete result.
  const attempt2 = path.join(path.dirname(path.dirname(job.receiptPath)), "attempt-0002");
  await fs.mkdir(attempt2);
  await fs.writeFile(path.join(attempt2, "partial.log"), "interrupted attempt");
  assert.equal((await createPlan(wider)).counts["completed-private-draft"], 1);
  // A later completed receipt wins, but must pass all existing hash checks.
  const receipt2 = path.join(attempt2, "run-metadata.json");
  await fs.copyFile(job.receiptPath, receipt2);
  plan = await createPlan(wider);
  assert.equal(plan.items.find((item) => item.entry.id === "recent").receiptPath, receipt2);
  await fs.writeFile(job.draftPath, "altered output");
  assert.equal((await createPlan(wider)).counts["completed-private-draft"] || 0, 0);
});

test("music/repetition candidates are flagged without deleting or substituting raw words", () => {
  const texts = ["Thanks for having me.", "Thanks for having me.", "Thanks for having me.", "Unusual grammar stays exactly."];
  const raw = { transcription: texts.map((text, index) => ({ text, offsets: { from: index * 1000, to: index * 1000 + 1000 }, tokens: [{ text, p: 0.9 }] })) };
  const draft = renderDraft({ artist: "Test", dateKey: "2026-01-01" }, raw, 5);
  for (const text of texts) assert.ok(draft.markdown.includes(text));
  assert.equal(draft.markdown.split("Thanks for having me.").length - 1, 3);
  assert.ok(draft.flags.some((flag) => flag.reasons.includes("repeated-text-possible-music-or-silence-artifact")));
  assert.match(draft.markdown, /unclassified ending/);
});

test("private media cannot be placed inside the website checkout", () => {
  assert.throws(() => parseArgs(["--repo", "/tmp/test-repository", "--media-root", "/tmp/test-repository/private"]), /outside/);
  assert.throws(() => parseArgs(["--media-root", "/tmp/private", "--since", "2026-02-30"]), /Invalid/);
});
