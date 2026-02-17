"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  BellOff,
  CalendarDays,
  CheckCircle2,
  Clock,
  Loader2,
  LogIn,
  MessageCircle,
  RefreshCcw,
  Share2,
  Tag,
  UserMinus,
  UserPlus,
  XCircle,
} from "lucide-react";

import { useAuth } from "@/src/components/auth/auth-provider";
import { StatusBadge } from "@/src/components/features/status-badge";
import { AppShell } from "@/src/components/layout/app-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/src/components/ui/avatar";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Progress } from "@/src/components/ui/progress";
import { Separator } from "@/src/components/ui/separator";
import { Skeleton } from "@/src/components/ui/skeleton";
import { MAX_PLAYERS } from "@/src/domain/types";
import { suggestRetryStartsAtLocal, utcIsoToBogotaParts } from "@/src/domain/match";
import {
  NEW_BADGE_TTL_MS,
  resolveDetailReturnNotice,
  toMatchReentrySnapshot,
  type ReturnTriggerEvent,
} from "@/src/domain/reentry";
import type { MatchView } from "@/src/domain/types";
import {
  cancelMatch,
  createMatch,
  followMatchWatch,
  getMatch,
  getMatchSummary,
  joinMatch,
  leaveMatch,
  unfollowMatchWatch,
  type ApiError,
} from "@/src/lib/api/client";
import { getAvatarInitials } from "@/src/lib/avatar";
import { normalizePublicId } from "@/src/lib/public-id";
import { useReturnTrigger } from "@/src/lib/use-return-trigger";
import { cn, toErrorMessage } from "@/src/lib/utils";

function isAliasRequired(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const maybe = error as ApiError;
  return maybe.code === "ALIAS_REQUIRED";
}

