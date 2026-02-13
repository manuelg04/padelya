import { NextRequest } from "next/server";

import { resolveAuthToken, responseError, responseOk } from "@/src/backend/http";
import { padelService } from "@/src/backend/padel-service";
import { normalizePublicId } from "@/src/lib/public-id";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ publicId: string }> },
) {
  try {
    const token = await resolveAuthToken(request);
    if (!token) {
      throw new Error("No autorizado");
    }
    const { publicId: rawPublicId } = await params;
    const publicId = normalizePublicId(rawPublicId);
    const match = await padelService.join(publicId, token);
    return responseOk({ match });
  } catch (error) {
    return responseError(error);
  }
}
