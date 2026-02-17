import type {
  AdminCategoryDashboard,
  AdminClubMembership,
  AdminTournamentsResponse,
  CreateMatchInput,
  CreateTournamentInput,
  EventLogRecord,
  MatchView,
  Modality,
  NotificationRecord,
  OpenFeedWindow,
  PublicTournamentCategoryDetail,
  PublicTournamentDetail,
  PushSubscriptionPayload,
  PushSubscriptionState,
  TournamentFreeMatchResultInput,
  TournamentFreeRoundCreateRequest,
  TournamentRegistrationRequest,
  TournamentRegistrationStatus,
  TournamentSetScore,
  UserRecord,
} from "@/src/domain/types";

type MaybePromise<T> = T | Promise<T>;

export interface BackendPadelService {
  resetForTests(): MaybePromise<void>;
  getEventLogs(): MaybePromise<EventLogRecord[]>;

  requestOtp(phoneE164: string): MaybePromise<{ expiresInSeconds: number }>;
  verifyOtp(phoneE164: string, code: string): MaybePromise<{ token: string; user: UserRecord }>;

  getUserByToken(token: string): MaybePromise<UserRecord>;
  updateAlias(token: string, alias: string): MaybePromise<UserRecord>;
  generateAvatarUploadUrl(token: string): MaybePromise<string>;
  setAvatar(token: string, storageId: string): MaybePromise<UserRecord>;
  removeAvatar(token: string): MaybePromise<UserRecord>;

  createMatch(token: string, input: CreateMatchInput): MaybePromise<MatchView>;
  listHome(actorToken?: string): MaybePromise<MatchView[]>;
  listMine(token: string): MaybePromise<MatchView[]>;
  listOpenFeed(filters: {
    modality?: Modality;
    window: OpenFeedWindow;
    now?: Date;
    actorToken?: string;
  }): MaybePromise<MatchView[]>;
  getMatch(publicId: string, token?: string): MaybePromise<MatchView>;
  followMatchWatch(publicId: string, token: string): MaybePromise<MatchView>;
  unfollowMatchWatch(publicId: string, token: string): MaybePromise<MatchView>;
  join(publicId: string, token: string): MaybePromise<MatchView>;
  leave(publicId: string, token: string): MaybePromise<MatchView>;
  cancel(publicId: string, token: string): MaybePromise<MatchView>;
  getWhatsAppSummary(publicId: string, token?: string, origin?: string): MaybePromise<string>;

  listNotifications(token: string, limit?: number): MaybePromise<NotificationRecord[]>;
  getPushSubscriptionState(token: string): MaybePromise<PushSubscriptionState>;
  upsertPushSubscription(token: string, subscription: PushSubscriptionPayload): MaybePromise<PushSubscriptionState>;
  removePushSubscription(token: string, options?: { endpoint?: string; all?: boolean }): MaybePromise<PushSubscriptionState>;

  subscribeToMatch(publicId: string, listener: () => void): () => void;

  getTournamentBySlug(tournamentSlug: string, token?: string): MaybePromise<PublicTournamentDetail>;
  getTournamentCategoryBySlug(
    tournamentSlug: string,
    categorySlug: string,
    token?: string,
  ): MaybePromise<PublicTournamentCategoryDetail>;
  listAdminClubs(token: string): MaybePromise<AdminClubMembership[]>;
  listAdminTournaments(token: string, clubSlug: string): MaybePromise<AdminTournamentsResponse>;
  getAdminCategoryDashboard(
    token: string,
    tournamentSlug: string,
    categorySlug: string,
  ): MaybePromise<AdminCategoryDashboard>;
  createTournament(token: string, input: CreateTournamentInput): MaybePromise<{ tournamentSlug: string; categorySlugs: string[] }>;
  generateTournamentGroups(
    token: string,
    tournamentSlug: string,
    categorySlug: string,
    input?: { groupCount?: number },
  ): MaybePromise<{ groupCount: number; teamsCount: number }>;
  moveTournamentTeamGroup(
    token: string,
    tournamentSlug: string,
    categorySlug: string,
    teamId: string,
    targetGroupName: string,
  ): MaybePromise<{ ok: true }>;
  generateTournamentGroupMatches(
    token: string,
    tournamentSlug: string,
    categorySlug: string,
  ): MaybePromise<{ groupsCount: number; matchesCount: number }>;
  reportTournamentGroupMatchResult(
    token: string,
    tournamentSlug: string,
    categorySlug: string,
    matchId: string,
    payload: {
      winnerTeamId: string;
      sets: TournamentSetScore[];
    },
  ): MaybePromise<{ matchId: string; status: "completed" }>;
  createTournamentFreeRound(
    token: string,
    tournamentSlug: string,
    categorySlug: string,
    payload: TournamentFreeRoundCreateRequest,
  ): MaybePromise<{ roundId: string; matchesCount: number; byeCount: number }>;
  reportTournamentFreeMatchResult(
    token: string,
    tournamentSlug: string,
    categorySlug: string,
    matchId: string,
    payload: TournamentFreeMatchResultInput,
  ): MaybePromise<{ matchId: string; status: "completed" }>;
  registerForCategory(
    token: string,
    tournamentSlug: string,
    categorySlug: string,
    payload: TournamentRegistrationRequest,
  ): MaybePromise<{ registrationId: string; status: TournamentRegistrationStatus }>;
  cancelTournamentRegistration(token: string, registrationId: string): MaybePromise<{ registrationId: string; status: "cancelled" }>;
  setTournamentRegistrationStatus(
    token: string,
    registrationId: string,
    status: TournamentRegistrationStatus,
  ): MaybePromise<{ registrationId: string; status: TournamentRegistrationStatus }>;
  updateClubPaymentInstructions(
    token: string,
    clubSlug: string,
    paymentInstructions: string,
  ): MaybePromise<{ ok: true }>;
  seedClubAndMembers(input: {
    clubSlug: string;
    clubName: string;
    adminFirebaseUids: string[];
    staffFirebaseUids: string[];
    seedToken: string;
  }): MaybePromise<{ clubSlug: string; memberCount: number }>;
}
