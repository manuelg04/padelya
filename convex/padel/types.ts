import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { UserIdentity } from "convex/server";

export type ReadCtx = QueryCtx | MutationCtx;
export type WriteCtx = MutationCtx;

export interface ActorInput {
  firebaseUid: string;
  phoneE164?: string;
}

export type UserDoc = Doc<"users">;
export type MatchDoc = Doc<"matches">;
export type MatchParticipantDoc = Doc<"matchParticipants">;
export type MatchWatcherDoc = Doc<"matchWatchers">;
export type NotificationDoc = Doc<"notifications">;

export type UserId = Id<"users">;
export type MatchId = Id<"matches">;
export type NotificationId = Id<"notifications">;
export type StorageId = Id<"_storage">;
export type AuthIdentity = UserIdentity;

export type Modality = MatchDoc["modality"];
export type OpenWindow = "today" | "next7";
export type NotificationType = NotificationDoc["type"];
export type PresenceNotificationType = Extract<
  NotificationType,
  "PARTICIPANTE_SE_UNIO" | "PARTICIPANTE_SE_SALIO"
>;
export type MatchStatus = "abierta" | "cerrada" | "cancelada" | "no_se_armo";

export interface UserResponse {
  id: string;
  firebaseUid: string;
  phoneE164: string;
  alias: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MatchViewParticipant {
  userId: string;
  alias: string;
  joinedAt: string;
  avatarUrl: string | null;
}

export interface MatchView {
  publicId: string;
  organizerUserId: string;
  club: string;
  startsAtUtc: string;
  timezone: string;
  category: string;
  modality: Modality;
  status: MatchStatus;
  participants: MatchViewParticipant[];
  isOrganizer: boolean;
  canJoin: boolean;
  canLeave: boolean;
  isCanceled: boolean;
  isWatchingReleaseSpot: boolean;
}

export interface CreateMatchInput {
  club: string;
  startsAtLocal: string;
  category: string;
  modality: Modality;
}

export interface ActorArgs {
  actor: ActorInput;
}

export interface UpdateAliasArgs extends ActorArgs {
  alias: string;
}

export interface SetMyAvatarArgs {
  storageId: StorageId;
}

export interface CreateMatchArgs extends ActorArgs {
  input: CreateMatchInput;
  timezone?: string;
}

export interface ListHomeArgs {
  actor?: ActorInput;
}

export type ListMineArgs = ActorArgs;

export interface ListOpenFeedArgs {
  modality?: Modality;
  window: OpenWindow;
  nowIso?: string;
}

export interface GetMatchArgs {
  publicId: string;
  actor?: ActorInput;
}

export interface PublicIdActorArgs extends ActorArgs {
  publicId: string;
}

export interface ListNotificationsArgs {
  limit?: number;
}

export interface ListNotificationsForActorArgs extends ActorArgs {
  limit?: number;
}

export interface NotifyUserInput {
  recipientUserId: UserId;
  type: NotificationType;
  matchId?: MatchId;
  matchPublicId?: string;
  title: string;
  message: string;
  createdAt: string;
  dedupeKey?: string;
}

export interface NotifyManyUsersInput extends Omit<NotifyUserInput, "recipientUserId" | "dedupeKey"> {
  recipientUserIds: UserId[];
  dedupeKey?: string;
}

export interface EventLogInput {
  type: string;
  actorUserId?: UserId;
  matchId?: MatchId;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface NotificationListItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  matchPublicId: string | null;
  createdAt: string;
  readAt: string | null;
  isRead: boolean;
}
