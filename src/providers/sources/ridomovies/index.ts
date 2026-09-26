import { flags } from '@/entrypoint/utils/targets';

import { SourcererEmbed, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';

const ridoMoviesBase = 'https://ridomovie.to';

interface RidoSearchItem {
  id: number;
  type: 'movie' | 'tv';
  title: string;
  original_title?: string;
  slug: string;
  release_date?: string;
}

interface RidoSearchResponse {
  status: boolean;
  data: RidoSearchItem[];
}

const normalizeTitle = (title: string): string =>
  title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');

/**
 * RidoMovies (ridomovie.to — moved from ridomovies.tv, API moved from
 * /core/api to /api).
 * Flow: /api/search?q= -> match by title+year+type -> fetch the watch page
 * (movie/{slug} or tv/{slug}/season-N/episode-M) -> extract the closeload
 * embed from the iframe data-src -> hand off to the closeload embed scraper.
 */
const universalScraper = async (ctx: MovieScrapeContext | ShowScrapeContext) => {
  const searchResult = await ctx.proxiedFetcher<RidoSearchResponse>('/api/search', {
    baseUrl: ridoMoviesBase,
    query: { q: ctx.media.title },
  });

  if (!searchResult?.data || searchResult.data.length === 0) {
    throw new NotFoundError('No search results found');
  }

  const wantedType = ctx.media.type === 'show' ? 'tv' : 'movie';
  const searchYear = String(ctx.media.releaseYear);
  const normalizedSearchTitle = normalizeTitle(ctx.media.title);

  const candidates = searchResult.data.filter((i) => i.type === wantedType);
  let target =
    candidates.find(
      (i) => normalizeTitle(i.title) === normalizedSearchTitle && (i.release_date ?? '').startsWith(searchYear),
    ) ??
    candidates.find(
      (i) =>
        (i.release_date ?? '').startsWith(searchYear) &&
        (normalizeTitle(i.title).includes(normalizedSearchTitle) ||
          normalizedSearchTitle.includes(normalizeTitle(i.title))),
    ) ??
    candidates.find((i) => normalizeTitle(i.title) === normalizedSearchTitle);

  if (!target?.slug) throw new NotFoundError('No matching media found');

  ctx.progress(40);

  const watchPath =
    ctx.media.type === 'show'
      ? `/tv/${target.slug}/season-${ctx.media.season.number}/episode-${ctx.media.episode.number}`
      : `/movie/${target.slug}`;

  const watchPage = await ctx.proxiedFetcher<string>(watchPath, {
    baseUrl: ridoMoviesBase,
  });

  ctx.progress(70);

  // the page carries the closeload iframe in data-src attributes
  const iframeMatch = watchPage.match(
    /closeload\.top\/(?:video\/embed|embed-\{url\})\/([A-Za-z0-9_-]+)/,
  );
  // fall back to any closeload url form
  const fallbackMatch = watchPage.match(/closeload\.top\/[A-Za-z0-9\/_-]*([A-Za-z0-9_-]{8,})/);
  const videoId = iframeMatch?.[1] ?? fallbackMatch?.[1];
  if (!videoId) throw new NotFoundError('No embed found on watch page');

  const embedUrl = `https://closeload.top/video/embed/${videoId}/`;

  ctx.progress(90);

  const embeds: SourcererEmbed[] = [{ embedId: 'closeload', url: embedUrl }];
  return { embeds };
};

export const ridooMoviesScraper = makeSourcerer({
  id: 'ridomovies',
  name: 'RidoMovies',
  rank: 203,
  flags: [flags.CORS_ALLOWED],
  disabled: false,
  scrapeMovie: universalScraper,
  scrapeShow: universalScraper,
});
