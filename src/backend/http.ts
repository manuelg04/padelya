import { NextRequest, NextResponse } from "next/server";

import { verifyFirebaseIdToken } from "@/src/backend/firebase-auth";
import { DomainError } from "@/src/domain/errors";
import { USE_MOCK_BACKEND } from "@/src/lib/env";

export function readBearerToken(request: NextRequest): string | null {
  const raw = request.headers.get("authorization");
  if (!raw) {
    return null;
  }
  const [kind, token] = raw.split(" ");
  if (kind?.toLowerCase() !== "bearer" || !token) {
    return null;
  }
  return token;
}

export async function resolveAuthToken(request: NextRequest): Promise<string | null> {
  const bearer = readBearerToken(request);
  if (!bearer) {
    return null;
  }

  if (USE_MOCK_BACKEND) {
    return bearer;
  }

  try {
    const identity = await verifyFirebaseIdToken(bearer);
    return `firebase:${identity.uid}:${encodeURIComponent(identity.phoneNumber ?? "")}`;
  } catch {
    throw new DomainError("UNAUTHORIZED", "Token inválido.");
  }
}

export function responseOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function responseError(error: unknown) {
  if (error instanceof DomainError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
        },
      },
      { status: mapDomainCodeToStatus(error.code) },
    );
  }

  if (error instanceof Error) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: error.message,
        },
      },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Error interno del servidor.",
      },
    },
    { status: 500 },
  );
}

function mapDomainCodeToStatus(code: DomainError["code"]): number {
  switch (code) {
    case "UNAUTHORIZED":
      return 401;
    case "NOT_FOUND":
      return 404;
    case "VALIDATION_ERROR":
    case "OTP_INVALID":
    case "OTP_EXPIRED":
    case "MATCH_FULL":
    case "MATCH_CANCELED":
    case "ALREADY_JOINED":
    case "NOT_JOINED":
    case "ALIAS_REQUIRED":
      return 400;
    default:
      return 400;
  }
}
