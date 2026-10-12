import { NextRequest, NextResponse } from "next/server";
import { verifyUrl } from "@/lib/sign";
import { renderMp3 } from "@/lib/mp3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function text(value: unknown, max: number) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : null;
}

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as {
      payload?: unknown;
      token?: unknown;
    } | null;

    if (
      !body ||
      typeof body.payload !== "string" ||
      typeof body.token !== "string" ||
      body.payload.length > 8192 ||
      !verifyUrl(body.payload, body.token)
    ) {
      return fail("Data konversi tidak valid. Muat ulang lagu lalu coba lagi.", 403);
    }

    const data = JSON.parse(body.payload) as Record<string, unknown>;
    const audioUrl = text(data.a, 4096);

    if (!audioUrl) {
      return fail("Data konversi tidak valid.", 400);
    }

    const result = await renderMp3({
      audioUrl,
      coverUrl: text(data.c, 4096),
      title: text(data.t, 300) ?? "Lagu",
      artist: text(data.r, 300),
      album: text(data.l, 300),
      year: text(data.y, 10),
    });

    const bytes = new Uint8Array(result.buffer);
    const chunkSize = 256 * 1024;
    let offset = 0;

    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= bytes.length) {
          controller.close();
          return;
        }

        controller.enqueue(bytes.subarray(offset, offset + chunkSize));
        offset += chunkSize;
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(bytes.length),
        "Content-Disposition": 'attachment; filename="tunesave.mp3"',
        "Cache-Control": "no-store",
        "X-Cover-Embedded": result.coverEmbedded ? "1" : "0",
      },
    });
  } catch (error) {
    console.error("[mp3]", error);

    return fail(
      error instanceof Error ? error.message : "Gagal membuat file MP3.",
      500
    );
  }
}
