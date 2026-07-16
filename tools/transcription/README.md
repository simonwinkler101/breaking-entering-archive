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
