import { NextRequest } from "next/server";

import { padelService } from "@/src/backend/padel-service";
import { normalizePublicId } from "@/src/lib/public-id";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const { publicId: rawPublicId } = await params;
  const publicId = normalizePublicId(rawPublicId);
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  const ping = setInterval(() => {
    writer.write(encoder.encode(`event: ping\ndata: ${Date.now()}\n\n`)).catch(() => {
      clearInterval(ping);
    });
  }, 25000);

  const sendUpdate = () => {
    writer.write(encoder.encode(`event: update\ndata: ${Date.now()}\n\n`)).catch(() => {
      clearInterval(ping);
    });
  };

  const unsubscribe = padelService.subscribeToMatch(publicId, sendUpdate);

  request.signal.addEventListener("abort", () => {
    clearInterval(ping);
    unsubscribe();
    writer.close().catch(() => {});
  });

  await writer.write(encoder.encode("event: ready\ndata: ok\n\n"));

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
