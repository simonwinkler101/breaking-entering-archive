import assert from 'node:assert/strict';
import worker from './worker.js';

const data = new TextEncoder().encode('0123456789');
const key = 'interviews/jazmine-mary/0123456789abcdef.mp3';
const modified = new Date('2026-11-16T01:02:03.789Z');
let passed = 0;

function bucket({ missing = false, empty = false, race = false, throws = false } = {}) {
  const bytes = empty ? new Uint8Array() : data;
  const calls = [];
  const object = {
    size: bytes.length, etag: 'abc123', httpEtag: '"abc123"', uploaded: modified,
    writeHttpMetadata(headers) { headers.set('Content-Type', 'application/octet-stream'); },
  };
  return {
    calls,
    async head(requested) { calls.push(['head', requested]); return missing ? null : object; },
    async get(requested, options) {
      calls.push(['get', requested, options]);
      assert.equal(options.onlyIf.etagMatches, 'abc123');
      if (throws) throw new Error('private backend details');
      if (race) return { ...object, etag: 'changed' };
      const range = options.range;
      const chunk = range ? bytes.slice(range.offset, range.offset + range.length) : bytes;
      return { ...object, body: new Response(chunk).body };
    },
  };
}

async function run(name, { path = key, method = 'GET', headers = {}, mock = {} } = {}, check) {
  const r2 = bucket(mock);
  const request = new Request(`https://audio.example/${path}`, { method, headers });
  const response = await worker.fetch(request, { AUDIO: r2 });
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*', name);
  assert.equal(response.headers.get('Access-Control-Allow-Credentials'), null, name);
  await check(response, r2);
  passed++;
}

