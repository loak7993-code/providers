import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { IframeStream } from '@/providers/streams';

// Sandbox tokens applied to providers that accept a restrictive sandbox
// (matches WeFlix_v2's SANDBOX_RESTRICTIVE: blocks popups + top navigation).
const SANDBOX_RESTRICTIVE = [
  'allow-scripts',
  'allow-same-origin',
  'allow-forms',
  'allow-presentation',
  'allow-pointer-lock',
  'allow-modals',
];

interface EmbedSourceConfig {
  id: string;
  name: string;
  rank: number;
  movieUrl: (tmdbId: string) => string;
  showUrl: (tmdbId: string, season: number, episode: number) => string;
  sandbox?: string[];
}

function makeIframeSource(config: EmbedSourceConfig) {
  async function comboScraper(ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> {
    ctx.progress(50);

    const url =
      ctx.media.type === 'movie'
        ? config.movieUrl(ctx.media.tmdbId.toString())
        : config.showUrl(
            ctx.media.tmdbId.toString(),
            ctx.media.season.number,
            ctx.media.episode.number,
          );

    ctx.progress(90);

    const stream: IframeStream = {
      id: 'primary',
      type: 'iframe',
      url,
      ...(config.sandbox ? { sandbox: config.sandbox } : {}),
      // iframe streams are played by the iframe itself — no proxy, no validation
      flags: [],
      // captions are not exposed by these embeds
      captions: [],
    };

    return {
      embeds: [],
      stream: [stream],
    };
  }

  return makeSourcerer({
    id: config.id,
    name: config.name,
    rank: config.rank,
    disabled: false,
    flags: [],
    scrapeMovie: comboScraper,
    scrapeShow: comboScraper,
  });
}

// Source order mirrors WeFlix_v2: VidSrc leads (most reliable), then Videasy,
// Vidking, VidLink (iframe variant), VidCore, 2embed, EmbedSu, VidApi,
// VidSrc.cc, VidSrc-embed.ru, Super/MultiEmbed, VidNest.
//
// Note: vidlink-iframe is a SEPARATE scraper from the existing `vidlink`
// scraper (which scrapes the raw mp4 API). The iframe variant simply embeds
// `https://vidlink.pro/movie/{id}` and lets vidlink's own player handle CDN
// resolution, Cloudflare, and headers — this is what makes it work where the
// raw-mp4 approach fails in Snapflix.

export const vidsrcEmbedScraper = makeIframeSource({
  id: 'vidsrc-embed',
  name: 'VidSrc Embed',
  rank: 305,
  movieUrl: (id) => `https://vsembed.su/embed/movie/${id}`,
  showUrl: (id, s, e) => `https://vsembed.su/embed/tv/${id}/${s}/${e}`,
});

export const videasyEmbedScraper = makeIframeSource({
  id: 'videasy-embed',
  name: 'Videasy',
  rank: 300,
  movieUrl: (id) => `https://player.videasy.to/movie/${id}?overlay=true`,
  showUrl: (id, s, e) => `https://player.videasy.to/tv/${id}/${s}/${e}?overlay=true`,
});

export const vidkingEmbedScraper = makeIframeSource({
  id: 'vidking-embed',
  name: 'VidKing',
  rank: 295,
  movieUrl: (id) => `https://www.vidking.net/embed/movie/${id}?autoPlay=true`,
  showUrl: (id, s, e) => `https://www.vidking.net/embed/tv/${id}/${s}/${e}?autoPlay=true`,
});

export const vidlinkIframeScraper = makeIframeSource({
  id: 'vidlink-iframe',
  name: 'VidLink Player',
  rank: 290,
  movieUrl: (id) =>
    `https://vidlink.pro/movie/${id}?primaryColor=c45454&secondaryColor=a2a2a2&iconColor=eefdec&poster=true&title=true&nextbutton=false&player=jw&autoplay=true`,
  showUrl: (id, s, e) =>
    `https://vidlink.pro/tv/${id}/${s}/${e}?primaryColor=c45454&secondaryColor=a2a2a2&iconColor=eefdec&poster=true&title=true&nextbutton=false&player=jw&autoplay=true`,
});

export const vidcoreEmbedScraper = makeIframeSource({
  id: 'vidcore-embed',
  name: 'VidCore',
  rank: 285,
  movieUrl: (id) =>
    `https://www.vidcore.org/embed/movie/${id}?autoPlay=true&theme=c45454&poster=true&title=true&fullscreenButton=true`,
  showUrl: (id, s, e) =>
    `https://www.vidcore.org/embed/tv/${id}/${s}/${e}?autoPlay=true&theme=c45454&poster=true&title=true&fullscreenButton=true`,
});

export const twoembedEmbedScraper = makeIframeSource({
  id: '2embed-embed',
  name: '2Embed',
  rank: 280,
  movieUrl: (id) => `https://2embed.cc/embed/${id}`,
  showUrl: (id, s, e) => `https://2embed.cc/embedtv/${id}&s=${s}&e=${e}`,
});

export const embedsuEmbedScraper = makeIframeSource({
  id: 'embedsu-embed',
  name: 'EmbedSu Player',
  rank: 275,
  movieUrl: (id) => `https://embed.su/embed/movie/${id}`,
  showUrl: (id, s, e) => `https://embed.su/embed/tv/${id}/${s}/${e}`,
});

export const vidapiEmbedScraper = makeIframeSource({
  id: 'vidapi-embed',
  name: 'VidApi',
  rank: 270,
  movieUrl: (id) => `https://vidapi.qzz.io/movie/${id}`,
  showUrl: (id, s, e) => `https://vidapi.qzz.io/tv/${id}/${s}/${e}`,
});

export const vidsrcccEmbedScraper = makeIframeSource({
  id: 'vidsrccc-embed',
  name: 'VidSrc.cc',
  rank: 265,
  movieUrl: (id) => `https://vidsrc.cc/v2/embed/movie/${id}?autoPlay=true`,
  showUrl: (id, s, e) => `https://vidsrc.cc/v2/embed/tv/${id}/${s}/${e}?autoPlay=true`,
  sandbox: SANDBOX_RESTRICTIVE,
});

export const vidsrcruEmbedScraper = makeIframeSource({
  id: 'vidsrcru-embed',
  name: 'VidSrc.ru',
  rank: 260,
  movieUrl: (id) => `https://vidsrc-embed.ru/embed/movie/${id}?autoPlay=true`,
  showUrl: (id, s, e) => `https://vidsrc-embed.ru/embed/tv/${id}/${s}/${e}?autoPlay=true`,
  sandbox: SANDBOX_RESTRICTIVE,
});

export const superEmbedScraper = makeIframeSource({
  id: 'super-embed',
  name: 'SuperEmbed',
  rank: 255,
  movieUrl: (id) => `https://multiembed.mov/?video_id=${id}&tmdb=1&autoPlay=true`,
  showUrl: (id, s, e) => `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}`,
});

export const vidnestEmbedScraper = makeIframeSource({
  id: 'vidnest-embed',
  name: 'VidNest Player',
  rank: 250,
  movieUrl: (id) => `https://vidnest.fun/movie/${id}`,
  showUrl: (id, s, e) => `https://vidnest.fun/tv/${id}/${s}/${e}`,
});
