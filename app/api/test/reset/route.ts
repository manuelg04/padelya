import { responseOk } from "@/src/backend/http";
import { padelService } from "@/src/backend/padel-service";

export async function POST() {
  if (process.env.NODE_ENV !== "test" && process.env.NEXT_PUBLIC_USE_MOCK_BACKEND !== "true") {
    return responseOk({ ok: false }, 403);
  }
  padelService.resetForTests();
  return responseOk({ ok: true });
}
