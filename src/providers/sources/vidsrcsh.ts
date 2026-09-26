import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';
import { createM3U8ProxyUrl } from '@/utils/proxy';

/**
 * vidsrc.sh — universal source.
 *
 * Serves direct HLS streams for any movie / show / anime episode by IMDb id.
 * Pipeline (reversed from their player):
 *   1. GET data.vidsrc.sh/api.php?type=<movie|tv>&imdb=<id>[&season=S&episode=E]&stream_urls
 *      -> JSON; data.stream_urls is a base64 ChaCha20 nonce||ciphertext string.
 *      The response also carries vs: { w, wasm_url } — a per-5-minute-window
 *      WebAssembly ChaCha20 decryptor.
 *   2. Instantiate the WASM (exports: alloc(len) -> ptr, decrypt(ptr, len) -> outLen,
 *      memory), copy the ciphertext in, call decrypt, read plaintext at ptr+12.
 *      Plaintext is newline-separated master.m3u8 URLs (rotating mirror hosts).
 *   3. Each mirror host issues a short-lived IP-bound JWT via GET <host>/generate.php.
 *      Append ?token=<jwt> to the master URL. Tokens cover the whole playlist chain.
 *
 * All endpoints are CORS-open (access-control-allow-origin: *), so this source
 * runs fully client-side without a proxy.
 */

const API_BASE = 'https://data.vidsrc.sh/api.php';

interface VsApiResponse {
  status_code: string;
  data: {
    title: string;
    imdb_id: string;
    stream_urls?: string | string[];
  };
  vs?: {
    w: number;
    wasm_url?: string;
    wasm?: string;
  };
}

function base64ToBytes(b64: string): Uint8Array {
  const bin =
    typeof atob === 'function'
      ? atob(b64)
      : Buffer.from(b64, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

async function decryptStreamUrls(
  wasmUrl: string,
  wasmB64: string | undefined,
  encrypted: string,
): Promise<string[]> {
  let bytes: ArrayBuffer;
  if (wasmUrl) {
    const res = await fetch(wasmUrl, { credentials: 'omit' } as RequestInit);
    if (!res.ok) throw new NotFoundError(`wasm fetch failed: ${res.status}`);
    bytes = await res.arrayBuffer();
  } else if (wasmB64) {
    bytes = base64ToBytes(wasmB64).buffer as ArrayBuffer;
  } else {
    throw new NotFoundError('no wasm decryptor provided');
  }

  const mod = await WebAssembly.compile(new Uint8Array(bytes));
  const inst = await WebAssembly.instantiate(mod, {});
  const ex = inst.exports as unknown as {
    alloc(len: number): number;
    decrypt(ptr: number, len: number): number;
    memory: WebAssembly.Memory;
  };

  const enc = base64ToBytes(encrypted);
  const ptr = ex.alloc(enc.length);
  new Uint8Array(ex.memory.buffer, ptr, enc.length).set(enc);
  const outLen = ex.decrypt(ptr, enc.length);
  const plain = new TextDecoder().decode(
    new Uint8Array(ex.memory.buffer, ptr + 12, outLen),
  );
  return plain
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function fetchHostToken(host: string): Promise<string> {
  // mirrors occasionally rate-limit generate.php (429); retry with backoff
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(`${host}/generate.php`, { credentials: 'omit' } as RequestInit);
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
        continue;
      }
      if (!res.ok) return '';
      let token = (await res.text()).trim();
      if (token.startsWith('{') || token.startsWith('[')) {
        try {
          const j = JSON.parse(token);
          if (typeof j === 'string') token = j;
          else if (j && typeof j === 'object')
            token = j.token || j.data || j.string || j.result || '';
        } catch {
          /* keep raw */
        }
      }
      return token && !token.startsWith('<') ? token : '';
    } catch {
      return '';
    }
  }
  return '';
}

function applyToken(url: string, token: string): string {
  if (!token) return url;
  if (url.includes('__TOKEN__')) return url.split('__TOKEN__').join(token);
  return `${url}${url.includes('?') ? '&' : '?'}token=${token}`;
}

async function comboScraper(ctx: MovieScrapeContext | ShowScrapeContext): Promise<SourcererOutput> {
  const isShow = ctx.media.type === 'show';
  const imdbId = ctx.media.imdbId;
  if (!imdbId) throw new NotFoundError('IMDb id required for vidsrc.sh');

  const params: Record<string, string> = {
    type: isShow ? 'tv' : 'movie',
    imdb: imdbId,
    stream_urls: '',
  };
  if (isShow) {
    params.season = String(ctx.media.season.number);
    params.episode = String(ctx.media.episode.number);
  }

  ctx.progress(30);
  const api = await ctx.fetcher<VsApiResponse>(API_BASE, {
    query: params,
    headers: { accept: 'application/json' },
  });
  if (!api?.data) throw new NotFoundError('vidsrc.sh returned no data');

  ctx.progress(55);
  let urls: string[];
  const su = api.data.stream_urls;
  if (Array.isArray(su)) {
    urls = su.filter(Boolean);
  } else if (typeof su === 'string' && su.length > 0) {
    if (!api.vs) throw new NotFoundError('encrypted stream_urls without decryptor');
    urls = await decryptStreamUrls(api.vs.wasm_url, api.vs.wasm, su);
  } else {
    throw new NotFoundError('no stream urls returned');
  }
  if (urls.length === 0) throw new NotFoundError('no mirrors available');

  ctx.progress(80);
  // resolve an IP-bound token; walk all mirrors until one issues a token
  let playable: { url: string; host: string } | undefined;
  for (const raw of urls) {
    let host = '';
    try {
      host = new URL(raw).origin;
    } catch {
      continue;
    }
    const token = await fetchHostToken(host);
    if (token) {
      playable = { url: applyToken(raw, token), host };
      break;
    }
  }
  // if no host would issue a token, fall back to the first mirror raw
  if (!playable) {
    playable = { url: urls[0], host: '' };
  }

  ctx.progress(95);
  // IMPORTANT: no Referer/Origin headers — the mirror hosts 403 any request
  // carrying them on segments; the IP-bound token is the only auth needed.
  // Segments also reject browser-origin requests, so route the playlist
  // through the app's m3u8 proxy (createM3U8ProxyUrl returns the original
  // URL on targets with a local proxy: extension/native)
  return {
    embeds: [],
    stream: [
      {
        id: 'vidsrcsh',
        type: 'hls',
        flags: [flags.CORS_ALLOWED],
        playlist: createM3U8ProxyUrl(playable.url, ctx.features, {}),
        captions: [],
        headers: {},
      },
    ],
  };
}

export const vidsrcshScraper = makeSourcerer({
  id: 'vidsrcsh',
  name: 'VidSrc',
  rank: 50,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: comboScraper,
  scrapeShow: comboScraper,
});
