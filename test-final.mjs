const { makeProviders, makeStandardFetcher, makeSimpleProxyFetcher, targets, setM3U8ProxyUrl } = await import("./lib/index.js");
setM3U8ProxyUrl("http://localhost:9876");
const stack = makeProviders({ fetcher: makeStandardFetcher(fetch), proxiedFetcher: makeSimpleProxyFetcher("http://localhost:9876/", globalThis.fetch), target: targets.BROWSER });
const tests = [
  { label: "Inception", media: { type: "movie", title: "Inception", releaseYear: 2010, tmdbId: "27205", imdbId: "tt1375666" } },
  { label: "BreakingBad S1E1", media: { type: "show", title: "Breaking Bad", releaseYear: 2008, tmdbId: "1396", imdbId: "tt0903747", season: { number: 1, tmdbId: "3572" }, episode: { number: 1, tmdbId: "62085" } } },
];
for (const t of tests) {
  const out = await stack.runAll({ media: t.media, sourceOrder: [], embedOrder: [] });
  console.log(`[${t.label}] source=${out.sourceId}`);
  const pl = out.stream.playlist ?? "";
  const r = await fetch(pl, { headers: { "user-agent": "Mozilla/5.0" } });
  const body = await r.text();
  const quals = body.match(/RESOLUTION=(\d+)x(\d+)/g) || [];
  console.log(`   playlist ${r.status} qualities: ${quals.join(", ") || "single"}`);
}
