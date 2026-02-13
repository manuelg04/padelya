import { createRemoteJWKSet, jwtVerify } from "jose";

import { DomainError } from "@/src/domain/errors";

const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

export interface FirebaseIdentity {
  uid: string;
  phoneNumber?: string;
}

export async function verifyFirebaseIdToken(idToken: string): Promise<FirebaseIdentity> {
  if (!projectId) {
    throw new DomainError("UNAUTHORIZED", "Falta configurar FIREBASE_PROJECT_ID en el servidor.");
  }

  try {
    const { payload } = await jwtVerify(idToken, JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });

    if (typeof payload.sub !== "string" || !payload.sub) {
      throw new DomainError("UNAUTHORIZED", "Token de Firebase inválido.");
    }

    return {
      uid: payload.sub,
      phoneNumber: typeof payload.phone_number === "string" ? payload.phone_number : undefined,
    };
  } catch {
    throw new DomainError("UNAUTHORIZED", "Token de Firebase inválido o expirado.");
  }
}