await run('full file', {}, async (r, b) => {
  assert.equal(r.status, 200); assert.equal(await r.text(), '0123456789');
  assert.equal(r.headers.get('Content-Length'), '10');
  assert.equal(r.headers.get('Content-Type'), 'audio/mpeg');
  assert.equal(r.headers.get('Accept-Ranges'), 'bytes');
  assert.equal(r.headers.get('ETag'), '"abc123"');
  assert.match(r.headers.get('Cache-Control'), /immutable/);
  assert.equal(b.calls.length, 2);
});
await run('HEAD', { method: 'HEAD' }, async (r, b) => {
  assert.equal(r.status, 200); assert.equal(await r.text(), '');
  assert.equal(r.headers.get('Content-Length'), '10'); assert.equal(b.calls.length, 1);
});
await run('HEAD ignores Range', { method: 'HEAD', headers: { Range: 'bytes=2-4' } }, async r => {
  assert.equal(r.status, 200); assert.equal(r.headers.get('Content-Length'), '10');
  assert.equal(r.headers.get('Content-Range'), null);
});
for (const [range, expected, contentRange] of [
  ['bytes=2-4', '234', 'bytes 2-4/10'],
  ['bytes=7-', '789', 'bytes 7-9/10'],
  ['bytes=-3', '789', 'bytes 7-9/10'],
  ['bytes=-99', '0123456789', 'bytes 0-9/10'],
  ['bytes=9-99', '9', 'bytes 9-9/10'],
  ['bytes=0-0', '0', 'bytes 0-0/10'],
  ['bytes=0-', '0123456789', 'bytes 0-9/10'],
  ['bytes= 2-4', '234', 'bytes 2-4/10'],
  ['bytes=-999999999999999999999999999999999', '0123456789', 'bytes 0-9/10'],
]) {
  await run(range, { headers: { Range: range } }, async r => {
    assert.equal(r.status, 206); assert.equal(r.headers.get('Content-Range'), contentRange);
    assert.equal(r.headers.get('Content-Length'), String(expected.length));
    assert.equal(await r.text(), expected);
  });
}
for (const range of ['bytes=10-', 'bytes=12-13', 'bytes=4-2', 'bytes=-0']) {
  await run(`unsatisfiable ${range}`, { headers: { Range: range } }, async (r, b) => {
    assert.equal(r.status, 416); assert.equal(r.headers.get('Content-Range'), 'bytes */10');
    assert.equal(b.calls.length, 1);
  });
}
for (const range of ['bytes=', 'bytes=-', 'bytes=bad', 'bytes=0-1,4-5', 'items=0-2']) {
  await run(`ignore ${range}`, { headers: { Range: range } }, async r => {
    assert.equal(r.status, 200); assert.equal(await r.text(), '0123456789');
  });
}
for (const value of ['"abc123"', 'W/"abc123"', '"other", W/"abc123"', '*']) {
  await run(`ETag ${value}`, { headers: { 'If-None-Match': value, Range: 'bytes=1-2' } }, async (r, b) => {
    assert.equal(r.status, 304); assert.equal(await r.text(), ''); assert.equal(b.calls.length, 1);
  });
}
await run('HEAD conditional', { method: 'HEAD', headers: { 'If-None-Match': '"abc123"' } }, async r => {
  assert.equal(r.status, 304); assert.equal(await r.text(), '');
});
await run('ETag precedence over date', { headers: { 'If-None-Match': '"other"', 'If-Modified-Since': 'Wed, 18 Nov 2026 01:02:03 GMT' } }, async r => assert.equal(r.status, 200));
await run('matching date', { headers: { 'If-Modified-Since': modified.toUTCString() } }, async r => assert.equal(r.status, 304));
await run('older date', { headers: { 'If-Modified-Since': 'Sun, 15 Nov 2026 01:02:03 GMT' } }, async r => assert.equal(r.status, 200));
await run('invalid numeric date ignored', { headers: { 'If-Modified-Since': '9999' } }, async r => assert.equal(r.status, 200));
for (const [value, status] of [
  ['"abc123"', 206], ['"other"', 200], ['W/"abc123"', 200],
  [modified.toUTCString(), 206], ['Sun, 15 Nov 2026 01:02:03 GMT', 200],
  ['Wed, 18 Nov 2026 01:02:03 GMT', 200], ['nonsense', 200],
]) {
  await run(`If-Range ${value}`, { headers: { Range: 'bytes=0-2', 'If-Range': value } }, async r => {
    assert.equal(r.status, status); assert.equal(await r.text(), status === 206 ? '012' : '0123456789');
  });
}
await run('zero file', { mock: { empty: true } }, async (r, b) => {
  assert.equal(r.status, 200); assert.equal(r.headers.get('Content-Length'), '0');
  assert.equal(await r.text(), ''); assert.equal(b.calls.length, 1);
});
await run('zero file range', { mock: { empty: true }, headers: { Range: 'bytes=0-0' } }, async r => {
  assert.equal(r.status, 200); assert.equal(r.headers.get('Content-Length'), '0');
});
await run('zero file suffix range', { mock: { empty: true }, headers: { Range: 'bytes=-3' } }, async r => {
  assert.equal(r.status, 200); assert.equal(r.headers.get('Content-Length'), '0');
});
await run('missing', { mock: { missing: true } }, async r => assert.equal(r.status, 404));
await run('changed object', { mock: { race: true } }, async r => {
  assert.equal(r.status, 503); assert.equal(r.headers.get('Cache-Control'), 'no-store');
});
await run('backend failure no disclosure', { mock: { throws: true } }, async r => {
  assert.equal(r.status, 503); assert.doesNotMatch(await r.text(), /private/);
});
for (const path of ['', 'file.json', 'file.constructor', 'folder//file.mp3', 'https://elsewhere.example/audio.mp3', 'bad%00.mp3', 'bad%zz.mp3', '%2e%2e%2ffile.mp3']) {
  await run(`path ${path}`, { path }, async (r, b) => {
    assert.equal(r.status, path === '' ? 200 : 404); assert.equal(b.calls.length, 0);
  });
}
await run('mutable filename cache', { path: 'audio/interview.m4a' }, async r => {
  assert.equal(r.headers.get('Content-Type'), 'audio/mp4');
  assert.equal(r.headers.get('Cache-Control'), 'public, max-age=3600');
});
await run('preflight', { method: 'OPTIONS' }, async (r, b) => {
  assert.equal(r.status, 204); assert.equal(await r.text(), ''); assert.equal(b.calls.length, 0);
});
await run('no mutations', { method: 'POST' }, async (r, b) => {
  assert.equal(r.status, 405); assert.equal(r.headers.get('Allow'), 'GET, HEAD, OPTIONS');
  assert.equal(b.calls.length, 0);
});
console.log(`${passed} HTTP/R2 contract checks passed.`);
