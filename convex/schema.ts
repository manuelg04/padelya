import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    firebaseUid: v.string(),
    phoneE164: v.string(),
    alias: v.optional(v.string()),
    avatarStorageId: v.optional(v.id("_storage")),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_firebase_uid", ["firebaseUid"])
    .index("by_phone", ["phoneE164"]),

  matches: defineTable({
    publicId: v.string(),
    organizerUserId: v.id("users"),
    club: v.string(),
    startsAtUtc: v.string(),
    timezone: v.string(),
    category: v.string(),
    modality: v.union(v.literal("mixto"), v.literal("masc"), v.literal("fem")),
    canceledAt: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_public_id", ["publicId"])
    .index("by_organizer", ["organizerUserId"])
    .index("by_starts_at_utc", ["startsAtUtc"]),

  matchParticipants: defineTable({
    matchId: v.id("matches"),
    userId: v.id("users"),
    joinedAt: v.string(),
  })
    .index("by_match", ["matchId"])
    .index("by_match_user", ["matchId", "userId"])
    .index("by_user", ["userId"]),

  eventLogs: defineTable({
    type: v.string(),
    actorUserId: v.optional(v.id("users")),
    matchId: v.optional(v.id("matches")),
    metadata: v.optional(v.any()),
    createdAt: v.string(),
  }).index("by_created_at", ["createdAt"]),

  notifications: defineTable({
    recipientUserId: v.id("users"),
    type: v.union(
      v.literal("TU_CUPO_CONFIRMADO"),
      v.literal("PARTIDO_LLENO"),
      v.literal("CUPO_LIBERADO"),
      v.literal("PARTIDO_CANCELADO"),
      v.literal("PARTICIPANTE_SE_UNIO"),
      v.literal("PARTICIPANTE_SE_SALIO"),
    ),
    title: v.string(),
    message: v.string(),
    matchId: v.optional(v.id("matches")),
    matchPublicId: v.optional(v.string()),
    createdAt: v.string(),
    readAt: v.optional(v.string()),
    dedupeKey: v.optional(v.string()),
  })
    .index("by_recipient_created_at", ["recipientUserId", "createdAt"])
    .index("by_recipient_read_at", ["recipientUserId", "readAt"])
    .index("by_recipient_dedupe", ["recipientUserId", "dedupeKey"]),

  pushSubscriptions: defineTable({
    userId: v.id("users"),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    expirationTime: v.optional(v.number()),
    createdAt: v.string(),
    updatedAt: v.string(),
    isActive: v.boolean(),
    disabledReason: v.optional(v.string()),
    lastFailureAt: v.optional(v.string()),
  })
    .index("by_user_active", ["userId", "isActive"])
    .index("by_user_endpoint", ["userId", "endpoint"])
    .index("by_endpoint", ["endpoint"]),

  matchWatchers: defineTable({
    matchId: v.id("matches"),
    userId: v.id("users"),
    reason: v.union(v.literal("full_attempt")),
    createdAt: v.string(),
    expiresAt: v.string(),
  })
    .index("by_match", ["matchId"])
    .index("by_match_user", ["matchId", "userId"])
    .index("by_match_expires_at", ["matchId", "expiresAt"]),
});
