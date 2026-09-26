import { flags } from '@/entrypoint/utils/targets';
import { EmbedOutput, makeEmbed } from '@/providers/base';
import { Caption, getCaptionTypeFromUrl, labelToLanguageCode } from '@/providers/captions';

const baseUrl = 'https://api.1anime.app';

interface ConsumetSource {
  url: string;
  isM3U8: boolean;
  quality?: string;
}

interface ConsumetSubtitle {
  url: string;
  lang: string;
}

interface ConsumetWatchResponse {
  sources: ConsumetSource[];
  subtitles?: ConsumetSubtitle[];
  headers?: Record<string, string>;
}

function makeConsumetEmbed(server: string, rank: number) {
  return makeEmbed({
    id: `consumet-${server}`,
    name: `Consumet ${server}`,
    rank,
    flags: [flags.CORS_ALLOWED],
    async scrape(ctx): Promise<EmbedOutput> {
      let parsed: { episodeId: string; category?: string };
      try {
        parsed = JSON.parse(ctx.url);
      } catch {
        throw new Error(`Consumet embed received invalid URL format: ${ctx.url}`);
      }
      const { episodeId, category } = parsed;

      const watchData = await ctx.fetcher<ConsumetWatchResponse>('/anime/zoro/watch', {
        baseUrl,
        query: {
          episodeId,
          server,
          category: category ?? 'sub',
        },
      });

      const source = watchData.sources?.[0];
      if (!source) throw new Error('No source found');

      const captions: Caption[] = [];
      for (const subtitle of watchData.subtitles ?? []) {
        const type = getCaptionTypeFromUrl(subtitle.url);
        if (!type) continue;
        const language = labelToLanguageCode(subtitle.lang) ?? subtitle.lang;
        if (!language) continue;
        captions.push({
          id: subtitle.url,
          url: subtitle.url,
          type,
          language,
          hasCorsRestrictions: false,
        });
      }

      return {
        stream: [
          {
            id: 'primary',
            type: 'hls',
            playlist: source.url,
            flags: [flags.CORS_ALLOWED],
            captions,
            headers: watchData.headers,
          },
        ],
      };
    },
  });
}

export const ConsumetEmbeds = [
  makeConsumetEmbed('vidcloud', 200),
  makeConsumetEmbed('streamsb', 191),
  makeConsumetEmbed('vidstreaming', 185),
  makeConsumetEmbed('streamtape', 181),
];
