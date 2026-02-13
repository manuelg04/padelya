import { NextRequest } from "next/server";

import { readBearerToken, responseError, responseOk } from "@/src/backend/http";
import { padelService } from "@/src/backend/padel-service";
import { DomainError } from "@/src/domain/errors";

export async function POST(request: NextRequest) {
  try {
    const idToken = readBearerToken(request);
    if (!idToken) {
      throw new DomainError("UNAUTHORIZED", "No autorizado");
    }

    const uploadUrl = await padelService.generateAvatarUploadUrl(idToken);
    return responseOk({ uploadUrl });
  } catch (error) {
    return responseError(error);
  }
}
