import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
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
});

test("dry run verifies receipts, rejects partial/checksum failures and writes nothing", async (t) => {
  const f = await fixture(t, [{ id: "valid" }, { id: "approved", transcript: "Human-approved text", source: false },
    { id: "partial", complete: false }, { id: "fragmented", fragmentCount: 2 }, { id: "bad", badHash: true },
    { id: "mix", kind: "Guest mix" }]);
  const plan = await runQueue({ ...f.options, dryRun: true });
  assert.equal(plan.counts.queued, 1); assert.equal(plan.counts["approved-public-transcript"], 1);
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
  await fs.writeFile(filename, JSON.stringify({ ...metadata, command: [...metadata.command, "--beam-size", "10"] }));
  assert.equal((await createPlan(f.options)).counts.queued, 1);
  await fs.writeFile(filename, JSON.stringify(metadata)); await fs.writeFile(output, "changed");
  assert.equal((await createPlan(f.options)).counts.queued, 1);
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
