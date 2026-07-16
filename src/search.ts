export type SearchableSource = {
  label: string;
  access: string;
  status: string;
};

export type SearchableEntry = {
  id: string;
  artist: string;
  title: string;
  kind: string;
  date: string;
  presenters: string;
  source: string;
  summary: string;
  transcript?: string;
  access: string;
  aliases?: string[];
  tags: string[];
  sources: SearchableSource[];
};

type SearchField = {
  name: "artist" | "title" | "alias" | "tag" | "metadata" | "summary" | "transcript";
  text: string;
  tokens: string[];
  tokenSet: Set<string>;
  weight: number;
};

export type SearchIndexItem<T extends SearchableEntry> = {
  entry: T;
  fields: SearchField[];
};

export type SearchResult<T extends SearchableEntry> = {
  entry: T;
  score: number;
  transcriptExcerpt: string;
};

const foldAmpersands = (value: string) => value.replace(/&/g, " and ");

export const normaliseSearchText = (value: string | null | undefined) =>
  foldAmpersands(value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("en-AU")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

const tokenise = (value: string) => {
  const normalised = normaliseSearchText(value);
  return normalised ? normalised.split(" ") : [];
};

const editDistanceWithin = (left: string, right: string, limit: number) => {
  if (Math.abs(left.length - right.length) > limit) return false;
  if (left === right) return true;
  if (limit > 0 && left.length === right.length) {
    const differences = [...left].flatMap((character, index) =>
      character === right[index] ? [] : [index],
    );
    if (
      differences.length === 2 &&
      differences[1] === differences[0] + 1 &&
      left[differences[0]] === right[differences[1]] &&
      left[differences[1]] === right[differences[0]]
    ) {
      return true;
    }
  }

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    let rowMinimum = current[0];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      const value = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + substitutionCost,
      );
      current.push(value);
      rowMinimum = Math.min(rowMinimum, value);
    }
    if (rowMinimum > limit) return false;
    previous = current;
  }
  return previous[right.length] <= limit;
};

const fuzzyLimit = (token: string) => {
  if (token.length >= 8) return 2;
  if (token.length >= 4) return 1;
  return 0;
};

const tokenMatchStrength = (queryToken: string, field: SearchField) => {
  if (field.tokenSet.has(queryToken)) return 1;
  if (queryToken.length >= 3 && field.text.includes(queryToken)) return 0.78;
  if (field.name === "transcript") return 0;

  const limit = fuzzyLimit(queryToken);
  if (
    limit > 0 &&
    field.tokens.some(
      (fieldToken) =>
        Math.abs(fieldToken.length - queryToken.length) <= limit &&
        editDistanceWithin(queryToken, fieldToken, limit),
    )
  ) {
    return 0.42;
  }
  return 0;
};

const makeField = (name: SearchField["name"], value: string, weight: number): SearchField => {
  const tokens = tokenise(value);
  return {
    name,
    text: normaliseSearchText(value),
    tokens,
    tokenSet: new Set(tokens),
    weight,
  };
};

export const createSearchIndex = <T extends SearchableEntry>(entries: T[]) =>
  entries.map((entry): SearchIndexItem<T> => ({
    entry,
    fields: [
      makeField("artist", entry.artist, 130),
      makeField("title", entry.title, 115),
      ...(entry.aliases ?? []).map((alias) => makeField("alias", alias, 125)),
      ...entry.tags.map((tag) => makeField("tag", tag, 92)),
      makeField("metadata", entry.kind, 64),
      makeField("metadata", entry.date, 58),
      makeField("metadata", entry.presenters, 70),
      makeField("metadata", entry.source, 46),
      makeField("metadata", entry.access, 28),
      ...entry.sources.flatMap((source) => [
        makeField("metadata", source.label, 44),
        makeField("metadata", source.access, 26),
        makeField("metadata", source.status, 24),
      ]),
      makeField("summary", entry.summary, 48),
      makeField("transcript", entry.transcript ?? "", 18),
    ].filter((field) => field.text),
  }));

const phraseBonus = (field: SearchField, query: string) => {
  if (!query || !field.text.includes(query)) return 0;
  if (field.text === query) {
    if (field.name === "artist") return 820;
    if (field.name === "alias") return 760;
    if (field.name === "title") return 700;
    if (field.name === "tag") return 360;
  }
  if (field.text.startsWith(query)) return field.weight * 3.2;
  return field.weight * 2.15;
};

const transcriptExcerpt = (transcript: string, queryTokens: string[]) => {
  const words = [...transcript.matchAll(/\S+/g)].map((match) => match[0]);
  if (!words.length) return "";

  let matchIndex = words.findIndex((word) => {
    const foldedWord = normaliseSearchText(word);
    return queryTokens.some((token) => {
      if (foldedWord.includes(token)) return true;
      const limit = fuzzyLimit(token);
      return limit > 0 && editDistanceWithin(token, foldedWord, limit);
    });
  });
  if (matchIndex < 0) matchIndex = 0;

  const start = Math.max(0, matchIndex - 13);
  const end = Math.min(words.length, matchIndex + 25);
  const excerpt = words.slice(start, end).join(" ").replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${excerpt}${end < words.length ? "…" : ""}`;
};

export const searchArchive = <T extends SearchableEntry>(
  index: SearchIndexItem<T>[],
  queryValue: string,
): SearchResult<T>[] => {
  const query = normaliseSearchText(queryValue);
  if (!query) {
    return index.map(({ entry }) => ({ entry, score: 0, transcriptExcerpt: "" }));
  }

  const queryTokens = query.split(" ");
  const results: SearchResult<T>[] = [];

  for (const item of index) {
    let score = 0;
    let matched = true;
    let transcriptWasNeeded = false;

    for (const queryToken of queryTokens) {
      let bestScore = 0;
      let bestField: SearchField | null = null;
      for (const field of item.fields) {
        const fieldScore = field.weight * tokenMatchStrength(queryToken, field);
        if (fieldScore > bestScore) {
          bestScore = fieldScore;
          bestField = field;
        }
      }
      if (!bestField || bestScore === 0) {
        matched = false;
        break;
      }
      score += bestScore;

      const nonTranscriptMatch = item.fields
        .filter((field) => field.name !== "transcript")
        .some((field) => tokenMatchStrength(queryToken, field) > 0);
      if (!nonTranscriptMatch && bestField.name === "transcript") transcriptWasNeeded = true;
    }

    if (!matched) continue;
    score += Math.max(...item.fields.map((field) => phraseBonus(field, query)), 0);
    for (const field of item.fields.filter(({ name }) =>
      name === "artist" || name === "title" || name === "alias",
    )) {
      if (queryTokens.every((token) => tokenMatchStrength(token, field) > 0)) {
        const compactness = Math.max(0, 80 - Math.abs(field.tokens.length - queryTokens.length) * 10);
        score += field.weight * 1.1 + compactness;
      }
    }

    results.push({
      entry: item.entry,
      score,
      transcriptExcerpt:
        transcriptWasNeeded && item.entry.transcript
          ? transcriptExcerpt(item.entry.transcript, queryTokens)
          : "",
    });
  }

  return results;
};
