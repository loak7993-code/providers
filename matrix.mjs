const { makeProviders, makeSimpleProxyFetcher, makeStandardFetcher, targets, setM3U8ProxyUrl } = await import("./lib/index.js");
setM3U8ProxyUrl("http://localhost:9876");
const fetcher = makeStandardFetcher(fetch);
const proxied = makeSimpleProxyFetcher("http://localhost:9876/", globalThis.fetch);
const stack = makeProviders({ fetcher, proxiedFetcher: proxied, target: targets.BROWSER });
const sources = stack.listSources().map((s) => s.id);

const tests = [
  { label: "Inception", media: { type: "movie", title: "Inception", releaseYear: 2010, tmdbId: "27205", imdbId: "tt1375666" } },
  { label: "BreakingBad", media: { type: "show", title: "Breaking Bad", releaseYear: 2008, tmdbId: "1396", imdbId: "tt0903747", season: { number: 1, tmdbId: "3572" }, episode: { number: 1, tmdbId: "62085" } } },
  { label: "Dune2", media: { type: "movie", title: "Dune: Part Two", releaseYear: 2024, tmdbId: "693134", imdbId: "tt15239678" } },
];

const results = {};
for (const t of tests) {
  for (const id of sources) {
    results[id] ??= {};
    try {
      const out = await stack.runSourceScraper({ id, media: t.media });
      const n = (out.stream ?? []).length + (out.embeds ?? []).length;
      results[id][t.label] = n > 0 ? `HIT(${n})` : "0";
    } catch (e) {
      results[id][t.label] = String(e.message).slice(0, 55);
    }
  }
}
console.log("SOURCE".padEnd(18), "Inception".padEnd(20), "BreakingBad".padEnd(20), "Dune2");
for (const [id, r] of Object.entries(results)) {
  console.log(id.padEnd(18), String(r.Inception ?? "-").padEnd(20), String(r.BreakingBad ?? "-").padEnd(20), String(r.Dune2 ?? "-"));
}
