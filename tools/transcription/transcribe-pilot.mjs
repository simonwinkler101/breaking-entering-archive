import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";

// One-entry transcription pilot. The source file is read-only; every
// derivative, raw API response and draft lives beneath the external media
// root, never inside the Git repository. Dry-run is the default; --execute is
// required before any API request is made. Failed requests are never retried
// automatically (SDK retries are disabled and the run stops on first failure);
// re-running resumes and skips chunks that already have a successful response.

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const AUTHORIZED_ENTRY_IDS = new Set(["carla-dal-forno"]);
const MODEL = "gpt-4o-transcribe-diarize";
const RESPONSE_FORMAT = "diarized_json";
const CHUNKING_STRATEGY = "auto";
const CHUNK_SECONDS = 300;
const OVERLAP_SECONDS = 2;
const SILENCE_SEARCH_SECONDS = 15;
const MAX_UPLOAD_BYTES = 24 * 1024 * 1024;
const MAX_TOTAL_SECONDS = 60 * 60;
const MAX_REQUESTS = 12;

const usage = () => {
  console.error(
    "Usage: node tools/transcription/transcribe-pilot.mjs --input <file.mp4> --entry-id <id> --media-root <dir> [--execute]",
  );
  process.exit(1);
};

const args = process.argv.slice(2);
const readArg = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const execute = args.includes("--execute");
const rawInput = readArg("--input");
const entryId = readArg("--entry-id");
const rawMediaRoot = readArg("--media-root");
if (!rawInput || !entryId || !rawMediaRoot) usage();

const input = path.resolve(rawInput);
const mediaRoot = path.resolve(rawMediaRoot);

const isSameOrInside = (child, parent) => {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};
const fail = (message) => {
  console.error(message);
  process.exit(1);
};

if (!AUTHORIZED_ENTRY_IDS.has(entryId)) {
  fail(`Entry "${entryId}" is not authorized for this pilot. Authorized: ${[...AUTHORIZED_ENTRY_IDS].join(", ")}`);
}
if (!/^[A-Za-z0-9._-]+$/.test(entryId)) fail(`Unsafe entry id: ${entryId}`);
for (const [label, target] of [["--input", input], ["--media-root", mediaRoot]]) {
  if (isSameOrInside(target, root)) {
    fail(`${label} must be outside the Git repository (${root}); got: ${target}`);
  }
}
if (!fs.existsSync(input) || !fs.statSync(input).isFile()) fail(`Input file not found: ${input}`);
if (!fs.existsSync(mediaRoot) || !fs.statSync(mediaRoot).isDirectory()) {
  fail(`Media root not found: ${mediaRoot}`);
}
if (!process.env.OPENAI_API_KEY) fail("OPENAI_API_KEY is not set in the environment.");

const workingDirectory = path.join(mediaRoot, "working", entryId);
const rawDirectory = path.join(mediaRoot, "transcripts", "raw", entryId);
const draftDirectory = path.join(mediaRoot, "transcripts", "drafts", entryId);
const statePath = path.join(workingDirectory, "pilot-state.json");
const derivativePath = path.join(workingDirectory, "derivative-mono-16k-64k.mp3");

const sha256 = (filename) =>
  new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    fs.createReadStream(filename)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });

const toolVersion = async (tool) => {
  const { stdout } = await execFileAsync(tool, ["-version"]);
  return stdout.split("\n")[0].trim();
};

const probeDuration = async (filename) => {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "csv=p=0",
    filename,
  ]);
  const seconds = Number(stdout.trim());
  if (!Number.isFinite(seconds)) throw new Error(`Could not read duration of ${filename}`);
  return seconds;
};

