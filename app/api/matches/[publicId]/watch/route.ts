import { NextRequest } from "next/server";

import { resolveAuthToken, responseError, responseOk } from "@/src/backend/http";
import { padelService } from "@/src/backend/padel-service";
import { DomainError } from "@/src/domain/errors";
import { normalizePublicId } from "@/src/lib/public-id";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ publicId: string }> },
) {
  try {
    const token = await resolveAuthToken(request);
    if (!token) {
      throw new DomainError("UNAUTHORIZED", "No autorizado.");
    }

    const { publicId: rawPublicId } = await params;
    const publicId = normalizePublicId(rawPublicId);
    const match = await padelService.followMatchWatch(publicId, token);
    return responseOk({ match });
  } catch (error) {
    return responseError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ publicId: string }> },
) {
  try {
    const token = await resolveAuthToken(request);
    if (!token) {
      throw new DomainError("UNAUTHORIZED", "No autorizado.");
    }

    const { publicId: rawPublicId } = await params;
    const publicId = normalizePublicId(rawPublicId);
    const match = await padelService.unfollowMatchWatch(publicId, token);
    return responseOk({ match });
  } catch (error) {
    return responseError(error);
  }
}
