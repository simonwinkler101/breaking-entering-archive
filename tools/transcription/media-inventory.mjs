import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

// Read-only inventory of station-supplied MP4 files. Media files are never
// modified, renamed, moved or deleted; manifests are written outside the
// repository to the directory given on the command line.

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const SCOPE_START = "2025-07-16";
const SCOPE_END = "2026-07-16"; // inclusive, Australia/Melbourne dates as recorded in dateKey
const SPOKEN_KINDS = new Set(["Interview", "Special program"]);

const usage = () => {
  console.error(
    "Usage: node tools/transcription/media-inventory.mjs --incoming <dir> --manifests <dir>",
  );
  process.exit(1);
};

const args = process.argv.slice(2);
const readArg = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const rawIncoming = readArg("--incoming");
const rawManifests = readArg("--manifests");
if (!rawIncoming || !rawManifests) usage();
const incomingDirectory = path.resolve(rawIncoming);
const manifestsDirectory = path.resolve(rawManifests);

// Safety: media and manifests live outside the Git repository, and the two
// directories must not overlap, so manifests can never be mistaken for media.
const isSameOrInside = (child, parent) => {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};
for (const [label, directory] of [
  ["--incoming", incomingDirectory],
  ["--manifests", manifestsDirectory],
]) {
  if (isSameOrInside(directory, root)) {
    console.error(`${label} must be outside the Git repository (${root}); got: ${directory}`);
    process.exit(1);
  }
}
if (isSameOrInside(manifestsDirectory, incomingDirectory) || isSameOrInside(incomingDirectory, manifestsDirectory)) {
  console.error("--incoming and --manifests must be separate directories, neither inside the other.");
  process.exit(1);
}
if (!fs.existsSync(incomingDirectory)) {
  console.error(`Incoming directory not found: ${incomingDirectory}`);
  process.exit(1);
}

let ffprobeVersion = null;
try {
  const { stdout } = await promisify(execFile)("ffprobe", ["-version"]);
  ffprobeVersion = stdout.split("\n")[0].trim();
} catch {
  console.error("ffprobe is not available on the PATH; install FFmpeg before running the inventory.");
  process.exit(1);
}

fs.mkdirSync(manifestsDirectory, { recursive: true });

const findMp4Files = (directory) => {
  const found = [];
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, item.name);
    if (item.isDirectory()) found.push(...findMp4Files(full));
    else if (item.isFile() && item.name.toLowerCase().endsWith(".mp4")) found.push(full);
  }
  return found.sort();
};

const sha256 = (filename) =>
  new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    fs.createReadStream(filename)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });

const probe = async (filename) => {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    filename,
  ]);
  return JSON.parse(stdout);
};

const normalise = (value) =>
  String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const STOPWORDS = new Set(
  "a an and the of on in to for with at by from her his their its new segments segment breaking entering rrr".split(
    " ",
  ),
);
const tokens = (value) => normalise(value).split(" ").filter((t) => t && !STOPWORDS.has(t));

const parseEntryDuration = (value) => {
  if (!value) return null;
  const parts = String(value).split(":").map(Number);
  if (parts.some(Number.isNaN)) return null;
  return parts.reduce((total, part) => total * 60 + part, 0);
};

const formatSeconds = (total) => {
  const s = Math.round(total);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
};

// Load archive entries and define the transcription scope.
const archiveDirectory = path.join(root, "content/archive");
const entries = fs
  .readdirSync(archiveDirectory)
  .filter((filename) => filename.endsWith(".json"))
  .map((filename) => JSON.parse(fs.readFileSync(path.join(archiveDirectory, filename), "utf8")));

const inScope = (entry) =>
  entry.dateKey && entry.dateKey >= SCOPE_START && entry.dateKey <= SCOPE_END;
const scopedSpokenEntries = entries.filter((entry) => inScope(entry) && SPOKEN_KINDS.has(entry.kind));

const entryMatchText = (entry) =>
  [
    entry.artist,
    entry.title,
    entry.aliases?.join(" ") ?? "",
    entry.href,
    (entry.sources ?? []).map((source) => source.href).join(" "),
  ].join(" ");

