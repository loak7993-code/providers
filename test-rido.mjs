const { makeProviders, makeSimpleProxyFetcher, makeStandardFetcher, targets, setM3U8ProxyUrl } = await import("./lib/index.js");
setM3U8ProxyUrl("http://localhost:9876");
const stack = makeProviders({ fetcher: makeStandardFetcher(fetch), proxiedFetcher: makeSimpleProxyFetcher("http://localhost:9876/", globalThis.fetch), target: targets.BROWSER });
const tests = [
  ["Inception", { type: "movie", title: "Inception", releaseYear: 2010, tmdbId: "27205", imdbId: "tt1375666" }],
  ["BreakingBad", { type: "show", title: "Breaking Bad", releaseYear: 2008, tmdbId: "1396", imdbId: "tt0903747", season: { number: 1, tmdbId: "3572" }, episode: { number: 1, tmdbId: "62085" } }],
];
for (const [label, media] of tests) {
  try {
    const out = await stack.runSourceScraper({ id: "ridomovies", media });
    console.log(`[ridomovies ${label}] embeds:`, out.embeds.map(e => e.embedId));
    // resolve embed
    const emb = out.embeds[0];
    const eo = await stack.runEmbedScraper({ id: emb.embedId, url: emb.url, media });
    const streams = eo?.stream ?? [];
    console.log(`  closeload -> ${streams.length} stream(s)`);
    streams.forEach(s => console.log(`    ${s.type} q=${s.quality ?? "?"} ${String(s.playlist ?? s.streamUrl ?? Object.values(s.qualities ?? {})[0]?.url ?? "").slice(0, 100)}`));
  } catch (e) { console.log(`[${label}] ERR:`, String(e.message).slice(0, 100)); }
}
