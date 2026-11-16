#!/usr/bin/env node
// Private, local-only processing. This module never writes archive content.
import fs from "node:fs/promises";
import { createReadStream, writeSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SETTINGS = Object.freeze({ language: "en", threads: 4, processors: 1,
  beamSize: 5, bestOf: 5, noFallback: true, diarization: false, vad: false, prompt: null });
const now = () => new Date().toISOString();
const report = (event, details = {}) => console.log(JSON.stringify({ event, at: now(), ...details }));
const readJson = async (filename) => JSON.parse(await fs.readFile(filename, "utf8"));
const exists = async (filename) => fs.stat(filename).then(() => true, () => false);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const inDirectory = (filename, directory) => filename === directory || filename.startsWith(`${directory}${path.sep}`);
let activeChild = null, stopping = false;

export async function sha256(filename) {
  const hash = createHash("sha256");
  for await (const block of createReadStream(filename)) hash.update(block);
  return hash.digest("hex");
}

export function parseArgs(args) {
  const options = { repo: repository, mediaRoot: process.env.BNE_MEDIA_ROOT,
    since: "2025-11-16", until: "2026-11-16", engine: "whisper-cli", ffmpeg: "ffmpeg",
    manifests: [], dryRun: false, limit: Infinity };
  const names = { "--repo": "repo", "--media-root": "mediaRoot", "--since": "since",
    "--until": "until", "--model": "model", "--engine": "engine", "--ffmpeg": "ffmpeg",
    "--state": "state", "--limit": "limit" };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--help") options.help = true;
    else if (arg === "--manifest") {
      if (!args[i + 1] || args[i + 1].startsWith("--")) throw new Error("--manifest needs a path");
      options.manifests.push(path.resolve(args[++i]));
    } else if (names[arg]) {
      if (!args[i + 1] || args[i + 1].startsWith("--")) throw new Error(`${arg} needs a value`);
      options[names[arg]] = args[++i];
    } else throw new Error(`Unknown option: ${arg}`);
  }
  if (options.help) return options;
  if (!options.mediaRoot) throw new Error("Set BNE_MEDIA_ROOT or --media-root");
  for (const field of ["repo", "mediaRoot"]) options[field] = path.resolve(options[field]);
  for (const field of ["since", "until"]) {
    const date = options[field];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date) throw new Error(`Invalid --${field} date`);
  }
  if (options.since > options.until) throw new Error("--since must not follow --until");
  options.model = path.resolve(options.model || path.join(options.mediaRoot, "working/models/ggml-large-v3-turbo-q5_0.bin"));
  options.state = path.resolve(options.state || path.join(options.mediaRoot, "manifests", `transcription-queue-${options.since}--${options.until}.json`));
  if (!inDirectory(options.state, options.mediaRoot)) throw new Error("Queue state must remain inside the private media root");
  if (inDirectory(options.mediaRoot, options.repo) || inDirectory(options.model, options.repo)) {
    throw new Error("Media, model and transcript state must remain outside the website repository");
  }
  options.limit = Number(options.limit);
  if (!(options.limit === Infinity || (Number.isSafeInteger(options.limit) && options.limit > 0))) {
    throw new Error("--limit must be a positive integer");
  }
  return options;
}

async function command(executable, args, { stdoutFile, stderrFile, onLine } = {}) {
  const output = stdoutFile ? await fs.open(stdoutFile, "wx") : null;
  const errors = stderrFile ? await fs.open(stderrFile, "wx") : null;
  let text = "", stderr = "", pending = "";
  try {
    const child = spawn(executable, args, { stdio: ["ignore", output ? output.fd : "pipe", "pipe"], shell: false });
    activeChild = child;
    child.stdout?.on("data", (chunk) => { if (text.length < 100_000) text += chunk.toString(); });
    child.stderr.on("data", (chunk) => {
      if (errors) writeSync(errors.fd, chunk);
      else if (stderr.length < 100_000) stderr += chunk.toString();
      if (onLine) {
        pending += chunk.toString();
        const lines = pending.split(/[\r\n]/); pending = lines.pop();
        for (const line of lines) onLine(line);
      }
    });
    const code = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (exitCode, signal) => resolve(signal ? 128 : exitCode));
    });
    if (code !== 0) throw new Error(`Local executable failed with exit code ${code}; see the private job logs`);
    return { stdout: text, stderr };
  } finally {
    activeChild = null;
    if (output) await output.close();
    if (errors) await errors.close();
  }
}