const scoreMatch = (file, entry) => {
  const fileTokens = tokens(path.basename(file.filename, path.extname(file.filename)));
  const entryTokens = new Set(tokens(entryMatchText(entry)));
  const artistTokens = tokens(entry.artist);
  const titleTokens = tokens(entry.title);

  const overlap = fileTokens.filter((t) => entryTokens.has(t));
  const tokenCoverage = fileTokens.length ? overlap.length / fileTokens.length : 0;
  const artistHit = artistTokens.length
    ? artistTokens.filter((t) => fileTokens.includes(t)).length / artistTokens.length
    : 0;
  const fileTokenSet = new Set(fileTokens);
  const titleHit = titleTokens.length
    ? titleTokens.filter((t) => fileTokenSet.has(t)).length / titleTokens.length
    : 0;

  const entrySeconds = parseEntryDuration(entry.duration);
  const durationDelta =
    entrySeconds !== null && file.durationSeconds !== null
      ? Math.abs(entrySeconds - file.durationSeconds)
      : null;
  const durationScore =
    durationDelta === null ? 0 : durationDelta <= 5 ? 1 : durationDelta <= 60 ? 0.5 : 0;

  const score = artistHit * 0.4 + tokenCoverage * 0.25 + titleHit * 0.15 + durationScore * 0.2;
  return { entry, score, artistHit, titleHit, tokenCoverage, durationDelta, entrySeconds };
};

const explain = (m) => {
  const parts = [];
  parts.push(`artist tokens ${Math.round(m.artistHit * 100)}% present in filename`);
  parts.push(`filename token coverage ${Math.round(m.tokenCoverage * 100)}%`);
  parts.push(`title tokens ${Math.round(m.titleHit * 100)}% present`);
  if (m.durationDelta !== null) {
    parts.push(
      `entry duration ${formatSeconds(m.entrySeconds)} differs from file by ${Math.round(m.durationDelta)}s`,
    );
  } else {
    parts.push("no duration recorded on entry or file");
  }
  return parts.join("; ");
};

