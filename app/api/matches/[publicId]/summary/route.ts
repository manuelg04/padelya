import { NextRequest } from "next/server";

import { resolveAuthToken, responseError, responseOk } from "@/src/backend/http";
import { padelService } from "@/src/backend/padel-service";
import { normalizePublicId } from "@/src/lib/public-id";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ publicId: string }> },
) {
  try {
    const token = (await resolveAuthToken(request)) ?? undefined;
    const { publicId: rawPublicId } = await params;
    const publicId = normalizePublicId(rawPublicId);
    const summary = await padelService.getWhatsAppSummary(publicId, token);
    return responseOk({ summary });
  } catch (error) {
    return responseError(error);
  }
}
