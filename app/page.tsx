"use client";

import { useEffect, useRef, useState } from "react";

const alertSpacing: React.CSSProperties = { margin: "8px auto 0" };

type TrackData = {
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

type ApiResponse = {
  ok?: boolean;
  data?: TrackData;
  error?: string;
};

function cleanFileName(value: string) {
  const cleaned = value
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 150);

  return cleaned || "TuneSave";
}

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";

  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatRelease(value: string | null) {
  if (!value) return null;

  const parts = value.split("-").map(Number);

  if (parts.length === 1) return String(parts[0]);

  const date = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);

  return date.toLocaleDateString(
    "id-ID",
    parts.length === 2
      ? { month: "short", year: "numeric" }
      : { day: "numeric", month: "short", year: "numeric" }
  );
}

function Icon({
  children,
  size = 20,
}: {
  children: React.ReactNode;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function LinkIcon() {
  return (
    <Icon size={22}>
      <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
      <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />
    </Icon>
  );
}

function DownloadIcon({ size = 22 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M12 3v12" />
      <path d="m7 11 5 5 5-5" />
      <path d="M4 20h16" />
    </Icon>
  );
}

function ExternalIcon() {
  return (
    <Icon size={18}>
      <path d="M18 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" />
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
    </Icon>
  );
}

function ClockIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Icon>
  );
}

function TrendIcon() {
  return (
    <Icon>
      <path d="m3 17 6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </Icon>
  );
}

function CalendarIcon() {
  return (
    <Icon>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
    </Icon>
  );
}