async function loadEntries(repo) {
  const directory = path.join(repo, "content/archive");
  const filenames = (await fs.readdir(directory)).filter((name) => name.endsWith(".json"));
  return Promise.all(filenames.map((name) => readJson(path.join(directory, name))));
}

async function acquisitions(options) {
  const directory = path.join(options.mediaRoot, "manifests");
  const paths = options.manifests.length ? options.manifests :
    (await fs.readdir(directory)).filter((name) => /^rrr-on-demand-acquisition-.*\.json$/.test(name)).sort()
      .map((name) => path.join(directory, name));
  const sources = [];
  for (const filename of paths) {
    const manifest = await readJson(filename);
    for (const item of manifest.files || []) {
      if (item.entryAcquisitionComplete === true && Number(item.fragmentCount || 1) === 1) {
        sources.push({ ...item, manifest: filename, original: false });
      }
    }
    for (const item of manifest.existingOriginals || []) sources.push({ ...item, manifest: filename, original: true });
  }
  const inventoryPath = path.join(directory, "media-inventory.json");
  if (await exists(inventoryPath)) {
    const inventory = await readJson(inventoryPath);
    for (const item of inventory.files || []) {
      if (item.matchState === "confirmed" && item.matchedEntryId) {
        sources.push({ ...item, entryId: item.matchedEntryId, filename: item.relativePath || item.filename,
          date: item.matchedEntryDateKey, manifest: inventoryPath, original: true });
      }
    }
  }
  return { paths, sources };
}

function stablePage(value) {
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? `${url.origin}${url.pathname}` : null; }
  catch { return null; }
}

export function eligibleEntries(entries, since, until) {
  return entries.filter((entry) => entry.kind === "Interview" && entry.dateKey >= since && entry.dateKey <= until)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.id.localeCompare(b.id));
}

function pilotSettingsMatch(metadata, engineVersion, modelHash) {
  if (metadata.engine !== "whisper.cpp" || metadata.engineVersion !== engineVersion ||
    metadata.modelSha256 !== modelHash || metadata.language !== "en" || metadata.speakerDiarization !== false) return false;
  const args = metadata.command || [];
  const flags = new Set(args);
  const values = { "--model": null, "--file": null, "--output-file": null,
    "--language": "en", "--threads": "4", "--processors": "1", "--beam-size": "5", "--best-of": "5" };
  const switches = new Set(["--no-fallback", "--output-json-full", "--output-srt", "--output-vtt", "--output-txt", "--print-progress"]);
  if (!flags.has("--no-fallback") || !flags.has("--language")) return false;
  for (let index = 1; index < args.length; index++) {
    const flag = args[index];
    if (switches.has(flag)) continue;
    if (!Object.hasOwn(values, flag) || args[index + 1] === undefined) return false;
    if (values[flag] !== null && args[index + 1] !== values[flag]) return false;
    index++;
  }
  return true;
}

async function validReceipt(filename, item, runtime) {
  if (!await exists(filename)) return null;
  const metadata = await readJson(filename);
  if (metadata.status !== "succeeded" || metadata.entryId !== item.entry.id || metadata.sourceSha256 !== item.sourceHash) return null;
  const matches = metadata.runFingerprint === item.fingerprint || pilotSettingsMatch(metadata, runtime.engineVersion, runtime.modelHash);
  if (!matches || !metadata.outputs?.length) return null;
  for (const output of metadata.outputs) {
    const filename = output.path;
    if (!inDirectory(path.resolve(filename), runtime.mediaRoot) || !await exists(filename) ||
      (output.sha256 && await sha256(filename) !== output.sha256)) return null;
  }
  return filename;
}

