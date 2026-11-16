// Only a named transcript section may be extracted from a private review file.
// Otherwise require a clean public document rather than guessing which metadata
// or review instructions belong in the transcript.
export function publicTranscriptMarkdown(markdown) {
  const marker = /^#{2,6}\s+(?:Unverified transcript text|Transcript text|Transcript)\s*$/im.exec(markdown);
  let text = markdown;
  if (marker) {
    const level = marker[0].match(/^#+/)[0].length;
    text = markdown.slice(marker.index + marker[0].length);
    const nextSection = new RegExp(`^#{1,${level}}\\s+`, "m").exec(text);
    if (nextSection) text = text.slice(0, nextSection.index);
  } else if (
    /^#.*\bprivate\b/im.test(markdown) ||
    /<!--\s*PRIVATE\b/i.test(markdown) ||
    /^(?:Status|Draft status|Archive recording|Archive date|Source file|Source path):/im.test(markdown)
  ) {
    throw new Error("Private review metadata found. Supply a clean public transcript or an explicit ## Unverified transcript text section.");
  }
  if (/\/Users\/|\/private\/(?:tmp|var)\/|file:\/\/|BNE_MEDIA_ROOT|(?:editorial-review|review-notes|text-verification)\.(?:md|json)/m.test(text)) {
    throw new Error("Private paths or review-file references found in transcript text. Prepare a public-only input first.");
  }
  return text;
}

// Unclear-audio markers. A timed marker reads `[Unclear audio at 00:12:34–00:12:41]`
// (seconds may carry decimals; an en dash or hyphen separates the times). An
// untimed `[Unclear audio]` cannot be found again in the recording.
const MARKER = /\[Unclear audio(?: at (\d+):(\d{2}):(\d{2}(?:\.\d+)?)\s*[–-]\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?))?\]/g;
const seconds = (h, m, s) => Number(h) * 3600 + Number(m) * 60 + Number(s);

export function findUnclearMarkers(text) {
  const markers = [];
  for (const match of String(text || "").matchAll(MARKER)) {
    const timed = match[1] !== undefined;
    const start = timed ? seconds(match[1], match[2], match[3]) : null;
    const end = timed ? seconds(match[4], match[5], match[6]) : null;
    markers.push({ text: match[0], index: match.index, timed, start, end, length: timed ? end - start : null });
  }
  return markers;
}

// Section 4 of docs/transcription-workflow.md: every marker carries its time,
// and a gap of a minute or more must be identified (music, or transcribed)
// before publication, unless it has been listened to and stays unintelligible.
export const LONG_GAP_SECONDS = 60;

export function unclearAudioProblems(text) {
  const markers = findUnclearMarkers(text);
  return {
    untimed: markers.filter((marker) => !marker.timed),
    long: markers.filter((marker) => marker.timed && marker.length >= LONG_GAP_SECONDS),
  };
}
