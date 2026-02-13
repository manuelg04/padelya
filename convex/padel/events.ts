import { nowIso } from "./date_time";
import type { EventLogInput, WriteCtx } from "./types";

export async function logEvent(ctx: WriteCtx, input: EventLogInput): Promise<void> {
  await ctx.db.insert("eventLogs", {
    type: input.type,
    actorUserId: input.actorUserId,
    matchId: input.matchId,
    metadata: input.metadata,
    createdAt: nowIso(),
  });
}