async function matchingAttemptReceipts(mediaRoot, item) {
  const directory = path.join(mediaRoot, "transcripts/raw", item.entry.id, `local-${item.fingerprint.slice(0, 16)}`);
  let attempts;
  try { attempts = await fs.readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
  return attempts.filter((entry) => entry.isDirectory() && /^attempt-\d{4}$/.test(entry.name))
    .sort((a, b) => b.name.localeCompare(a.name))
    .map((entry) => path.join(directory, entry.name, "run-metadata.json"));
}

export async function createPlan(options) {
  const version = await command(options.engine, ["--version"]);
  const engineVersion = `${version.stdout}\n${version.stderr}`.match(/(?:version[:\s]*)?(\d+\.\d+\.\d+)/i)?.[1];
  if (!engineVersion) throw new Error("Could not establish the local whisper.cpp version");
  const modelHash = await sha256(options.model);
  const runtime = { engineVersion, modelHash, mediaRoot: options.mediaRoot };
  const state = await exists(options.state) ? await readJson(options.state) : { schemaVersion: 1, jobs: {} };
  if (state.schemaVersion !== 1 || !state.jobs || Array.isArray(state.jobs)) throw new Error("Unrecognised private queue state");
  const entries = eligibleEntries(await loadEntries(options.repo), options.since, options.until);
  const { paths, sources } = await acquisitions(options);
  const items = [];
  for (const entry of entries) {
    if (!/^[A-Za-z0-9._-]+$/.test(entry.id)) throw new Error("Unsafe archive entry ID");
    if (entry.transcript?.trim()) { items.push({ entry, status: "approved-public-transcript" }); continue; }
    const receipts = sources.filter((source) => source.entryId === entry.id).sort((a, b) => Number(b.original) - Number(a.original));
    let item = { entry, status: "missing-source" };
    const errors = [];
    for (const source of receipts) {
      if (!source.filename || !/^[a-f0-9]{64}$/i.test(source.sha256 || "")) { errors.push("incomplete-source-receipt"); continue; }
      const sourcePath = path.resolve(options.mediaRoot, "incoming", source.filename);
      if (!inDirectory(sourcePath, path.join(options.mediaRoot, "incoming"))) { errors.push("unsafe-source-path"); continue; }
      if (!await exists(sourcePath)) { errors.push("source-file-missing"); continue; }
      const realPath = await fs.realpath(sourcePath);
      if (!inDirectory(realPath, await fs.realpath(options.mediaRoot))) { errors.push("source-symlink-outside-media-root"); continue; }
      const sourceHash = await sha256(sourcePath);
      if (sourceHash !== source.sha256.toLowerCase()) { errors.push("source-checksum-mismatch"); continue; }
      const fingerprint = digest(JSON.stringify({ entryId: entry.id, sourceHash, modelHash, engineVersion, settings: SETTINGS }));
      item = { entry, source, sourcePath, sourceHash, fingerprint, status: "queued" };
      const saved = state.jobs[fingerprint];
      const receiptPaths = [...new Set([...(await matchingAttemptReceipts(options.mediaRoot, item)), saved?.receiptPath,
        path.join(options.mediaRoot, "transcripts/raw", entry.id, "run-metadata.json")].filter(Boolean))];
      for (const receiptPath of receiptPaths) {
        const valid = await validReceipt(receiptPath, item, runtime);
        if (valid) { item.status = "completed-private-draft"; item.receiptPath = valid; break; }
      }
      break;
    }
    if (item.status === "missing-source" && errors.length) item.sourceIssues = [...new Set(errors)];
    items.push(item);
  }
  const counts = {};
  for (const item of items) counts[item.status] = (counts[item.status] || 0) + 1;
  return { items, counts, state, runtime, manifestPaths: paths };
}

async function atomicState(filename, state) {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.tmp-${process.pid}`;
  const handle = await fs.open(temporary, "wx", 0o600);
  try { await handle.writeFile(`${JSON.stringify(state, null, 2)}\n`); await handle.sync(); }
  finally { await handle.close(); }
  await fs.rename(temporary, filename);
}

async function lockQueue(filename) {
  const lock = `${filename}.lock`;
  await fs.mkdir(path.dirname(lock), { recursive: true });
  try {
    const existing = await readJson(lock);
    let alive = true;
    try { process.kill(existing.pid, 0); } catch (error) { if (error.code === "ESRCH") alive = false; }
    if (alive || existing.host !== os.hostname()) throw new Error("Another transcription queue owns the private state lock");
    await fs.unlink(lock);
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  const handle = await fs.open(lock, "wx", 0o600);
  await handle.writeFile(JSON.stringify({ pid: process.pid, host: os.hostname(), startedAt: now() }));
  await handle.close();
  return async () => { await fs.unlink(lock); };
}

const stamp = (ms) => {
  const value = Math.max(0, Math.round(ms));
  return `${String(Math.floor(value / 3600000)).padStart(2, "0")}:${String(Math.floor(value / 60000) % 60).padStart(2, "0")}:${String(Math.floor(value / 1000) % 60).padStart(2, "0")}.${String(value % 1000).padStart(3, "0")}`;
};

export function renderDraft(entry, raw, durationSeconds) {
  const segments = raw.transcription;
  if (!Array.isArray(segments) || !segments.length) throw new Error("Engine returned no transcript segments; audio review required");
  const flags = [], lines = ["<!-- PRIVATE MACHINE DRAFT. Not checked against audio. Not approved for publication. -->",
    `# ${entry.artist}: timestamped source draft`, "", `Archive date: ${entry.dateKey}. Supplied recording duration: ${durationSeconds.toFixed(3)} seconds.`, "",
    "The complete supplied recording was processed locally. The words below are unreviewed machine output, with no paraphrase, grammar repair, substitution or inferred speaker identity. Paragraphs are engine segments, not verified speaker turns.", "",
    "Automatic recognition can invent words over music or silence, including repeated farewells and lyric-like text. Flagged intervals need audio review. Nothing is automatically deleted or declared to be music solely from generated text. Actual music must be represented as [Music] during audio review; do not publish lyric-like output.", "",
    "All speakers remain unassigned. Source-relative timestamps and engine scores are review aids, not proof of accuracy. Untranscribed gaps remain unclassified.", ""];
  let prior = "", repeats = 0, previousEnd = 0;
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index], start = segment.offsets?.from, end = segment.offsets?.to;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) throw new Error("Invalid engine segment timestamps");
    const text = String(segment.text ?? "").trim();
    const normal = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    repeats = normal && normal === prior ? repeats + 1 : 0; prior = normal;
    const scores = (segment.tokens || []).filter((token) => !String(token.text).startsWith("[_") && /\p{L}/u.test(token.text)).map((token) => token.p).filter(Number.isFinite);
    const reasons = [];
    if (scores.length && (Math.min(...scores) < 0.25 || scores.reduce((a, b) => a + b, 0) / scores.length < 0.75)) reasons.push("low-engine-score");
    if (repeats >= 2 || /(.{5,60})\1{3}/iu.test(text)) reasons.push("repeated-text-possible-music-or-silence-artifact");
    if (/\[.?music.?\]|\(.?music.?\)/i.test(text)) reasons.push("engine-music-label-unverified");
    if (start < previousEnd || end > durationSeconds * 1000 + 1000) reasons.push("timestamp-needs-review");
    if (start - previousEnd > 1000) lines.push(`**${stamp(previousEnd)}–${stamp(start)} — unclassified gap; check audio.**`, "");
    if (reasons.length) flags.push({ segment: index + 1, fromMs: start, toMs: end, reasons });
    lines.push(`### ${stamp(start)}–${stamp(end)}${reasons.length ? " — audio review flag" : ""}`, "", text, "");
    previousEnd = Math.max(previousEnd, end);
  }
  if (durationSeconds * 1000 - previousEnd > 50) lines.push(`**${stamp(previousEnd)}–${stamp(durationSeconds * 1000)} — unclassified ending; check audio.**`, "");
  const notes = ["# Private audio-review notes", "", "Draft status: unreviewed; not approved for publication.", "",
    "Check the complete draft against the complete supplied recording. Confirm speaker turns and identities, uncertain wording, dates and consequential names. Do not paraphrase or repair grammar. Record any clearly unnecessary omission explicitly.", "",
    "Music and silence can produce fluent but false text. Repetition flags identify review candidates; they do not reliably locate music or justify deletion. Replace verified musical intervals with [Music] and retain their original-relative times.", "",
    "No online name research or speaker attribution was performed automatically. Engine token scores are not calibrated probabilities of correctness.", "",
    ...flags.map((flag) => `- ${stamp(flag.fromMs)}–${stamp(flag.toMs)} (segment ${flag.segment}): ${flag.reasons.join(", ")}.`), ""];
  return { markdown: lines.join("\n"), notes: notes.join("\n"), flags, segmentCount: segments.length };
}

