import { NextRequest, NextResponse } from "next/server";
import {
  ProviderError,
  fetchTrack,
  parseTarget,
  resolveShortLink,
} from "@/lib/spotify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function fail(error: string, status: number) {
  return NextResponse.json(
    { ok: false, error },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("url")?.trim();

  if (!raw) {
    return fail("Masukkan tautan lagu Spotify terlebih dahulu.", 400);
  }

  const target = parseTarget(raw);

  if (!target.ok) {
    if (target.reason === "album") {
      return fail(
        "Tautan album belum didukung. Tempel tautan satu lagu (track).",
        400
      );
    }

    if (target.reason === "playlist") {
      return fail(
        "Tautan playlist belum didukung. Tempel tautan satu lagu (track).",
        400
      );
    }

    return fail(
      "Tautan Spotify tidak valid. Gunakan tautan lagu, contoh: open.spotify.com/track/...",
      400
    );
  }

  try {
    const id = target.id ?? (await resolveShortLink(target.shortUrl ?? ""));

    if (!id) {
      return fail(
        "Tautan pendek tidak bisa dibaca. Buka tautannya di Spotify lalu salin tautan lagu lengkap.",
        400
      );
    }

    const data = await fetchTrack(id);

    return NextResponse.json(
      { ok: true, data },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof ProviderError) {
      return fail(error.message, error.status);
    }

    return fail(
      error instanceof Error ? error.message : "Gagal memproses lagu.",
      500
    );
  }
}
