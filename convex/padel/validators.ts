import { v } from "convex/values";

export const modalityValidator = v.union(v.literal("mixto"), v.literal("masc"), v.literal("fem"));

export const openWindowValidator = v.union(v.literal("today"), v.literal("next7"));

export const notificationTypeValidator = v.union(
  v.literal("PARTIDO_LLENO"),
  v.literal("CUPO_LIBERADO"),
  v.literal("PARTIDO_CANCELADO"),
  v.literal("PARTICIPANTE_SE_UNIO"),
  v.literal("PARTICIPANTE_SE_SALIO"),
);

export const actorValidator = v.object({
  firebaseUid: v.string(),
  phoneE164: v.optional(v.string()),
});

export const createMatchInputValidator = v.object({
  club: v.string(),
  startsAtLocal: v.string(),
  category: v.string(),
  modality: modalityValidator,
});