async function newAttempt(options, item) {
  const base = `local-${item.fingerprint.slice(0, 16)}`;
  for (let attempt = 1; attempt < 10000; attempt++) {
    const suffix = path.join(item.entry.id, base, `attempt-${String(attempt).padStart(4, "0")}`);
    const raw = path.join(options.mediaRoot, "transcripts/raw", suffix);
    if (await exists(raw)) continue;
    await fs.mkdir(path.dirname(raw), { recursive: true }); await fs.mkdir(raw);
    const working = path.join(options.mediaRoot, "working", suffix);
    const draft = path.join(options.mediaRoot, "transcripts/drafts", suffix);
    await fs.mkdir(working, { recursive: true }); await fs.mkdir(draft, { recursive: true });
    return { attempt, raw, working, draft };
  }
  throw new Error("No unused output attempt directory available");
}

async function processItem(options, item, runtime, directories) {
  const wav = path.join(directories.working, "derivative-mono16k.wav");
  const progress = path.join(directories.working, "ffmpeg-progress.log");
  await command(options.ffmpeg, ["-nostdin", "-n", "-hide_banner", "-loglevel", "error", "-i", item.sourcePath,
    "-map", "0:a:0", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", "-progress", "pipe:1", "-nostats", wav],
    { stdoutFile: progress, stderrFile: path.join(directories.working, "ffmpeg.log") });
  const times = [...(await fs.readFile(progress, "utf8")).matchAll(/^out_time_us=(\d+)$/gm)];
  const durationSeconds = times.length ? Number(times.at(-1)[1]) / 1e6 : NaN;
  if (!(durationSeconds > 0)) throw new Error("Could not establish the full derivative duration from ffmpeg");
  if (item.source.durationSeconds && Math.abs(durationSeconds - item.source.durationSeconds) > 2) throw new Error("Source duration differs from its acquisition receipt");
  const output = path.join(directories.raw, "whisper");
  const args = ["--model", options.model, "--file", wav, "--language", "en", "--threads", "4", "--processors", "1",
    "--beam-size", "5", "--best-of", "5", "--no-fallback", "--output-json-full", "--output-srt", "--output-vtt", "--output-txt", "--print-progress", "--output-file", output];
  let reported = -1;
  await command(options.engine, args, { stdoutFile: path.join(directories.raw, "engine.stdout.log"),
    stderrFile: path.join(directories.raw, "engine.log"), onLine(line) {
      const progress = Number(line.match(/progress =\s*(\d+)%/)?.[1]);
      if (Number.isFinite(progress) && Math.floor(progress / 10) > reported) {
        reported = Math.floor(progress / 10); report("job_progress", { entryId: item.entry.id, percent: progress });
      }
    } });
  const raw = await readJson(`${output}.json`);
  const rendered = renderDraft(item.entry, raw, durationSeconds);
  const draftPath = path.join(directories.draft, "timestamped-source-draft.md");
  const notesPath = path.join(directories.draft, "review-notes.md");
  await fs.writeFile(draftPath, rendered.markdown, { flag: "wx", mode: 0o600 });
  await fs.writeFile(notesPath, rendered.notes, { flag: "wx", mode: 0o600 });
  const after = await sha256(item.sourcePath);
  if (after !== item.sourceHash) throw new Error("Source checksum changed during processing");
  const paths = [wav, draftPath, notesPath, ...["json", "srt", "vtt", "txt"].map((extension) => `${output}.${extension}`)];
  const outputs = [];
  for (const filename of paths) outputs.push({ path: filename, sha256: await sha256(filename), sizeBytes: (await fs.stat(filename)).size });
  const receiptPath = path.join(directories.raw, "run-metadata.json");
  await fs.writeFile(receiptPath, `${JSON.stringify({ schemaVersion: 1, entryId: item.entry.id, date: item.entry.dateKey,
    status: "succeeded", completedAt: now(), runFingerprint: item.fingerprint,
    sourcePath: item.sourcePath, sourceSha256: item.sourceHash, sourceSha256AfterRun: after,
    sourcePageUrl: stablePage(item.source.sourcePageUrl || item.entry.href), sourceManifest: item.source.manifest,
    sourceAcquisitionMethod: item.source.method || (item.source.original ? "Existing supplied original; see acquisition manifest" : "See acquisition manifest"),
    acquiredAtUTC: item.source.acquiredAtUTC || null, sourceSizeBytes: (await fs.stat(item.sourcePath)).size,
    sourceDurationSeconds: durationSeconds, recordingCompleteness: "Supplied recording processed in full; whether the supplied recording is a complete interview requires audio review",
    engine: "whisper.cpp", engineVersion: runtime.engineVersion, modelPath: options.model,
    modelSha256: runtime.modelHash, settings: SETTINGS, language: "en", speakerDiarization: false,
    command: [options.engine, ...args], externalAudioUpload: false, publicWebsiteChanged: false,
    coverage: { requestedIntervalFromMs: 0, requestedIntervalToMs: Math.round(durationSeconds * 1000),
      fullRecordingEngineRunSucceeded: true, rawSegmentCount: rendered.segmentCount,
      gapsClassification: "Unreviewed; not assumed silent", completeVerbatimAccuracyClaimed: false },
    privateDraftStatus: "Machine draft; not checked against audio; not approved for publication",
    humanAudioReviewComplete: false, reviewFlags: rendered.flags, outputs }, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  return { receiptPath, draftPath, durationSeconds, segmentCount: rendered.segmentCount, reviewFlags: rendered.flags.length };
}

export async function runQueue(options) {
  if (options.dryRun) {
    const plan = await createPlan(options);
    report("plan", { dryRun: true, scope: { since: options.since, until: options.until }, counts: plan.counts,
      items: plan.items.map(({ entry, status, sourceIssues }) => ({ entryId: entry.id, artist: entry.artist, date: entry.dateKey, status, ...(sourceIssues ? { sourceIssues } : {}) })) });
    return plan;
  }
  const unlock = await lockQueue(options.state);
  try {
    const plan = await createPlan(options), state = plan.state;
    state.scope = { since: options.since, until: options.until }; state.updatedAt = now();
    state.manifestPaths = plan.manifestPaths;
    state.runtime = { engineVersion: plan.runtime.engineVersion, modelSha256: plan.runtime.modelHash, settings: SETTINGS };
    state.planSnapshot = { at: now(), counts: plan.counts,
      approvedPublicTranscriptEntryIds: plan.items.filter((item) => item.status === "approved-public-transcript").map((item) => item.entry.id) };
    state.unavailableEntries = plan.items.filter((item) => item.status === "missing-source").map((item) => ({ entryId: item.entry.id, issues: item.sourceIssues || ["No completed local acquisition receipt"] }));
    for (const item of plan.items.filter((item) => item.status === "queued")) {
      state.jobs[item.fingerprint] ||= { entryId: item.entry.id, date: item.entry.dateKey,
        sourceSha256: item.sourceHash, sourceFilename: item.source.filename, status: "queued", queuedAt: now() };
    }
    for (const item of plan.items.filter((item) => item.status === "completed-private-draft")) state.jobs[item.fingerprint] = { ...(state.jobs[item.fingerprint] || {}), entryId: item.entry.id, status: "complete", receiptPath: item.receiptPath, importedOrVerifiedAt: now() };
    await atomicState(options.state, state);
    const queued = plan.items.filter((item) => item.status === "queued").slice(0, options.limit);
    report("queue_start", { counts: plan.counts, selectedJobs: queued.length });
    let completed = 0, failed = 0;
    for (const item of queued) {
      if (stopping) break;
      const directories = await newAttempt(options, item);
      state.jobs[item.fingerprint] = { entryId: item.entry.id, date: item.entry.dateKey,
        sourceSha256: item.sourceHash, status: "running", startedAt: now(), attempt: directories.attempt, directories,
        receiptPath: path.join(directories.raw, "run-metadata.json") };
      state.updatedAt = now(); await atomicState(options.state, state);
      report("job_start", { entryId: item.entry.id, artist: item.entry.artist, date: item.entry.dateKey, attempt: directories.attempt });
      try {
        const result = await processItem(options, item, plan.runtime, directories);
        Object.assign(state.jobs[item.fingerprint], { status: "complete", completedAt: now(), ...result }); completed++;
        report("job_complete", { entryId: item.entry.id, durationSeconds: result.durationSeconds, segmentCount: result.segmentCount, reviewFlags: result.reviewFlags });
      } catch (error) {
        Object.assign(state.jobs[item.fingerprint], { status: stopping ? "interrupted" : "failed", failedAt: now(), error: error.message }); failed++;
        report("job_failed", { entryId: item.entry.id, reason: error.message });
      }
      state.updatedAt = now(); await atomicState(options.state, state);
    }
    state.lastRun = { completedAt: now(), completed, failed, selectedJobs: queued.length,
      waitingForSource: state.unavailableEntries.length, interrupted: stopping, noAutomaticPublication: true };
    await atomicState(options.state, state); report(stopping ? "queue_interrupted" : "queue_complete", state.lastRun);
    if (failed) process.exitCode = 2;
    return { completed, failed, state };
  } finally { await unlock(); }
}

const HELP = `Usage: node scripts/transcribe-interviews.mjs [options]
  --media-root PATH   Private media directory (or BNE_MEDIA_ROOT)
  --repo PATH         Archive content checkout (default: this repository)
  --since YYYY-MM-DD  Inclusive start (default: 2025-11-16)
  --until YYYY-MM-DD  Inclusive end (default: 2026-11-16)
  --model PATH        Local Whisper GGML model (default: media-root/working/models/ggml-large-v3-turbo-q5_0.bin)
  --engine PATH       Local whisper-cli executable (default: whisper-cli)
  --ffmpeg PATH       Local ffmpeg executable (default: ffmpeg)
  --manifest PATH     Acquisition manifest; repeatable (default: private manifests/rrr-on-demand-acquisition-*.json)
  --state PATH        Private atomic queue state (must be inside media root)
  --limit N           At most N queued jobs in this invocation
  --dry-run           Verify sources/receipts and print plan; write nothing
  --help              Show this help
No downloads, network calls, public content changes or automatic publication.\n`;

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => {
    stopping = true; activeChild?.kill(signal); process.exitCode = signal === "SIGINT" ? 130 : 143;
  });
  try { const options = parseArgs(process.argv.slice(2)); if (options.help) console.log(HELP); else await runQueue(options); }
  catch (error) { report("queue_error", { reason: error.message }); process.exitCode = 1; }
}
