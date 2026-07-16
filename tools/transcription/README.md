# Transcription tools

Isolated tooling for the audio-acquisition and transcription pipeline. Nothing
in this directory is referenced by the site build (`npm run build`); the only
intended touchpoint with the site is eventually writing the existing
`transcript` field into `content/archive/*.json`.

## media-inventory.mjs

Read-only inventory of station-supplied MP4 files. It never modifies, renames,
moves or deletes media, makes no network requests, and writes its manifests
outside the repository.

Requires `ffprobe` (FFmpeg) on the PATH; availability is verified at startup
before any processing, and the ffprobe version is recorded in the JSON
manifest.

```sh
node tools/transcription/media-inventory.mjs \
  --incoming ~/Documents-Local/breaking-entering-archive-media/incoming \
  --manifests ~/Documents-Local/breaking-entering-archive-media/manifests
```

Media locations are always passed on the command line; private paths are never
recorded in this repository.

Safeguards enforced before processing begins:

- both CLI paths are resolved to absolute paths and validated;
- the tool refuses to run if `--incoming` or `--manifests` is the repository
  root or anywhere inside the repository;
- the tool refuses to run if the manifests directory is the same as, inside,
  or enclosing the incoming directory.

For every MP4 it records file size, SHA-256 checksum, container, duration,
audio/video codecs, sample rate, channels and stream count, detects
byte-identical duplicates, and captures per-file inspection errors without
aborting the run.

Files are compared against `content/archive/*.json` records dated 2025-07-16
through 2026-07-16 (Australia/Melbourne). Only spoken kinds (Interview,
Special program) are considered transcription candidates; guest mixes, live
performances and broadcasts are never auto-selected. Proposed matches use
artist, title, date and duration and are labelled `confirmed`, `probable`,
`ambiguous`, `unmatched` or `duplicate`, each with a written confidence
explanation — uncertain matches are never silently accepted.

Outputs: `media-inventory.json` and `media-inventory.csv` in the given
manifests directory.

## transcribe-pilot.mjs

Single-entry transcription pilot. Only explicitly authorized entry IDs are
accepted (currently `carla-dal-forno`); all other entries are refused.

```sh
node tools/transcription/transcribe-pilot.mjs \
  --input "<path to confirmed source MP4>" \
  --entry-id carla-dal-forno \
  --media-root ~/Documents-Local/breaking-entering-archive-media \
  [--execute]
```

Behaviour and safeguards:

- Dry-run by default: without `--execute` it builds the derivative and chunk
  plan and reports chunk count, sizes and output directories, but makes no
  API request.
- `--input` and `--media-root` must be outside the Git repository.
- The source file is never modified; a mono 16 kHz 64 kbps MP3 speech
  derivative (video stream removed) is created under
  `<media-root>/working/<entry-id>/`.
- The derivative is split into ~5-minute chunks with ~2 s overlap, preferring
  a silence within 15 s of each boundary. Hard limits: uploads < 24 MB,
  total duration ≤ 60 minutes, at most 12 API requests.
- API: `gpt-4o-transcribe-diarize`, `response_format: diarized_json`,
  `chunking_strategy: auto`, via the official OpenAI SDK with automatic
  retries disabled. No prompt, temperature or speaker hints are sent.
- `OPENAI_API_KEY` is read only from the environment and never printed or
  persisted.
- A failed request stops the run without retrying; re-running resumes and
  skips chunks that already succeeded (state in `working/<entry-id>/`).
- Raw, unedited API responses plus `run-metadata.json` (checksums, versions,
  offsets, timestamps, statuses) go to `<media-root>/transcripts/raw/<id>/`;
  an anonymous-speaker Markdown machine draft headed
  "MACHINE DRAFT — NOT REVIEWED OR APPROVED" goes to
  `<media-root>/transcripts/drafts/<id>/`.
- Drafts are never copied into archive entries automatically; only a
  human-approved transcript may reach an entry's `transcript` field.
