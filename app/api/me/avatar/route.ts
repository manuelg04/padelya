import { NextRequest } from "next/server";

import { readBearerToken, responseError, responseOk } from "@/src/backend/http";
import { padelService } from "@/src/backend/padel-service";
import { DomainError } from "@/src/domain/errors";

function parseStorageId(body: unknown): string {
  if (!body || typeof body !== "object") {
    throw new DomainError("VALIDATION_ERROR", "storageId inválido");
  }

  const storageId = "storageId" in body ? body.storageId : null;
  if (typeof storageId !== "string" || storageId.trim().length === 0) {
    throw new DomainError("VALIDATION_ERROR", "storageId inválido");
  }

  return storageId.trim();
}

export async function PUT(request: NextRequest) {
  try {
    const idToken = readBearerToken(request);
    if (!idToken) {
      throw new DomainError("UNAUTHORIZED", "No autorizado");
    }

    const body = (await request.json()) as unknown;
    const storageId = parseStorageId(body);

    const user = await padelService.setAvatar(idToken, storageId);
    return responseOk({ user });
  } catch (error) {
    return responseError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const idToken = readBearerToken(request);
    if (!idToken) {
      throw new DomainError("UNAUTHORIZED", "No autorizado");
    }

    const user = await padelService.removeAvatar(idToken);
    return responseOk({ user });
  } catch (error) {
    return responseError(error);
  }
}
