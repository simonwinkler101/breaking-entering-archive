// Bind R2 bucket breaking-entering-audio as AUDIO. Public approved audio only.
// Paths mirror R2 object keys. Hash-named objects must never be overwritten.
const TYPES = {
  mp3: "audio/mpeg", m4a: "audio/mp4", mp4: "audio/mp4",
  ogg: "audio/ogg", opus: "audio/ogg", wav: "audio/wav",
};
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, If-Range, If-None-Match, If-Modified-Since",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, ETag, Last-Modified",
  "Access-Control-Max-Age": "86400",
  "Cross-Origin-Resource-Policy": "cross-origin",
  "X-Content-Type-Options": "nosniff",
};

function text(request, status, message, extra = {}) {
  return new Response(request.method === "HEAD" ? null : message, {
    status,
    headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8",
      "Content-Length": String(new TextEncoder().encode(message).length),
      "Cache-Control": "no-store", ...extra },
  });
}

function notModified(value, etag) {
  return value.split(",").some((item) => {
    const tag = item.trim();
    return tag === "*" || tag.replace(/^W\//, "") === etag;
  });
}

function httpDate(value) {
  // Accept HTTP's three date forms; do not treat arbitrary numbers as dates.
  if (!/^(?:[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT|[A-Za-z]+, \d{2}-[A-Za-z]{3}-\d{2} \d{2}:\d{2}:\d{2} GMT|[A-Za-z]{3} [A-Za-z]{3} [ \d]\d \d{2}:\d{2}:\d{2} \d{4})$/.test(value)) return NaN;
  return Date.parse(value);
}

function ifRangeMatches(value, object) {
  if (value.startsWith('"')) return value === object.httpEtag;
  if (value.startsWith("W/")) return false;
  // If-Range HTTP dates require an exact Last-Modified match, to the second.
  const date = httpDate(value);
  return Number.isFinite(date) &&
    Math.floor(date / 1000) === Math.floor(object.uploaded.getTime() / 1000);
}

// null: ignore an unsupported/malformed range; false: valid but unsatisfiable.
function byteRange(value, size) {
  const match = /^bytes=\s*(\d*)-(\d*)$/i.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return null;
  // RFC 9110 permits ignoring Range for a zero-length representation.
  if (size === 0) return null;
  let start, end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (suffix === 0) return false;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (start >= size || start > end) return false;
  }
  return { start, end, length: end - start + 1 };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "GET" && request.method !== "HEAD") {
      return text(request, 405, "Method not allowed.\n", { Allow: "GET, HEAD, OPTIONS" });
    }
    let key;
    try { key = decodeURIComponent(new URL(request.url).pathname.slice(1)); }
    catch { return text(request, 404, "Not found.\n"); }
    if (!key) return text(request, 200, "Breaking and Entering audio.\n");
    const extension = key.match(/\.([a-z0-9]+)$/i)?.[1].toLowerCase();
    if (!Object.hasOwn(TYPES, extension) || !/^[a-z0-9][a-z0-9._/-]*$/i.test(key) ||
      key.split("/").some((part) => !part || part === "." || part === "..")) {
      return text(request, 404, "Not found.\n");
    }
    try {
      const object = await env.AUDIO.head(key);
      if (!object) return text(request, 404, "Not found.\n");
      const headers = new Headers(CORS);
      object.writeHttpMetadata(headers);
      headers.set("Content-Type", TYPES[extension]);
      headers.set("Content-Disposition", "inline");
      headers.set("ETag", object.httpEtag);
      headers.set("Last-Modified", object.uploaded.toUTCString());
      headers.set("Accept-Ranges", "bytes");
      const hashed = /(?:^|[./_-])[a-f0-9]{12,64}(?=[./_-]|$)/i.test(key);
      headers.set("Cache-Control", hashed
        ? "public, max-age=31536000, immutable" : "public, max-age=3600");
      const inm = request.headers.get("If-None-Match");
      const ims = httpDate(request.headers.get("If-Modified-Since") || "");
      if ((inm !== null && notModified(inm, object.httpEtag)) ||
        (inm === null && Number.isFinite(ims) &&
          Math.floor(object.uploaded.getTime() / 1000) <= Math.floor(ims / 1000))) {
        return new Response(null, { status: 304, headers });
      }
      // RFC 9110: Range applies to GET; HEAD reports the complete representation.
      let range = null;
      const requestedRange = request.headers.get("Range");
      const ifRange = request.headers.get("If-Range");
      if (request.method === "GET" && requestedRange &&
        (!ifRange || ifRangeMatches(ifRange, object))) {
        range = byteRange(requestedRange, object.size);
        if (range === false) return text(request, 416, "Range not satisfiable.\n", {
          "Content-Range": `bytes */${object.size}`, "Accept-Ranges": "bytes",
        });
      }
      headers.set("Content-Length", String(range ? range.length : object.size));
      if (range) headers.set("Content-Range", `bytes ${range.start}-${range.end}/${object.size}`);
      if (request.method === "HEAD" || object.size === 0) {
        return new Response(null, { status: 200, headers });
      }
      const body = await env.AUDIO.get(key, {
        onlyIf: { etagMatches: object.etag },
        ...(range ? { range: { offset: range.start, length: range.length } } : {}),
      });
      if (!body) return text(request, 404, "Not found.\n");
      // A changed object must not be sent with the earlier size, ETag or range.
      if (!("body" in body)) return text(request, 503, "Audio temporarily unavailable.\n", { "Retry-After": "1" });
      return new Response(body.body, { status: range ? 206 : 200, headers });
    } catch {
      return text(request, 503, "Audio temporarily unavailable.\n", { "Retry-After": "1" });
    }
  },
};