const main = async () => {
  const files = [];
  for (const filename of findMp4Files(incomingDirectory)) {
    const record = {
      filename: path.basename(filename),
      relativePath: path.relative(incomingDirectory, filename),
      sizeBytes: null,
      sha256: null,
      container: null,
      durationSeconds: null,
      duration: null,
      audioCodec: null,
      videoCodec: null,
      hasRealVideo: false,
      sampleRate: null,
      channels: null,
      streamCount: null,
      errors: [],
    };
    try {
      record.sizeBytes = fs.statSync(filename).size;
    } catch (error) {
      record.errors.push(`stat failed: ${error.message}`);
    }
    try {
      record.sha256 = await sha256(filename);
    } catch (error) {
      record.errors.push(`checksum failed: ${error.message}`);
    }
    try {
      const info = await probe(filename);
      record.container = info.format?.format_name ?? null;
      const seconds = Number(info.format?.duration);
      record.durationSeconds = Number.isFinite(seconds) ? seconds : null;
      record.duration = record.durationSeconds === null ? null : formatSeconds(record.durationSeconds);
      record.streamCount = info.streams?.length ?? null;
      const audio = (info.streams ?? []).find((s) => s.codec_type === "audio");
      if (audio) {
        record.audioCodec = audio.codec_name ?? null;
        record.sampleRate = audio.sample_rate ? Number(audio.sample_rate) : null;
        record.channels = audio.channels ?? null;
      } else {
        record.errors.push("no audio stream found");
      }
      const video = (info.streams ?? []).filter((s) => s.codec_type === "video");
      const realVideo = video.find((s) => s.disposition?.attached_pic !== 1);
      record.videoCodec = video[0]?.codec_name ?? null;
      record.hasRealVideo = Boolean(realVideo);
    } catch (error) {
      record.errors.push(`ffprobe failed: ${error.message}`);
    }
    files.push(record);
  }

  // Byte-identical duplicate detection.
  const byChecksum = new Map();
  for (const file of files) {
    if (!file.sha256) continue;
    if (byChecksum.has(file.sha256)) {
      file.matchState = "duplicate";
      file.duplicateOf = byChecksum.get(file.sha256).relativePath;
      file.matchExplanation = `byte-identical to ${file.duplicateOf} (same SHA-256)`;
    } else {
      byChecksum.set(file.sha256, file);
    }
  }

  // Match non-duplicate files against in-scope spoken entries.
  for (const file of files) {
    if (file.matchState === "duplicate") continue;
    const scored = scopedSpokenEntries
      .map((entry) => scoreMatch(file, entry))
      .sort((a, b) => b.score - a.score);
    const best = scored[0];
    const second = scored[1];

    if (!best || best.score < 0.3) {
      file.matchState = "unmatched";
      file.matchExplanation = best
        ? `best candidate ${best.entry.id} scored too low: ${explain(best)}`
        : "no in-scope spoken entries to match against";
      continue;
    }
    const margin = best.score - (second?.score ?? 0);
    if (margin < 0.15) {
      file.matchState = "ambiguous";
      file.matchedEntryId = best.entry.id;
      file.alternativeEntryId = second?.entry.id ?? null;
      file.matchExplanation =
        `cannot separate ${best.entry.id} (score ${best.score.toFixed(2)}) from ` +
        `${second.entry.id} (score ${second.score.toFixed(2)}); ${explain(best)}`;
      continue;
    }
    const confirmed =
      best.artistHit === 1 &&
      best.durationDelta !== null &&
      best.durationDelta <= 5 &&
      best.tokenCoverage >= 0.5;
    file.matchState = confirmed ? "confirmed" : "probable";
    file.matchedEntryId = best.entry.id;
    file.matchedEntryKind = best.entry.kind;
    file.matchedEntryDateKey = best.entry.dateKey;
    file.transcriptionCandidate = SPOKEN_KINDS.has(best.entry.kind);
    file.matchExplanation =
      (confirmed
        ? "full artist match, majority filename coverage and duration within 5s: "
        : "strong but not exact signals, human confirmation required: ") + explain(best);
  }

  const matchedIds = new Set(files.map((file) => file.matchedEntryId).filter(Boolean));
  const unmatchedScopedInterviews = scopedSpokenEntries
    .filter((entry) => entry.kind === "Interview" && !matchedIds.has(entry.id))
    .map((entry) => ({ id: entry.id, artist: entry.artist, dateKey: entry.dateKey, duration: entry.duration }));

  const ok = files.filter((file) => file.durationSeconds !== null);
  const summary = {
    generatedAtNote: "run locally; see filesystem timestamps of the manifest files",
    ffprobeVersion,
    incomingDirectory,
    scope: { start: SCOPE_START, end: SCOPE_END, timezone: "Australia/Melbourne" },
    suppliedMp4Count: files.length,
    totalSizeBytes: files.reduce((total, file) => total + (file.sizeBytes ?? 0), 0),
    totalDurationSeconds: ok.reduce((total, file) => total + file.durationSeconds, 0),
    totalDuration: formatSeconds(ok.reduce((total, file) => total + file.durationSeconds, 0)),
    matchStateCounts: Object.fromEntries(
      ["confirmed", "probable", "ambiguous", "unmatched", "duplicate"].map((state) => [
        state,
        files.filter((file) => file.matchState === state).length,
      ]),
    ),
    filesOver25MB: files.filter((file) => (file.sizeBytes ?? 0) > 25 * 1024 * 1024).length,
    interviewsOverSixMinutes: files.filter(
      (file) =>
        file.matchedEntryKind === "Interview" &&
        file.durationSeconds !== null &&
        file.durationSeconds > 360,
    ).length,
    filesWithRealVideo: files.filter((file) => file.hasRealVideo).length,
    filesWithErrors: files.filter((file) => file.errors.length).length,
    inScopeSpokenEntryCount: scopedSpokenEntries.length,
    inScopeInterviewsWithoutSuppliedMp4: unmatchedScopedInterviews.length,
  };

  const manifest = { summary, files, inScopeInterviewsWithoutSuppliedMp4: unmatchedScopedInterviews };
  fs.writeFileSync(
    path.join(manifestsDirectory, "media-inventory.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  const csvEscape = (value) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const columns = [
    "filename",
    "relativePath",
    "sizeBytes",
    "sha256",
    "container",
    "duration",
    "durationSeconds",
    "audioCodec",
    "videoCodec",
    "hasRealVideo",
    "sampleRate",
    "channels",
    "streamCount",
    "matchState",
    "matchedEntryId",
    "matchedEntryKind",
    "matchedEntryDateKey",
    "transcriptionCandidate",
    "duplicateOf",
    "matchExplanation",
    "errors",
  ];
  const csv = [
    columns.join(","),
    ...files.map((file) =>
      columns
        .map((column) => csvEscape(column === "errors" ? file.errors.join("; ") : file[column]))
        .join(","),
    ),
  ].join("\n");
  fs.writeFileSync(path.join(manifestsDirectory, "media-inventory.csv"), `${csv}\n`);

  console.log(JSON.stringify(summary, null, 2));
  for (const file of files) {
    console.log(`\n${file.relativePath}`);
    console.log(`  state: ${file.matchState}  entry: ${file.matchedEntryId ?? "-"}`);
    console.log(`  ${file.matchExplanation}`);
    if (file.errors.length) console.log(`  errors: ${file.errors.join("; ")}`);
  }
};

await main();
