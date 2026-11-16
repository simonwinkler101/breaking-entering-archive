export const TRANSCRIPT_STATUSES = ["draft", "reviewed"];

export function validateTranscriptStatus(entry) {
  if (entry.transcriptStatus === undefined) return;
  if (!TRANSCRIPT_STATUSES.includes(entry.transcriptStatus)) {
    throw new Error(`${entry.id} transcriptStatus must be draft or reviewed.`);
  }
  if (typeof entry.transcript !== "string" || !entry.transcript.trim()) {
    throw new Error(`${entry.id} has a transcriptStatus but no transcript.`);
  }
  if (entry.transcriptStatus === "draft" && entry.pullQuote !== undefined) {
    throw new Error(`${entry.id} draft transcripts must not have pull quotes.`);
  }
}

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
