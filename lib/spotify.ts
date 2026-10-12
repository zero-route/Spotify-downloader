import { proxyPath, signUrl } from "@/lib/sign";

const MAX_DURATION_GAP_SECONDS = 6;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

type Json = Record<string, unknown>;

export type Target =
  | { ok: true; id: string | null; shortUrl: string | null }
  | { ok: false; reason: "invalid" | "album" | "playlist" | "unsupported" };

export type TrackData = {
  id: string;
  title: string;
  artist: string | null;
  album: string | null;
  albumType: string | null;
  releaseDate: string | null;
  popularity: number | null;
  durationMs: number | null;
  explicit: boolean;
  isrc: string | null;
  cover: string | null;
  coverDirect: string | null;
  audio: string;
  spotifyUrl: string;
  audioInfo: {
    seconds: number | null;
    size: string | null;
    format: string | null;
    bitrate: number | null;
  };
  durationMismatch: { audio: number; expected: number } | null;
  convert: { payload: string; token: string };
};

export class ProviderError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function obj(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : null;
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (
    typeof value === "string" &&
    value.trim() &&
    Number.isFinite(Number(value))
  ) {
    return Number(value);
  }

  return null;
}

export function parseTarget(raw: string): Target {
  const value = raw.trim();

  if (!value) return { ok: false, reason: "invalid" };

  const uri = value.match(
    /^spotify:(track|album|playlist|artist|episode|show):([A-Za-z0-9]{22})$/i
  );

  if (uri) {
    return classify(uri[1].toLowerCase(), uri[2]);
  }

  if (/^[A-Za-z0-9]{22}$/.test(value)) {
    return { ok: true, id: value, shortUrl: null };
  }

  let parsed: URL;

  try {
    parsed = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return { ok: false, reason: "invalid" };
  }

  const host = parsed.hostname.toLowerCase();

  if (host === "spotify.link" || host === "spotify.app.link") {
    return { ok: true, id: null, shortUrl: parsed.toString() };
  }

  if (host !== "open.spotify.com") return { ok: false, reason: "invalid" };

  const parts = parsed.pathname
    .split("/")
    .filter(Boolean)
    .filter((part) => !/^intl-[a-z-]+$/i.test(part) && part !== "embed");

  const type = (parts[0] ?? "").toLowerCase();
  const id = parts[1] ?? "";

  if (!/^[A-Za-z0-9]{22}$/.test(id)) return { ok: false, reason: "invalid" };

  return classify(type, id);
}

function classify(type: string, id: string): Target {
  if (type === "track") return { ok: true, id, shortUrl: null };
  if (type === "album") return { ok: false, reason: "album" };
  if (type === "playlist") return { ok: false, reason: "playlist" };

  return { ok: false, reason: "unsupported" };
}

export async function resolveShortLink(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      cache: "no-store",
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });

    const fromUrl = response.url.match(/track\/([A-Za-z0-9]{22})/);

    if (fromUrl) return fromUrl[1];

    const html = await response.text();
    const fromHtml = html.match(
      /open\.spotify\.com\/(?:intl-[a-z-]+\/)?track\/([A-Za-z0-9]{22})/
    );

    return fromHtml ? fromHtml[1] : null;
  } catch {
    return null;
  }
}

type Fetched = {
  json: Json | null;
  status: number | null;
};

function getHost() {
  return process.env.RAPIDAPI_HOST?.trim() || "spotify81.p.rapidapi.com";
}

async function callEndpoint(
  path: string,
  params: Record<string, string>,
  isValid: (body: Json) => boolean,
  timeoutMs: number,
  maxAttempts: number
): Promise<Fetched> {
  const key = process.env.RAPIDAPI_KEY;

  if (!key) {
    throw new ProviderError(
      "RAPIDAPI_KEY belum dikonfigurasi di environment Vercel.",
      500
    );
  }

  const host = getHost();
  const endpoint = `https://${host}${path}?${new URLSearchParams(params).toString()}`;

  let status: number | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: "GET",
        cache: "no-store",
        headers: {
          "X-Rapidapi-Key": key,
          "X-Rapidapi-Host": host,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      status = response.status;

      const body = obj(await response.json().catch(() => null));
      const valid = response.ok && body !== null && isValid(body);

      console.log(
        `[spotify] ${path} attempt=${attempt} http=${response.status} valid=${valid}${
          !valid && body && str(body.reason)
            ? ` reason=${String(body.reason).slice(0, 120)}`
            : ""
        }`
      );

      if (valid && body) {
        return { json: body, status };
      }

      if ([400, 401, 403, 404, 422].includes(response.status)) {
        break;
      }
    } catch (error) {
      status = null;

      console.log(
        `[spotify] ${path} attempt=${attempt} error=${
          error instanceof Error ? error.message : "unknown"
        }`
      );
    }

    if (attempt < maxAttempts) {
      await sleep(600 * attempt);
    }
  }

  return { json: null, status };
}

