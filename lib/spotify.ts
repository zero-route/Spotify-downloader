import { proxyPath, signUrl } from "@/lib/sign";

const DEFAULT_HOST = "spotify-downloader9.p.rapidapi.com";
const TIMEOUT_MS = 20000;
const MAX_ATTEMPTS = 3;

type Json = Record<string, unknown>;

export type Target =
  | { ok: true; url: string; id: string | null }
  | { ok: false; reason: "invalid" | "album" | "playlist" | "unsupported" };

export type TrackData = {
  id: string | null;
  title: string;
  artist: string | null;
  album: string | null;
  cover: string | null;
  coverDirect: string | null;
  audio: string;
  spotifyUrl: string | null;
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

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function parseTarget(raw: string): Target {
  const value = raw.trim();

  if (!value) return { ok: false, reason: "invalid" };

  const uri = value.match(/^spotify:(track|album|playlist|artist|episode|show):([A-Za-z0-9]{22})$/i);

  if (uri) {
    return classify(uri[1].toLowerCase(), uri[2]);
  }

  let parsed: URL;

  try {
    parsed = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return { ok: false, reason: "invalid" };
  }

  const host = parsed.hostname.toLowerCase();

  if (host === "spotify.link" || host === "spotify.app.link") {
    return { ok: true, url: parsed.toString(), id: null };
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
  if (type === "track") {
    return { ok: true, url: `https://open.spotify.com/track/${id}`, id };
  }

  if (type === "album") return { ok: false, reason: "album" };
  if (type === "playlist") return { ok: false, reason: "playlist" };

  return { ok: false, reason: "unsupported" };
}

type Fetched = {
  json: Json | null;
  status: number | null;
};

function isValid(body: Json) {
  if (body.success === false) return false;

  return str(obj(body.data)?.downloadLink) !== null;
}

async function fetchTrackJson(url: string): Promise<Fetched> {
  const key = process.env.RAPIDAPI_KEY;

  if (!key) {
    throw new ProviderError(
      "RAPIDAPI_KEY belum dikonfigurasi di environment Vercel.",
      500
    );
  }

  const host = process.env.RAPIDAPI_HOST || DEFAULT_HOST;
  const endpoint = `https://${host}/downloadSong?${new URLSearchParams({ songId: url }).toString()}`;

  let status: number | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: "GET",
        cache: "no-store",
        headers: {
          "X-Rapidapi-Key": key,
          "X-Rapidapi-Host": host,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      status = response.status;

      const body = obj(await response.json().catch(() => null));
      const valid = response.ok && body !== null && isValid(body);

      console.log(
        `[spotify] attempt=${attempt} http=${response.status} valid=${valid}`
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
        `[spotify] attempt=${attempt} error=${
          error instanceof Error ? error.message : "unknown"
        }`
      );
    }

    if (attempt < MAX_ATTEMPTS) {
      await sleep(700 * attempt);
    }
  }

  return { json: null, status };
}

export async function fetchTrack(
  target: Extract<Target, { ok: true }>
): Promise<TrackData> {
  const { json, status } = await fetchTrackJson(target.url);

  if (!json) {
    if (status === 401 || status === 403) {
      throw new ProviderError(
        "Akses ke penyedia API ditolak. Periksa RAPIDAPI_KEY dan pastikan sudah berlangganan endpoint Spotify Downloader.",
        502
      );
    }

    if (status === 429) {
      throw new ProviderError(
        "Kuota API sedang habis atau terlalu banyak permintaan. Coba lagi beberapa saat.",
        429
      );
    }

    throw new ProviderError(
      "Lagu tidak ditemukan atau belum bisa diunduh. Pastikan tautan lagu Spotify benar.",
      404
    );
  }

  const data = obj(json.data) ?? {};
  const audioUrl = str(data.downloadLink) as string;
  const coverUrl = str(data.cover);
  const title = str(data.title) ?? "Lagu Tanpa Judul";
  const artist = str(data.artist);
  const album = str(data.album);
  const id = str(data.id) ?? target.id;

  const payload = JSON.stringify({
    a: audioUrl,
    c: coverUrl,
    t: title,
    r: artist,
    l: album,
  });

  return {
    id,
    title,
    artist,
    album,
    cover: coverUrl ? proxyPath(coverUrl) : null,
    coverDirect: coverUrl,
    audio: proxyPath(audioUrl),
    spotifyUrl: id ? `https://open.spotify.com/track/${id}` : null,
    convert: { payload, token: signUrl(payload) },
  };
}
