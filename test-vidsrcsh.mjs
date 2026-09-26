const { makeProviders, makeSimpleProxyFetcher, makeStandardFetcher, targets, setM3U8ProxyUrl } = await import("./lib/index.js");
setM3U8ProxyUrl("http://localhost:9876");
const fetcher = makeStandardFetcher(fetch);
const proxied = makeSimpleProxyFetcher("http://localhost:9876/", globalThis.fetch);
const stack = makeProviders({ fetcher, proxiedFetcher: proxied, target: targets.BROWSER });

const tests = [
  { label: "MOVIE Inception", media: { type: "movie", title: "Inception", releaseYear: 2010, tmdbId: "27205", imdbId: "tt1375666" } },
  { label: "MOVIE Dune Part Two", media: { type: "movie", title: "Dune: Part Two", releaseYear: 2024, tmdbId: "693134", imdbId: "tt15239678" } },
  { label: "TV Breaking Bad S1E1", media: { type: "show", title: "Breaking Bad", releaseYear: 2008, tmdbId: "1396", imdbId: "tt0903747", season: { number: 1, tmdbId: "3572" }, episode: { number: 1, tmdbId: "62085" } } },
  { label: "TV The Last of Us S2E1", media: { type: "show", title: "The Last of Us", releaseYear: 2023, tmdbId: "100088", imdbId: "tt3581920", season: { number: 2, tmdbId: "397266" }, episode: { number: 1, tmdbId: "6413687" } } },
  { label: "ANIME Spirited Away", media: { type: "movie", title: "Spirited Away", releaseYear: 2001, tmdbId: "129", imdbId: "tt0245429" } },
  { label: "ANIME AoT S1E5", media: { type: "show", title: "Attack on Titan", releaseYear: 2013, tmdbId: "1429", imdbId: "tt2560140", season: { number: 1, tmdbId: "42390" }, episode: { number: 5, tmdbId: "325419" } } },
];

for (const t of tests) {
  const t0 = Date.now();
  try {
    const out = await stack.runSourceScraper({ id: "vidsrcsh", media: t.media });
    const streams = out?.stream ?? [];
    if (streams.length > 0) {
      const s = streams[0];
      const pl = s.playlist ?? s.streamUrl;
      // verify the playlist actually serves
      const r = await fetch(pl, { headers: { "user-agent": "Mozilla/5.0" } });
      const body = await r.text();
      const ok = body.trimStart().startsWith("#EXTM3U");
      console.log(`[HIT] ${t.label.padEnd(24)} ${Date.now()-t0}ms  HLS=${ok} (${r.status}, ${(body.match(/#EXT-X-STREAM-INF/g)||[]).length} qualities)`);
      console.log(`     ${pl.slice(0, 110)}`);
    } else {
      console.log(`[ - ] ${t.label} -> no streams`);
    }
  } catch (e) {
    console.log(`[ERR] ${t.label.padEnd(24)} ${String(e.message).slice(0, 90)}`);
  }
}