const formatSeconds = (total) => {
  const s = Math.max(0, Math.round(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

const detectSilenceMidpoints = async (filename) => {
  const { stderr } = await execFileAsync(
    "ffmpeg",
    ["-hide_banner", "-i", filename, "-af", "silencedetect=noise=-30dB:d=0.4", "-f", "null", "-"],
    { maxBuffer: 32 * 1024 * 1024 },
  );
  const midpoints = [];
  let start = null;
  for (const line of stderr.split("\n")) {
    const startMatch = line.match(/silence_start:\s*([\d.]+)/);
    const endMatch = line.match(/silence_end:\s*([\d.]+)/);
    if (startMatch) start = Number(startMatch[1]);
    if (endMatch && start !== null) {
      midpoints.push((start + Number(endMatch[1])) / 2);
      start = null;
    }
  }
  return midpoints;
};

const planChunks = (duration, silenceMidpoints) => {
  const boundaries = [];
  for (let target = CHUNK_SECONDS; target < duration - 30; target += CHUNK_SECONDS) {
    let boundary = target;
    let bestDistance = Infinity;
    for (const midpoint of silenceMidpoints) {
      const distance = Math.abs(midpoint - target);
      if (distance <= SILENCE_SEARCH_SECONDS && distance < bestDistance) {
        bestDistance = distance;
        boundary = midpoint;
      }
    }
    boundaries.push({ target, boundary, snappedToSilence: bestDistance !== Infinity });
  }
  const chunks = [];
  let start = 0;
  for (const { boundary } of boundaries) {
    chunks.push({ start, end: boundary });
    start = Math.max(0, boundary - OVERLAP_SECONDS);
  }
  chunks.push({ start, end: duration });
  return { boundaries, chunks };
};

const readState = () => {
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    return null;
  }
};
const writeState = (state) =>
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);

const main = async () => {
  const ffmpegVersion = await toolVersion("ffmpeg");
  const ffprobeVersion = await toolVersion("ffprobe");
  const sdkVersion = JSON.parse(
    fs.readFileSync(path.join(root, "node_modules/openai/package.json"), "utf8"),
  ).version;

  const sourceSha = await sha256(input);
  const sourceSize = fs.statSync(input).size;
  const sourceDuration = await probeDuration(input);
  if (sourceDuration > MAX_TOTAL_SECONDS) {
    fail(`Source duration ${formatSeconds(sourceDuration)} exceeds the ${MAX_TOTAL_SECONDS / 60}-minute limit.`);
  }

  fs.mkdirSync(workingDirectory, { recursive: true });

  // Reuse a previous run's derivative and plan when the source is unchanged.
  let state = readState();
  if (state && state.sourceSha256 !== sourceSha) {
    fail("Existing pilot state was produced from a different source file; refusing to mix runs.");
  }

  if (!state || !fs.existsSync(derivativePath)) {
    await execFileAsync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      input,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-b:a",
      "64k",
      derivativePath,
    ]);
    state = null; // fresh derivative invalidates any previous chunk plan
  }
  const derivativeSha = await sha256(derivativePath);
  const derivativeDuration = await probeDuration(derivativePath);

  if (!state) {
    const silence = await detectSilenceMidpoints(derivativePath);
    const { boundaries, chunks } = planChunks(derivativeDuration, silence);
    state = {
      entryId,
      sourcePath: input,
      sourceSha256: sourceSha,
      sourceSizeBytes: sourceSize,
      sourceDurationSeconds: sourceDuration,
      derivativePath,
      derivativeSha256: derivativeSha,
      derivativeDurationSeconds: derivativeDuration,
      model: MODEL,
      responseFormat: RESPONSE_FORMAT,
      chunkingStrategy: CHUNKING_STRATEGY,
      overlapSeconds: OVERLAP_SECONDS,
      boundaries,
      chunks: chunks.map((chunk, index) => ({
        index: index + 1,
        startSeconds: chunk.start,
        endSeconds: chunk.end,
        file: path.join(workingDirectory, `chunk-${String(index + 1).padStart(2, "0")}.mp3`),
        sha256: null,
        sizeBytes: null,
        status: "pending",
        requestedAt: null,
        completedAt: null,
        responseFile: null,
        error: null,
      })),
    };
  }
  if (state.derivativeSha256 !== derivativeSha) {
    fail("Derivative checksum does not match pilot state; delete the working directory to start fresh.");
  }

  if (state.chunks.length > MAX_REQUESTS) {
    fail(`Plan needs ${state.chunks.length} requests, above the maximum of ${MAX_REQUESTS}.`);
  }

  for (const chunk of state.chunks) {
    if (!fs.existsSync(chunk.file)) {
      await execFileAsync("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        String(chunk.startSeconds),
        "-t",
        String(chunk.endSeconds - chunk.startSeconds),
        "-i",
        derivativePath,
        "-c",
        "copy",
        chunk.file,
      ]);
    }
    chunk.sizeBytes = fs.statSync(chunk.file).size;
    chunk.sha256 = await sha256(chunk.file);
    if (chunk.sizeBytes >= MAX_UPLOAD_BYTES) {
      fail(`Chunk ${chunk.index} is ${chunk.sizeBytes} bytes, at or above the 24 MB upload limit.`);
    }
  }
  writeState(state);

  const pending = state.chunks.filter((chunk) => chunk.status !== "succeeded");
  const plan = {
    entryId,
    source: { path: input, sha256: sourceSha, sizeBytes: sourceSize, duration: formatSeconds(sourceDuration) },
    derivative: { path: derivativePath, sha256: derivativeSha, duration: formatSeconds(derivativeDuration) },
    chunkCount: state.chunks.length,
    pendingRequests: pending.length,
    largestUploadBytes: Math.max(...state.chunks.map((chunk) => chunk.sizeBytes)),
    boundaries: state.boundaries,
    chunks: state.chunks.map((chunk) => ({
      index: chunk.index,
      span: `${formatSeconds(chunk.startSeconds)}–${formatSeconds(chunk.endSeconds)}`,
      sizeBytes: chunk.sizeBytes,
      status: chunk.status,
    })),
    outputs: { workingDirectory, rawDirectory, draftDirectory },
  };
  console.log(JSON.stringify(plan, null, 2));

  if (!execute) {
    console.log("\nDry-run only. Re-run with --execute to make API requests.");
    return;
  }

  fs.mkdirSync(rawDirectory, { recursive: true });
  fs.mkdirSync(draftDirectory, { recursive: true });

  const client = new OpenAI({ maxRetries: 0 });
  for (const chunk of state.chunks) {
    if (chunk.status === "succeeded") {
      console.log(`chunk ${chunk.index}: already succeeded, skipping`);
      continue;
    }
    chunk.status = "requested";
    chunk.requestedAt = new Date().toISOString();
    writeState(state);
    try {
      const response = await client.audio.transcriptions.create({
        file: fs.createReadStream(chunk.file),
        model: MODEL,
        response_format: RESPONSE_FORMAT,
        chunking_strategy: CHUNKING_STRATEGY,
      });
      chunk.responseFile = path.join(rawDirectory, `chunk-${String(chunk.index).padStart(2, "0")}.json`);
      fs.writeFileSync(chunk.responseFile, `${JSON.stringify(response, null, 2)}\n`);
      chunk.status = "succeeded";
      chunk.completedAt = new Date().toISOString();
      writeState(state);
      console.log(`chunk ${chunk.index}: succeeded`);
    } catch (error) {
      chunk.status = "failed";
      chunk.completedAt = new Date().toISOString();
      chunk.error = `${error.status ?? ""} ${error.name ?? "Error"}: ${error.message}`.trim();
      writeState(state);
      fail(`chunk ${chunk.index} failed (${chunk.error}). Stopping without retry; re-run to resume.`);
    }
  }

  const metadata = {
    entryId,
    sourcePath: input,
    sourceSha256: sourceSha,
    sourceSizeBytes: sourceSize,
    sourceDurationSeconds: sourceDuration,
    derivative: {
      path: derivativePath,
      sha256: derivativeSha,
      durationSeconds: derivativeDuration,
      encoding: "mono 16 kHz MP3 64 kbps, video stream removed",
    },
    model: MODEL,
    responseFormat: RESPONSE_FORMAT,
    chunkingStrategy: CHUNKING_STRATEGY,
    openaiSdkVersion: sdkVersion,
    ffmpegVersion,
    ffprobeVersion,
    overlapSeconds: OVERLAP_SECONDS,
    chunks: state.chunks.map(({ error, ...chunk }) => ({ ...chunk, error })),
  };
  fs.writeFileSync(
    path.join(rawDirectory, "run-metadata.json"),
    `${JSON.stringify(metadata, null, 2)}\n`,
  );

  buildDraft(state);
  console.log(`\nAll ${state.chunks.length} chunks transcribed. Raw responses: ${rawDirectory}`);
  console.log(`Machine draft: ${path.join(draftDirectory, `${entryId}-machine-draft.md`)}`);
};