export default function MatchDetailPage() {
  const params = useParams<{ publicId: string }>();
  const rawPublicId = params.publicId ?? "";
  const publicId = normalizePublicId(rawPublicId);
  const { token, user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [match, setMatch] = useState<MatchView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [returnNotice, setReturnNotice] = useState<string | null>(null);
  const [contextNotice, setContextNotice] = useState<"release" | "canceled" | null>(null);
  const matchSnapshotRef = useRef<ReturnType<typeof toMatchReentrySnapshot> | null>(null);
  const returnNoticeTimeoutRef = useRef<number | null>(null);
  const contextNoticeTimeoutRef = useRef<number | null>(null);

  const refresh = useCallback(async (options?: { returnEvent?: ReturnTriggerEvent }) => {
    if (!publicId) {
      return;
    }

    const previousSnapshot = matchSnapshotRef.current;

    try {
      setIsLoading(true);
      const next = await getMatch(publicId, token ?? undefined);
      setMatch(next);
      const nextSnapshot = toMatchReentrySnapshot(next);
      matchSnapshotRef.current = nextSnapshot;

      if (options?.returnEvent && previousSnapshot) {
        const notice = resolveDetailReturnNotice(previousSnapshot, nextSnapshot);
        if (notice) {
          setReturnNotice(notice);
          if (returnNoticeTimeoutRef.current !== null) {
            window.clearTimeout(returnNoticeTimeoutRef.current);
          }
          returnNoticeTimeoutRef.current = window.setTimeout(() => {
            setReturnNotice(null);
          }, NEW_BADGE_TTL_MS);
        }
      }
      setError(null);
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    } finally {
      setIsLoading(false);
    }
  }, [publicId, token]);

  useEffect(() => {
    if (loading) {
      return;
    }
    void refresh();
  }, [refresh, loading]);

  useEffect(() => {
    return () => {
      if (returnNoticeTimeoutRef.current !== null) {
        window.clearTimeout(returnNoticeTimeoutRef.current);
      }
      if (contextNoticeTimeoutRef.current !== null) {
        window.clearTimeout(contextNoticeTimeoutRef.current);
      }
    };
  }, []);

  useReturnTrigger(
    useCallback(
      (event: ReturnTriggerEvent) => {
        void refresh({ returnEvent: event });
      },
      [refresh],
    ),
    { enabled: Boolean(publicId) },
  );

  useEffect(() => {
    if (!publicId) {
      return;
    }
    const source = new EventSource(`/api/matches/${publicId}/events`);
    source.addEventListener("update", () => {
      void refresh();
    });
    return () => source.close();
  }, [publicId, refresh]);

  useEffect(() => {
    if (rawPublicId && publicId && rawPublicId !== publicId) {
      const query = searchParams.toString();
      router.replace(`/partido/${publicId}${query ? `?${query}` : ""}`);
    }
  }, [publicId, rawPublicId, router, searchParams]);

  const noticeParam = searchParams.get("notice");
  const wantsJoinCta = searchParams.get("cta") === "join";
  const isReleaseContext = noticeParam === "release";

  useEffect(() => {
    if (noticeParam !== "release" && noticeParam !== "canceled") {
      return;
    }

    setContextNotice(noticeParam);
    if (contextNoticeTimeoutRef.current !== null) {
      window.clearTimeout(contextNoticeTimeoutRef.current);
    }
    contextNoticeTimeoutRef.current = window.setTimeout(() => {
      setContextNotice(null);
    }, NEW_BADGE_TTL_MS);
  }, [noticeParam]);

  const pathWithQuery = useMemo(() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);

  async function guardAuth(): Promise<boolean> {
    if (!token) {
      router.push(`/login?redirect=${encodeURIComponent(pathWithQuery)}`);
      return false;
    }
    if (!loading && user && !user.alias) {
      router.push(`/perfil?redirect=${encodeURIComponent(pathWithQuery)}`);
      return false;
    }
    return true;
  }

  async function handleJoin() {
    if (!(await guardAuth()) || !token) {
      return;
    }
    try {
      setIsMutating(true);
      const next = await joinMatch(publicId, token);
      setMatch(next);
      matchSnapshotRef.current = toMatchReentrySnapshot(next);
      setFeedback("Te uniste al partido.");
      setError(null);
    } catch (nextError) {
      if (isAliasRequired(nextError)) {
        router.push(`/perfil?redirect=${encodeURIComponent(pathWithQuery)}`);
        return;
      }
      setError(toErrorMessage(nextError));
    } finally {
      setIsMutating(false);
    }
  }

  async function handleLeave() {
    if (!(await guardAuth()) || !token) {
      return;
    }
    try {
      setIsMutating(true);
      const next = await leaveMatch(publicId, token);
      setMatch(next);
      matchSnapshotRef.current = toMatchReentrySnapshot(next);
      setFeedback("Saliste del partido.");
      setError(null);
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    } finally {
      setIsMutating(false);
    }
  }

  function handleOpenCancelConfirm() {
    setIsCancelConfirmOpen(true);
  }

  function handleCloseCancelConfirm() {
    if (isMutating) {
      return;
    }
    setIsCancelConfirmOpen(false);
  }

  async function handleConfirmCancel() {
    if (!(await guardAuth()) || !token) {
      return;
    }
    try {
      setIsMutating(true);
      const next = await cancelMatch(publicId, token);
      setMatch(next);
      matchSnapshotRef.current = toMatchReentrySnapshot(next);
      setIsCancelConfirmOpen(false);
      setFeedback("Partido cancelado.");
      setError(null);
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    } finally {
      setIsMutating(false);
    }
  }

  async function handleCopySummary() {
    try {
      const summary = await getMatchSummary(publicId, token ?? undefined);
      await navigator.clipboard.writeText(summary);
      setFeedback("Resumen copiado para WhatsApp.");
      setError(null);
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    }
  }

  async function handleShareLink() {
    const link = `${window.location.origin}/partido/${publicId}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Partido de pádel",
          url: link,
        });
      } else {
        await navigator.clipboard.writeText(link);
      }
      setFeedback("Link compartido/copiado.");
      setError(null);
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    }
  }

  const dateTime = useMemo(() => (match ? utcIsoToBogotaParts(match.startsAtUtc) : null), [match]);

  const viewerUserId = user?.id ?? null;
  const isParticipantByViewer = Boolean(
    match && viewerUserId && match.participants.some((participant) => participant.userId === viewerUserId),
  );
  const isOrganizerByViewer = Boolean(match && viewerUserId && match.organizerUserId === viewerUserId);
  const isOrganizer = Boolean(match && (match.isOrganizer || isOrganizerByViewer));
  const canJoin = Boolean(
    match &&
      (match.canJoin ||
        (Boolean(token) &&
          !isParticipantByViewer &&
          !isOrganizerByViewer &&
          !match.isCanceled &&
          match.status === "abierta")),
  );
  const canLeave = Boolean(
    match &&
      (match.canLeave ||
        (Boolean(token) &&
          isParticipantByViewer &&
          !isOrganizerByViewer &&
          !match.isCanceled &&
          match.status !== "no_se_armo")),
  );

  const emptySlots = match ? MAX_PLAYERS - match.participants.length : 0;
  const hasAvailableSpot = Boolean(
    match && !match.isCanceled && match.status === "abierta" && match.participants.length < MAX_PLAYERS,
  );
  const shouldShowReleaseRewatchCta = wantsJoinCta && isReleaseContext && !hasAvailableSpot;
  const shouldShowReleaseMissedBanner =
    contextNotice === "release" && match && !hasAvailableSpot && !match.isCanceled;
  const contextNoticeLabel =
    contextNotice === "release"
      ? shouldShowReleaseMissedBanner
        ? "Se ocupó el cupo antes de que llegaras"
        : "Se liberó 1 cupo"
      : contextNotice === "canceled"
        ? "Partido cancelado"
        : null;

  async function handleRetry() {
    if (!(await guardAuth()) || !token || !match) {
      return;
    }

    try {
      setIsMutating(true);
      const retryMatch = await createMatch(token, {
        club: match.club,
        startsAtLocal: suggestRetryStartsAtLocal(match.startsAtUtc),
        category: match.category,
        modality: match.modality,
      });
      setError(null);
      setFeedback("Nuevo partido creado.");
      router.push(`/partido/${retryMatch.publicId}`);
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    } finally {
      setIsMutating(false);
    }
  }

  async function handleFollowWatch() {
    if (!(await guardAuth()) || !token) {
      return;
    }
    try {
      setIsMutating(true);
      const next = await followMatchWatch(publicId, token);
      setMatch(next);
      matchSnapshotRef.current = toMatchReentrySnapshot(next);
      setFeedback("Te avisaremos si se libera un cupo.");
      setError(null);
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    } finally {
      setIsMutating(false);
    }
  }

  async function handleUnfollowWatch() {
    if (!(await guardAuth()) || !token) {
      return;
    }
    try {
      setIsMutating(true);
      const next = await unfollowMatchWatch(publicId, token);
      setMatch(next);
      matchSnapshotRef.current = toMatchReentrySnapshot(next);
      setFeedback("Dejaste de seguir este partido.");
      setError(null);
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    } finally {
      setIsMutating(false);
    }
  }

  return (
    <AppShell>
      {/* Feedback alerts */}
      {error ? (
        <div className="mb-4 flex items-start gap-2 rounded-xl bg-rose-50 p-3.5 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}
      {feedback ? (
        <div className="mb-4 flex items-start gap-2 rounded-xl bg-emerald-50 p-3.5 text-sm text-emerald-700 ring-1 ring-inset ring-emerald-200">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      ) : null}
      {returnNotice ? (
        <div className="mb-4 flex items-start gap-2 rounded-xl bg-sky-50 p-3.5 text-sm text-sky-700 ring-1 ring-inset ring-sky-200">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{returnNotice}</span>
        </div>
      ) : null}
      {contextNoticeLabel ? (
        <div className="fixed left-1/2 top-[calc(0.75rem+env(safe-area-inset-top))] z-40 w-[min(92vw,26rem)] -translate-x-1/2 rounded-xl bg-zinc-900/95 px-4 py-3 text-sm font-medium text-white shadow-lg">
          {contextNoticeLabel}
        </div>
      ) : null}

      {/* Skeleton loading state */}
      {isLoading ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <div className="mt-3 flex flex-col gap-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-36" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-2 w-full rounded-full" />
            <div className="space-y-2">
              {Array.from({ length: MAX_PLAYERS }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </CardContent>
        </Card>
      ) : null}

      {/* Main match card */}
      {match ? (
        <Card>
          {/* Header */}
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <CardTitle className="text-xl font-bold">{match.club}</CardTitle>
              <StatusBadge status={match.status} />
            </div>
            <div className="mt-2 flex flex-col gap-1.5 text-sm text-zinc-500">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 shrink-0 text-zinc-400" />
                <span>{dateTime?.date}</span>
                <Clock className="ml-1 h-4 w-4 shrink-0 text-zinc-400" />
                <span>{dateTime?.time}</span>
              </div>
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 shrink-0 text-zinc-400" />
                <span className="capitalize">{match.category} · {match.modality}</span>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            <Separator />

            {/* Participants section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-zinc-800">Confirmados</h4>
                <span className="text-sm font-semibold text-emerald-600">{match.participants.length}/{MAX_PLAYERS}</span>
              </div>
              <Progress value={match.participants.length} max={MAX_PLAYERS} />

              <div className="space-y-2">
                {match.participants.map((participant, index) => {
                  const isCurrentUser = participant.userId === user?.id;
                  const isOrganizer = participant.userId === match.organizerUserId;

                  return (
                    <div
                      key={participant.userId}
                      className={cn(
                        "flex items-center gap-3 rounded-xl bg-emerald-50/60 px-3.5 py-2.5 ring-1 ring-inset ring-emerald-100",
                        isCurrentUser && "ring-emerald-300",
                      )}
                    >
                      <div className="relative">
                        <Avatar size="default" className="ring-1 ring-emerald-200">
                          <AvatarImage src={participant.avatarUrl ?? undefined} alt={participant.alias} />
                          <AvatarFallback>{getAvatarInitials(participant.alias)}</AvatarFallback>
                        </Avatar>
                        <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white ring-2 ring-white">
                          {index + 1}
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-zinc-800">{participant.alias}</span>
                          {isCurrentUser ? (
                            <span className="rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                              Tú
                            </span>
                          ) : null}
                          {isOrganizer ? (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                              Organizador
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <CheckCircle2 className="ml-auto h-4 w-4 text-emerald-500" />
                    </div>
                  );
                })}

                {Array.from({ length: emptySlots }).map((_, i) => (
                  <div
                    key={`empty-${i}`}
                    className="flex items-center gap-3 rounded-xl border border-dashed border-zinc-200 px-3.5 py-2.5"
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 text-xs font-medium text-zinc-400">
                      {match.participants.length + i + 1}
                    </div>
                    <span className="text-sm text-zinc-400">Cupo disponible</span>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Canceled banner */}
            {match.isCanceled ? (
              <div
                className="flex items-start gap-2.5 rounded-xl bg-rose-50 p-4 text-sm text-rose-700 ring-1 ring-inset ring-rose-200"
                data-testid="canceled-banner"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Este partido fue cancelado. Puedes ver los detalles, pero no se permiten nuevas uniones.</span>
              </div>
            ) : null}

            {!match.isCanceled && match.status === "no_se_armo" ? (
              <div
                className="flex items-start gap-2.5 rounded-xl bg-orange-50 p-4 text-sm text-orange-800 ring-1 ring-inset ring-orange-200"
                data-testid="no-show-banner"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Este partido no se armó.</span>
              </div>
            ) : null}

            {!match.isCanceled && match.status === "cerrada" ? (
              <div className="rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
                Estado: Lleno ({MAX_PLAYERS}/{MAX_PLAYERS})
              </div>
            ) : null}

            {wantsJoinCta && !match.isCanceled && !hasAvailableSpot ? (
              <div className="flex items-start gap-2 rounded-xl bg-zinc-50 px-3.5 py-3 text-sm text-zinc-700 ring-1 ring-inset ring-zinc-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
                <span>Se ocupó el cupo antes de que llegaras</span>
              </div>
            ) : null}

            {/* Primary CTA */}
            <div className="space-y-2.5">
              {contextNotice === "canceled" ? (
                <Button className="w-full" size="lg" variant="outline" disabled>
                  Ver detalles
                </Button>
              ) : null}

              {canJoin ? (
                <Button className="w-full" size="lg" onClick={handleJoin} disabled={isMutating} data-testid="join-btn">
                  {isMutating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                  {isMutating
                    ? "Procesando..."
                    : wantsJoinCta && isReleaseContext
                      ? "Unirme ahora"
                      : "Unirme al partido"}
                </Button>
              ) : null}

              {canLeave ? (
                <Button className="w-full" variant="outline" size="lg" onClick={handleLeave} disabled={isMutating} data-testid="leave-btn">
                  {isMutating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserMinus className="h-4 w-4" />
                  )}
                  {isMutating ? "Procesando..." : "Salir del partido"}
                </Button>
              ) : null}

              {token && !isOrganizer && !canJoin && !canLeave && !match.isCanceled && match.status === "cerrada" ? (
                <>
                  {!match.isWatchingReleaseSpot ? (
                    <Button
                      className="w-full"
                      size="lg"
                      onClick={handleFollowWatch}
                      disabled={isMutating}
                      data-testid="follow-watch-btn"
                    >
                      {isMutating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Bell className="h-4 w-4" />
                      )}
                      {isMutating
                        ? "Procesando..."
                        : shouldShowReleaseRewatchCta
                          ? "Avisarme si se libera otro cupo"
                          : "Avisarme si se libera un cupo"}
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <p className="rounded-xl bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-200">
                        Te avisaremos si se libera un cupo.
                      </p>
                      <Button
                        className="w-full"
                        variant="outline"
                        size="lg"
                        onClick={handleUnfollowWatch}
                        disabled={isMutating}
                        data-testid="unfollow-watch-btn"
                      >
                        {isMutating ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <BellOff className="h-4 w-4" />
                        )}
                        {isMutating ? "Procesando..." : "Dejar de avisarme"}
                      </Button>
                    </div>
                  )}
                </>
              ) : null}

              {!token && !match.isCanceled && match.status !== "no_se_armo" ? (
                <Button className="w-full" size="lg" asChild>
                  <Link href={`/login?redirect=${encodeURIComponent(pathWithQuery)}`}>
                    <LogIn className="h-4 w-4" />
                    {shouldShowReleaseRewatchCta
                      ? "Avisarme si se libera otro cupo"
                      : wantsJoinCta && isReleaseContext && hasAvailableSpot
                      ? "Inicia sesión para unirte"
                      : "Inicia sesión para participar"}
                  </Link>
                </Button>
              ) : null}
            </div>

            <Separator />

            {/* Share actions */}
            <div className="space-y-2.5">
              <Button className="w-full" variant="whatsapp" onClick={handleCopySummary} data-testid="copy-summary-btn">
                <MessageCircle className="h-4 w-4" />
                Copiar para WhatsApp
              </Button>
              <Button className="w-full" variant="outline" onClick={handleShareLink}>
                <Share2 className="h-4 w-4" />
                Compartir link
              </Button>
            </div>

            {/* Organizer actions */}
            {isOrganizer && !match.isCanceled ? (
              <>
                <Separator />
                {match.status === "no_se_armo" ? (
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={handleRetry}
                    disabled={isMutating}
                    data-testid="retry-btn"
                  >
                    {isMutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                    {isMutating ? "Procesando..." : "Reintentar"}
                  </Button>
                ) : null}
                <Button
                  className="w-full"
                  variant="destructive"
                  onClick={handleOpenCancelConfirm}
                  disabled={isMutating}
                  data-testid="cancel-btn"
                >
                  {isMutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                  Cancelar partido
                </Button>
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {isCancelConfirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-end bg-zinc-950/50 p-4 sm:items-center sm:justify-center">
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl ring-1 ring-zinc-200"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-match-title"
            aria-describedby="cancel-match-description"
          >
            <h3 id="cancel-match-title" className="text-lg font-semibold text-zinc-900">
              Cancelar partido
            </h3>
            <p id="cancel-match-description" className="mt-2 text-sm text-zinc-600">
              Si cancelas, el partido se cerrará para todos y dejará de aparecer como abierto.
            </p>
            <div className="mt-5 grid gap-2">
              <Button
                variant="destructive"
                onClick={handleConfirmCancel}
                disabled={isMutating}
                data-testid="confirm-cancel-btn"
              >
                {isMutating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isMutating ? "Procesando..." : "Cancelar partido"}
              </Button>
              <Button
                variant="outline"
                onClick={handleCloseCancelConfirm}
                disabled={isMutating}
                data-testid="cancel-confirm-back-btn"
              >
                Volver
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
