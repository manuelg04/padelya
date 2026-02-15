import { convexPadelService } from "@/src/backend/convex-service";
import type { BackendPadelService } from "@/src/backend/contracts";
import { padelService as memoryPadelService } from "@/src/backend/service";
import { USE_MOCK_BACKEND } from "@/src/lib/env";

export const padelService: BackendPadelService = USE_MOCK_BACKEND ? memoryPadelService : convexPadelService;