function firstTrack(body: Json): Json | null {
  return obj(arr(body.tracks)[0]);
}

function isValidMeta(body: Json) {
  const track = firstTrack(body);

  return track !== null && str(track.name) !== null;
}

function isValidAudio(body: Json) {
  if (body.status === false) return false;

  return str(body.url) !== null;
}

function bestCover(album: Json | null): string | null {
  let best: string | null = null;
  let width = -1;

  for (const entry of arr(album?.images)) {
    const image = obj(entry);
    const url = str(image?.url);

    if (!url) continue;

    const size = num(image?.width) ?? 0;

    if (size > width) {
      width = size;
      best = url;
    }
  }

  return best;
}

export async function fetchTrack(id: string): Promise<TrackData> {
  const [metaResult, audioResult] = await Promise.all([
    callEndpoint("/tracks", { ids: id }, isValidMeta, 14000, 3),
    callEndpoint(
      "/download_track",
      {
        q: id,
        onlyLinks: "true",
        bypassSpotify: "false",
        downloadFullVideo: "false",
        extraUrls: "false",
      },
      isValidAudio,
      24000,
      2
    ),
  ]);

  if (!metaResult.json || !audioResult.json) {
    const statuses = [metaResult.status, audioResult.status];

    if (statuses.some((status) => status === 401 || status === 403)) {
      throw new ProviderError(
        "Akses ke penyedia API ditolak. Periksa RAPIDAPI_KEY, RAPIDAPI_HOST, dan langganan endpoint Tracks serta Download Track.",
        502
      );
    }

    if (statuses.some((status) => status === 429)) {
      throw new ProviderError(
        "Kuota API sedang habis atau terlalu banyak permintaan. Coba lagi beberapa saat.",
        429
      );
    }

    if (!metaResult.json) {
      throw new ProviderError(
        "Info lagu tidak ditemukan. Pastikan tautan lagu Spotify benar.",
        404
      );
    }

    throw new ProviderError(
      "Audio lagu belum tersedia saat ini. Coba lagi beberapa saat.",
      502
    );
  }

  const track = firstTrack(metaResult.json) as Json;
  const album = obj(track.album);
  const audio = audioResult.json;

  const title = str(track.name) ?? "Lagu Tanpa Judul";

  const artistNames = arr(track.artists)
    .map((entry) => str(obj(entry)?.name))
    .filter((name): name is string => name !== null);

  const artist = artistNames.length > 0 ? artistNames.join(", ") : null;
  const albumName = str(album?.name);
  const releaseDate = str(album?.release_date);
  const coverUrl = bestCover(album);
  const audioUrl = str(audio.url) as string;
  const durationMs = num(track.duration_ms);
  const audioSeconds = num(audio.duration);

  const mismatch =
    durationMs !== null &&
    audioSeconds !== null &&
    Math.abs(audioSeconds - durationMs / 1000) > MAX_DURATION_GAP_SECONDS
      ? {
          audio: Math.round(audioSeconds),
          expected: Math.round(durationMs / 1000),
        }
      : null;

  const bitrate = num(audio.bitrate);

  const payload = JSON.stringify({
    a: audioUrl,
    c: coverUrl,
    t: title,
    r: artist,
    l: albumName,
    y: releaseDate ? releaseDate.slice(0, 4) : null,
  });

  return {
    id,
    title,
    artist,
    album: albumName,
    albumType: str(album?.album_type),
    releaseDate,
    popularity: num(track.popularity),
    durationMs,
    explicit: track.explicit === true,
    isrc: str(obj(track.external_ids)?.isrc),
    cover: coverUrl ? proxyPath(coverUrl) : null,
    coverDirect: coverUrl,
    audio: proxyPath(audioUrl),
    spotifyUrl:
      str(obj(track.external_urls)?.spotify) ??
      `https://open.spotify.com/track/${id}`,
    audioInfo: {
      seconds: audioSeconds,
      size: str(audio.size),
      format: str(audio.format),
      bitrate: bitrate !== null ? Math.round(bitrate / 1000) : null,
    },
    durationMismatch: mismatch,
    convert: { payload, token: signUrl(payload) },
  };
}
