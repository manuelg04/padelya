import { NextRequest } from "next/server";

import { readBearerToken, responseError, responseOk } from "@/src/backend/http";
import { padelService } from "@/src/backend/padel-service";

export async function POST(request: NextRequest) {
  try {
    if (process.env.NODE_ENV !== "test" && process.env.NEXT_PUBLIC_USE_MOCK_BACKEND !== "true") {
      return responseOk({ ok: false }, 403);
    }

    const body = (await request.json()) as {
      clubSlug: string;
      clubName: string;
      seedToken: string;
    };

    const bearer = readBearerToken(request);
    const adminFirebaseUids: string[] = [];

    if (bearer) {
      const user = await padelService.getUserByToken(bearer);
      adminFirebaseUids.push(user.firebaseUid);
    }

    await padelService.seedClubAndMembers({
      clubSlug: body.clubSlug,
      clubName: body.clubName,
      adminFirebaseUids,
      staffFirebaseUids: [],
      seedToken: body.seedToken,
    });

    return responseOk({ ok: true });
  } catch (error) {
    return responseError(error);
  }
}
