import { NextRequest } from "next/server";

import { responseError, responseOk } from "@/src/backend/http";
import { padelService } from "@/src/backend/padel-service";
import { USE_MOCK_BACKEND } from "@/src/lib/env";
import { formatPhoneE164 } from "@/src/lib/utils";

export async function POST(request: NextRequest) {
  try {
    if (!USE_MOCK_BACKEND) {
      throw new Error("Verificación OTP local deshabilitada. Usa Firebase Phone Auth desde el cliente.");
    }

    const body = (await request.json()) as { phone: string; code: string };
    const phoneE164 = formatPhoneE164(body.phone ?? "");
    const result = padelService.verifyOtp(phoneE164, body.code);
    return responseOk(result);
  } catch (error) {
    return responseError(error);
  }
}