function MusicIcon({ size = 64 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

function PlayGlyph({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 5.5v13a1 1 0 0 0 1.5.9L20 12.9a1 1 0 0 0 0-1.8L9.5 4.6A1 1 0 0 0 8 5.5Z" />
    </svg>
  );
}

function PauseGlyph({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="6" y="5" width="4.5" height="14" rx="1.2" />
      <rect x="13.5" y="5" width="4.5" height="14" rx="1.2" />
    </svg>
  );
}

type SmartImageProps = Omit<
  React.ImgHTMLAttributes<HTMLImageElement>,
  "src"
> & {
  direct?: string | null;
  proxy: string;
  onFail?: () => void;
  onEarlyFail?: () => void;
};

function SmartImage({
  direct,
  proxy,
  onFail,
  onEarlyFail,
  ...rest
}: SmartImageProps) {
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setAttempt(0);
  }, [direct, proxy]);

  const separator = proxy.includes("?") ? "&" : "?";

  const src =
    direct && attempt === 0
      ? direct
      : attempt <= 1
        ? proxy
        : `${proxy}${separator}_retry=${attempt}`;

  function handleError() {
    if (attempt === 1) {
      onEarlyFail?.();
    }

    if (attempt >= 6) {
      onFail?.();
      return;
    }

    const delay = attempt === 0 ? 0 : 700 * attempt;

    setTimeout(() => setAttempt((value) => value + 1), delay);
  }

  return (
    <img
      {...rest}
      src={src}
      referrerPolicy="no-referrer"
      onError={handleError}
    />
  );
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<TrackData | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioError, setAudioError] = useState("");
  const [converting, setConverting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [mp3Error, setMp3Error] = useState("");
  const [mp3File, setMp3File] = useState<{
    url: string;
    name: string;
    cover: boolean;
  } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const submittedUrl = useRef("");
  const refreshed = useRef(false);

  async function refreshOnce() {
    if (refreshed.current || !submittedUrl.current) return;

    refreshed.current = true;

    try {
      const response = await fetch(
        `/api/spotify?url=${encodeURIComponent(submittedUrl.current)}`,
        { cache: "no-store" }
      );

      const result = (await response
        .json()
        .catch(() => null)) as ApiResponse | null;

      const fresh = result?.data;

      if (response.ok && result?.ok && fresh) {
        setData((previous) =>
          previous && previous.id === fresh.id
            ? { ...previous, cover: fresh.cover, coverDirect: fresh.coverDirect }
            : previous
        );
      }
    } catch {
      return;
    }
  }

  useEffect(() => {
    if (!data?.coverDirect) return;

    const image = new Image();

    image.referrerPolicy = "no-referrer";
    image.src = data.coverDirect;
  }, [data]);

  useEffect(() => {
    if (!converting) return;

    setElapsed(0);

    const timer = setInterval(() => {
      setElapsed((value) => value + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [converting]);

  useEffect(() => {
    return () => {
      if (mp3File) URL.revokeObjectURL(mp3File.url);
    };
  }, [mp3File]);

  function resetPlayer() {
    audioRef.current?.pause();
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
    setAudioError("");
    setMp3Error("");
    setMp3File(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const value = url.trim();

    if (!value) {
      setError("Masukkan tautan lagu Spotify terlebih dahulu.");
      return;
    }

    submittedUrl.current = value;
    refreshed.current = false;

    setLoading(true);
    setError("");
    setData(null);
    resetPlayer();

    try {
      const response = await fetch(
        `/api/spotify?url=${encodeURIComponent(value)}`,
        { cache: "no-store" }
      );

      const result = (await response
        .json()
        .catch(() => null)) as ApiResponse | null;

      if (!response.ok || !result?.ok || !result.data) {
        throw new Error(
          result?.error || "Gagal memproses lagu. Pastikan link masih aktif."
        );
      }

      setData(result.data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Gagal memproses lagu Spotify."
      );
    } finally {
      setLoading(false);
    }
  }

  function handleClear() {
    submittedUrl.current = "";
    setUrl("");
    setError("");
    setData(null);
    resetPlayer();
  }

  async function togglePlay() {
    const audio = audioRef.current;

    if (!audio) return;

    setAudioError("");

    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        setPlaying(false);
        setAudioError("Audio belum bisa diputar. Coba lagi atau langsung unduh MP3-nya.");
      }
    } else {
      audio.pause();
    }
  }

  function seek(event: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;

    if (!audio) return;

    const value = Number(event.target.value);

    audio.currentTime = value;
    setCurrent(value);
  }

  async function downloadMp3() {
    if (!data || converting) return;

    setConverting(true);
    setMp3Error("");
    setMp3File(null);

    try {
      const response = await fetch("/api/mp3", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data.convert),
      });

      if (!response.ok) {
        const raw = await response.text().catch(() => "");
        let message = "";

        try {
          message = (JSON.parse(raw) as { error?: string }).error || "";
        } catch {
          message = "";
        }

        if (!message) {
          message =
            response.status === 413
              ? "Hasil MP3 terlalu besar untuk dikirim server."
              : response.status === 504 || response.status === 408
                ? "Proses pembuatan MP3 melewati batas waktu server."
                : `Server mengembalikan kesalahan (HTTP ${response.status}).`;
        }

        throw new Error(message);
      }

      const cover = response.headers.get("X-Cover-Embedded") === "1";
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const fileName = `${cleanFileName(data.title)}.mp3`;
      const link = document.createElement("a");

      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();

      setMp3File({ url: objectUrl, name: fileName, cover });
    } catch (err) {
      setMp3Error(
        err instanceof Error ? err.message : "Gagal membuat file MP3."
      );
    } finally {
      setConverting(false);
    }
  }

  const statList = data
    ? [
        data.durationMs !== null
          ? {
              key: "duration",
              name: "Durasi",
              value: formatTime(data.durationMs / 1000),
              icon: <ClockIcon />,
            }
          : null,
        data.popularity !== null
          ? {
              key: "popularity",
              name: "Popularitas",
              value: String(data.popularity),
              icon: <TrendIcon />,
            }
          : null,
        formatRelease(data.releaseDate)
          ? {
              key: "release",
              name: "Rilis",
              value: formatRelease(data.releaseDate) as string,
              icon: <CalendarIcon />,
            }
          : null,
      ].filter((item): item is NonNullable<typeof item> => item !== null)
    : [];

  const chips = data
    ? [
        data.albumType
          ? data.albumType.charAt(0).toUpperCase() + data.albumType.slice(1)
          : null,
        data.explicit ? "Explicit" : null,
        data.isrc ? `ISRC ${data.isrc}` : null,
      ].filter((item): item is string => item !== null)
    : [];

  const progress = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;

  return (
    <main className="page">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="TuneSave beranda">
          TuneSave
        </a>
        <span className="brand-note">Spotify Downloader</span>
      </header>

      <section className="hero" id="top">
        <h1 className="hero-title">Unduh musik Spotify</h1>
        <p className="tagline">Jadi MP3 lengkap dengan cover, dengan mudah.</p>
      </section>

      <form className="search" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field-icon">
            <LinkIcon />
          </span>

          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="Tempel URL lagu Spotify..."
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            inputMode="url"
          />

          {url && (
            <button
              type="button"
              className="field-clear"
              onClick={handleClear}
              aria-label="Hapus URL"
            >
              ×
            </button>
          )}
        </label>

        <button
          type="submit"
          className="btn btn-primary btn-search"
          disabled={loading}
        >
          {loading ? (
            <span className="spinner" aria-hidden="true" />
          ) : (
            <DownloadIcon size={20} />
          )}
          <span>{loading ? "Memproses" : "Unduh"}</span>
        </button>
      </form>

      {error && (
        <div className="alert" role="alert">
          <span className="alert-icon">!</span>
          <div>
            <strong>Gagal memproses lagu</strong>
            <p>{error}</p>
          </div>
        </div>
      )}

      {loading && (
        <section className="card" aria-busy="true">
          <div className="stage stage-square skeleton" />
          <div className="skeleton skeleton-btn" />
        </section>
      )}

      {data && !loading && (
        <>
          <section className="card">
            <div className="stage stage-square">
              {data.cover ? (
                <SmartImage
                  key={data.coverDirect ?? data.cover}
                  className="cover-img"
                  direct={data.coverDirect}
                  proxy={data.cover}
                  alt={`Cover ${data.title}`}
                  draggable={false}
                  onEarlyFail={refreshOnce}
                />
              ) : (
                <span className="cover-empty">
                  <MusicIcon />
                </span>
              )}
            </div>

            <audio
              ref={audioRef}
              src={data.audio}
              preload="metadata"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => {
                setPlaying(false);
                setCurrent(0);
              }}
              onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
              onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
              onDurationChange={(event) => setDuration(event.currentTarget.duration)}
              onError={() =>
                setAudioError(
                  "Audio tidak bisa diputar di browser ini. Kamu tetap bisa mengunduh MP3-nya."
                )
              }
            />

            <div className="player-row">
              <button
                type="button"
                className="pp"
                onClick={togglePlay}
                aria-label={playing ? "Jeda" : "Putar"}
              >
                {playing ? <PauseGlyph /> : <PlayGlyph size={22} />}
              </button>

              <span className="time">{formatTime(current)}</span>

              <input
                className="seek"
                type="range"
                min={0}
                max={duration > 0 ? duration : 0}
                step={0.1}
                value={Math.min(current, duration > 0 ? duration : 0)}
                onChange={seek}
                style={{ "--p": `${progress}%` } as React.CSSProperties}
                aria-label="Posisi lagu"
                disabled={duration <= 0}
              />

              <span className="time">{formatTime(duration)}</span>
            </div>

            {data.durationMismatch && (
              <div className="alert" role="status" style={alertSpacing}>
                <span className="alert-icon">i</span>
                <div>
                  <strong>Durasi audio berbeda dari lagu aslinya</strong>
                  <p>
                    Audio berdurasi {formatTime(data.durationMismatch.audio)},
                    sedangkan lagu di Spotify {formatTime(data.durationMismatch.expected)}.
                    Kemungkinan ini versi lain dari lagu yang sama.
                  </p>
                </div>
              </div>
            )}

            {audioError && (
              <div className="alert" role="alert" style={alertSpacing}>
                <span className="alert-icon">!</span>
                <div>
                  <strong>Pemutaran gagal</strong>
                  <p>{audioError}</p>
                </div>
              </div>
            )}

            <div className="actions">
              <button
                type="button"
                className="btn btn-primary btn-block"
                onClick={downloadMp3}
                disabled={converting}
              >
                {converting ? (
                  <span className="spinner" aria-hidden="true" />
                ) : (
                  <DownloadIcon />
                )}
                <span>
                  {converting
                    ? `Menyiapkan MP3... (${elapsed} dtk)`
                    : "Download MP3"}
                </span>
              </button>
            </div>

            {converting && (
              <div className="alert" role="status" style={alertSpacing}>
                <span className="alert-icon">i</span>
                <div>
                  <strong>Sedang menyiapkan file MP3</strong>
                  <p>
                    Mengambil audio lalu menyematkan cover dan info lagu,
                    biasanya 5–20 detik. Jangan tutup atau keluar dari halaman
                    ini. File akan terunduh otomatis setelah selesai.
                  </p>
                </div>
              </div>
            )}

            {mp3File && !converting && (
              <div className="alert" role="status" style={alertSpacing}>
                <span className="alert-icon">✓</span>
                <div>
                  <strong>MP3 berhasil dibuat</strong>
                  <p>
                    {mp3File.cover
                      ? "Cover dan info lagu sudah tertanam di dalam file. "
                      : "Info lagu tertanam, tetapi cover gagal disematkan kali ini. "}
                    File sudah diunduh dan tersimpan di folder unduhan
                    perangkatmu. Kalau belum muncul, unduh ulang lewat tombol
                    di bawah.
                  </p>
                  <a
                    className="btn btn-outline"
                    style={{ marginTop: 14 }}
                    href={mp3File.url}
                    download={mp3File.name}
                  >
                    <DownloadIcon size={18} />
                    <span>Unduh Ulang</span>
                  </a>
                </div>
              </div>
            )}

            {mp3Error && (
              <div className="alert" role="alert" style={alertSpacing}>
                <span className="alert-icon">!</span>
                <div>
                  <strong>Gagal membuat MP3</strong>
                  <p>{mp3Error}</p>
                </div>
              </div>
            )}
          </section>

          <section className="card info">
            <div className="track">
              <div className="track-text">
                <strong className="track-title">{data.title}</strong>
                {data.artist && (
                  <span className="track-artist">{data.artist}</span>
                )}
                {data.album && (
                  <span className="track-album">Album · {data.album}</span>
                )}
              </div>

              <a
                className="btn btn-outline"
                href={data.spotifyUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalIcon />
                <span>Buka di Spotify</span>
              </a>
            </div>

            <div
              className="stats"
              style={{
                gridTemplateColumns: `repeat(${statList.length}, minmax(0, 1fr))`,
              }}
            >
              {statList.map((stat) => (
                <div className="stat" key={stat.key}>
                  <div className="stat-top">
                    {stat.icon}
                    <strong>{stat.value}</strong>
                  </div>
                  <span>{stat.name}</span>
                </div>
              ))}
            </div>

            {chips.length > 0 && (
              <div className="hashtag-list chips">
                {chips.map((chip) => (
                  <span className="hashtag" key={chip}>
                    {chip}
                  </span>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <footer className="footer">
        Gunakan hanya untuk konten yang kamu berhak unduh. Hormati karya kreator.
      </footer>
    </main>
  );
}