const MUSIC_PATTERN = /♪|\[\s*music\s*\]|\(\s*music\s*\)|\bmusic\s+plays\b/i;
const UNCERTAIN_PATTERN = /\[(inaudible|unintelligible|unclear|crosstalk)[^\]]*\]|\(\?\)/i;

const buildDraft = (state) => {
  const lines = [
    "MACHINE DRAFT — NOT REVIEWED OR APPROVED",
    "",
    `Entry: ${state.entryId} (machine transcript; must never be copied into an archive entry automatically)`,
    `Source SHA-256: ${state.sourceSha256}`,
    `Model: ${state.model}; response_format: ${state.responseFormat}; chunking_strategy: ${state.chunkingStrategy}`,
    "Speaker labels are anonymous and chunk-scoped; no speaker has been identified as any real person.",
    "",
  ];
  const flags = [];
  let coveredUpTo = 0;
  let lastGlobalStart = -1;
  let monotonic = true;

  state.chunks.forEach((chunk, chunkIndex) => {
    const response = JSON.parse(fs.readFileSync(chunk.responseFile, "utf8"));
    const segments = Array.isArray(response.segments) ? response.segments : [];
    if (chunkIndex > 0) {
      lines.push(`> — chunk seam at ${formatSeconds(coveredUpTo)} (overlap ${state.overlapSeconds}s, deduplicated by timestamp) —`, "");
    }
    let lastSegmentEnd = 0;
    let previousEnd = null;
    for (const segment of segments) {
      const globalStart = chunk.startSeconds + Number(segment.start ?? 0);
      const globalEnd = chunk.startSeconds + Number(segment.end ?? segment.start ?? 0);
      lastSegmentEnd = Math.max(lastSegmentEnd, Number(segment.end ?? 0));
      // Deterministic overlap dedup: drop segments already covered by the
      // previous chunk (their end does not extend past covered time).
      if (chunkIndex > 0 && globalEnd <= coveredUpTo + 0.05) continue;
      if (globalStart < lastGlobalStart - 0.5) monotonic = false;
      lastGlobalStart = Math.max(lastGlobalStart, globalStart);
      if (previousEnd !== null && globalStart - previousEnd > 20) {
        lines.push(`> [Possible music or non-speech passage ${formatSeconds(previousEnd)}–${formatSeconds(globalStart)} — review required]`, "");
        flags.push(`gap>20s before ${formatSeconds(globalStart)}`);
      }
      previousEnd = globalEnd;
      const speaker = `Speaker ${segment.speaker ?? "?"} (part ${chunk.index})`;
      let text = String(segment.text ?? "").trim();
      if (MUSIC_PATTERN.test(text)) {
        text = "[Music — review required]";
        flags.push(`music flagged at ${formatSeconds(globalStart)}`);
      }
      if (UNCERTAIN_PATTERN.test(text)) flags.push(`uncertain wording at ${formatSeconds(globalStart)}`);
      lines.push(`**[${formatSeconds(globalStart)}–${formatSeconds(globalEnd)}] ${speaker}:** ${text}`, "");
    }
    const chunkDuration = chunk.endSeconds - chunk.startSeconds;
    if (chunkDuration - lastSegmentEnd > 30) {
      lines.push(`> [Possible truncation: last speech in part ${chunk.index} ends ${formatSeconds(chunkDuration - lastSegmentEnd)} before the chunk boundary — review required]`, "");
      flags.push(`possible truncation in chunk ${chunk.index}`);
    }
    coveredUpTo = chunk.endSeconds;
  });

  lines.push("---", "", `Global timestamps monotonic: ${monotonic ? "yes" : "NO — review required"}`);
  lines.push(`Review flags: ${flags.length ? flags.join("; ") : "none recorded"}`);
  lines.push("");
  fs.writeFileSync(path.join(draftDirectory, `${state.entryId}-machine-draft.md`), lines.join("\n"));
};

await main();
