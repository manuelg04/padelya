import { convexPadelService } from "@/src/backend/convex-service";
import { padelService as memoryPadelService } from "@/src/backend/service";
import { USE_MOCK_BACKEND } from "@/src/lib/env";

export const padelService = USE_MOCK_BACKEND ? memoryPadelService : convexPadelService;
