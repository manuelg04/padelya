"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarX2, LogIn, Plus, XCircle, Zap } from "lucide-react";

import { useAuth } from "@/src/components/auth/auth-provider";
import { MatchCard } from "@/src/components/features/match-card";
import { OpenMatchCard } from "@/src/components/features/open-match-card";
import { AppShell } from "@/src/components/layout/app-shell";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Skeleton } from "@/src/components/ui/skeleton";
import { formatFeedSchedule, groupMatchesByDay } from "@/src/domain/match";
import {
  NEW_BADGE_TTL_MS,
  computeFeedReturnDiff,
  countStrictUpdatedMatches,
  getNextUpcomingMatch,
  isRelevantMatch,
  isWithinHours,
  shouldShowFeedReturnBanner,
  toMatchReentrySnapshot,
  toMatchReentrySnapshotMap,
  type MatchReentrySnapshot,
  type MatchReentrySnapshotMap,
  type ReturnTriggerEvent,
} from "@/src/domain/reentry";
import type { MatchView, Modality, OpenFeedWindow } from "@/src/domain/types";
import { getMatch, listMatches } from "@/src/lib/api/client";
import { useReturnTrigger } from "@/src/lib/use-return-trigger";
import { cn, toErrorMessage } from "@/src/lib/utils";

type HomeTab = "inicio" | "mis";
type FeedModalityFilter = "all" | Modality;

type FeedReturnBannerState = {
  newCount: number;
  updatedCount: number;
  newIds: string[];
};

const FEED_PAGE_SIZE = 15;
const FEED_STORAGE_KEY = "feed-state";

type FeedCacheState = {
  tab: HomeTab;
  feedModality: FeedModalityFilter;
  feedWindow: OpenFeedWindow;
  visibleCount: number;
  scrollY: number;
};

const TABS: { value: HomeTab; label: string }[] = [
  { value: "inicio", label: "Inicio" },
  { value: "mis", label: "Mis partidos" },
];

const FEED_MODALITY_OPTIONS: { value: FeedModalityFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "mixto", label: "Mixto" },
  { value: "masc", label: "Masc" },
  { value: "fem", label: "Fem" },
];

const FEED_TIME_OPTIONS: { value: OpenFeedWindow; label: string }[] = [
  { value: "today", label: "Hoy" },
  { value: "next7", label: "7 días" },
];

function MatchCardSkeleton() {
  return (
    <div className="space-y-3 rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <Skeleton className="h-4 w-44" />
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  );
}

function readCachedFeedState(): FeedCacheState | null {
  try {
    const raw = sessionStorage.getItem(FEED_STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(FEED_STORAGE_KEY);
    return JSON.parse(raw) as FeedCacheState;
  } catch {
    return null;
  }
}

function writeCachedFeedState(state: FeedCacheState) {
  try {
    sessionStorage.setItem(FEED_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function matchesText(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export default function HomePage() {
  const { loading, token, user } = useAuth();

  const didInitializeFiltersRef = useRef(false);
  const pendingScrollRef = useRef<number | null>(null);
  const pendingReturnEventRef = useRef<ReturnTriggerEvent | null>(null);
  const feedSnapshotRef = useRef<MatchReentrySnapshotMap>(new Map());
  const mineSnapshotRef = useRef<MatchReentrySnapshotMap>(new Map());
  const hasFeedSnapshotRef = useRef(false);
  const hasMineSnapshotRef = useRef(false);
  const newBadgeTimeoutRef = useRef<number | null>(null);

  const [cacheHydrated, setCacheHydrated] = useState(false);
  const [tab, setTab] = useState<HomeTab>("inicio");
  const [feedModality, setFeedModality] = useState<FeedModalityFilter>("all");
  const [feedWindow, setFeedWindow] = useState<OpenFeedWindow>("next7");
  const [visibleCount, setVisibleCount] = useState(FEED_PAGE_SIZE);
  const [matches, setMatches] = useState<MatchView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [returnRefreshTick, setReturnRefreshTick] = useState(0);
  const [feedReturnBanner, setFeedReturnBanner] = useState<FeedReturnBannerState | null>(null);
  const [newBadgeIds, setNewBadgeIds] = useState<string[]>([]);
  const [mineUpdatedCount, setMineUpdatedCount] = useState(0);

  useEffect(() => {
    const cached = readCachedFeedState();
    if (cached) {
      setTab(cached.tab);
      setFeedModality(cached.feedModality);
      setFeedWindow(cached.feedWindow);
      setVisibleCount(cached.visibleCount);
      if (cached.scrollY > 0) {
        pendingScrollRef.current = cached.scrollY;
      }
    }
    setCacheHydrated(true);
  }, []);

  useReturnTrigger(
    useCallback((event: ReturnTriggerEvent) => {
      pendingReturnEventRef.current = event;
      setReturnRefreshTick((prev) => prev + 1);
    }, []),
    { enabled: cacheHydrated },
  );

  const mineToken = tab === "mis" ? token : null;

  useEffect(() => {
    if (!cacheHydrated) {
      return;
    }

    let disposed = false;
    const returnEvent = pendingReturnEventRef.current;
    const isReturnCheck = Boolean(returnEvent);
    pendingReturnEventRef.current = null;

    void (async () => {
      try {
        setIsLoading(true);
        setError(null);

        if (tab === "mis") {
          if (!mineToken) {
            setMatches([]);
            return;
          }

          const myMatches = await listMatches({ token: mineToken, mine: true });
          if (disposed) {
            return;
          }

          const nextSnapshots = toMatchReentrySnapshotMap(myMatches);
          if (isReturnCheck) {
            if (hasMineSnapshotRef.current) {
              const updatedCount = countStrictUpdatedMatches(mineSnapshotRef.current, nextSnapshots);
              setMineUpdatedCount(updatedCount);
            } else {
              setMineUpdatedCount(0);
            }
          }

          mineSnapshotRef.current = nextSnapshots;
          hasMineSnapshotRef.current = true;
          setMatches(myMatches);
          return;
        }

        const openMatches = await listMatches({
          open: true,
          modality: feedModality === "all" ? undefined : feedModality,
          window: feedWindow,
        });
        if (disposed) {
          return;
        }

        const nextSnapshots = toMatchReentrySnapshotMap(openMatches);

        if (isReturnCheck && hasFeedSnapshotRef.current && returnEvent) {
          const previousSnapshots = feedSnapshotRef.current;
          const diff = computeFeedReturnDiff(previousSnapshots, nextSnapshots);

          const updatedSnapshotsById = new Map<string, MatchReentrySnapshot>();
          for (const publicId of diff.updatedIds) {
            const snapshot = nextSnapshots.get(publicId);
            if (snapshot) {
              updatedSnapshotsById.set(publicId, snapshot);
            }
          }

          if (diff.missingIds.length > 0) {
            const missingChecks = await Promise.all(
              diff.missingIds.map(async (publicId) => {
                try {
                  const latestMatch = await getMatch(publicId, token ?? undefined);
                  return { publicId, latestSnapshot: toMatchReentrySnapshot(latestMatch) };
                } catch {
                  return null;
                }
              }),
            );

            if (disposed) {
              return;
            }

            for (const item of missingChecks) {
              if (!item) {
                continue;
              }

              const previousSnapshot = previousSnapshots.get(item.publicId);
              if (!previousSnapshot) {
                continue;
              }

              if (
                previousSnapshot.status !== item.latestSnapshot.status ||
                previousSnapshot.participantCount !== item.latestSnapshot.participantCount
              ) {
                updatedSnapshotsById.set(item.publicId, item.latestSnapshot);
              }
            }
          }

          const relevantIds = new Set<string>();
          for (const publicId of diff.newIds) {
            const snapshot = nextSnapshots.get(publicId);
            if (!snapshot) {
              continue;
            }

            if (isRelevantMatch(snapshot, { now: new Date(), currentUserId: user?.id ?? null })) {
              relevantIds.add(publicId);
            }
          }

          for (const [publicId, snapshot] of updatedSnapshotsById) {
            if (isRelevantMatch(snapshot, { now: new Date(), currentUserId: user?.id ?? null })) {
              relevantIds.add(publicId);
            }
          }

          const shouldShow = shouldShowFeedReturnBanner({
            awayMs: returnEvent.awayMs,
            newCount: diff.newIds.length,
            relevantCount: relevantIds.size,
            totalCount: diff.newIds.length + updatedSnapshotsById.size,
          });

          const updatedCount = updatedSnapshotsById.size;
          if (shouldShow && (diff.newIds.length > 0 || updatedCount > 0)) {
            setFeedReturnBanner({
              newCount: diff.newIds.length,
              updatedCount,
              newIds: diff.newIds,
            });
          } else {
            setFeedReturnBanner(null);
          }
        }

        feedSnapshotRef.current = nextSnapshots;
        hasFeedSnapshotRef.current = true;
        setMatches(openMatches);
      } catch (nextError) {
        if (!disposed) {
          setError(toErrorMessage(nextError));
        }
      } finally {
        if (!disposed) {
          setIsLoading(false);

          if (pendingScrollRef.current !== null) {
            const scrollTarget = pendingScrollRef.current;
            pendingScrollRef.current = null;
            requestAnimationFrame(() => {
              window.scrollTo(0, scrollTarget);
            });
          }
        }
      }
    })();

    return () => {
      disposed = true;
    };
  }, [cacheHydrated, tab, mineToken, feedModality, feedWindow, returnRefreshTick, token, user?.id]);

  useEffect(() => {
    if (!cacheHydrated) {
      return;
    }
    if (!didInitializeFiltersRef.current) {
      didInitializeFiltersRef.current = true;
      return;
    }
    setVisibleCount(FEED_PAGE_SIZE);
  }, [cacheHydrated, feedModality, feedWindow]);

  useEffect(() => {
    return () => {
      if (newBadgeTimeoutRef.current !== null) {
        window.clearTimeout(newBadgeTimeoutRef.current);
      }
    };
  }, []);

  const saveFeedState = useCallback(() => {
    writeCachedFeedState({
      tab,
      feedModality,
      feedWindow,
      visibleCount,
      scrollY: window.scrollY,
    });
  }, [tab, feedModality, feedWindow, visibleCount]);

  useEffect(() => {
    window.addEventListener("beforeunload", saveFeedState);
    return () => {
      saveFeedState();
      window.removeEventListener("beforeunload", saveFeedState);
    };
  }, [saveFeedState]);

  const visibleMatches = useMemo(
    () => (tab === "inicio" ? matches.slice(0, visibleCount) : matches),
    [tab, matches, visibleCount],
  );

  const dayGroups = useMemo(
    () => (tab === "inicio" ? groupMatchesByDay(visibleMatches) : []),
    [tab, visibleMatches],
  );

  const nextMineMatch = useMemo(() => (tab === "mis" ? getNextUpcomingMatch(matches) : null), [tab, matches]);

  const nextMineMatchSchedule = useMemo(
    () => (nextMineMatch ? formatFeedSchedule(nextMineMatch.startsAtUtc) : null),
    [nextMineMatch],
  );

  const isNextMineMatchUrgent = useMemo(
    () => (nextMineMatch ? isWithinHours(nextMineMatch.startsAtUtc, 24) : false),
    [nextMineMatch],
  );

  const activeNewBadgeIds = useMemo(() => new Set(newBadgeIds), [newBadgeIds]);

  const hasMore = tab === "inicio" && visibleCount < matches.length;
  const hasActiveFilters = feedModality !== "all" || feedWindow !== "next7";

  return (
    <AppShell>
      <section className="space-y-5">
        <div className="rounded-2xl border border-emerald-200/60 bg-linear-to-br from-emerald-50 to-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100">
              <Zap className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold tracking-tight text-emerald-900">
                Partidos por link, sin caos en WhatsApp
              </h1>
              <p className="mt-1 text-sm leading-relaxed text-emerald-700/80">
                Crea un partido en segundos, comparte el link y mantén los cupos actualizados en tiempo real.
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href={user ? "/crear" : "/login?redirect=/crear"}>
                <Plus className="h-4 w-4" />
                Crear partido
              </Link>
            </Button>
            {!user ? (
              <Button variant="outline" asChild size="lg" className="w-full sm:w-auto">
                <Link href="/login">Iniciar sesión</Link>
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex w-full border-b border-zinc-200">
          {TABS.map(({ value, label }) => (
            <button
              key={value}
              className={`relative min-h-[44px] flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                tab === value ? "text-emerald-700" : "text-zinc-500 hover:text-zinc-700"
              }`}
              onClick={() => setTab(value)}
              type="button"
            >
              {label}
              {tab === value ? (
                <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-emerald-600" />
              ) : null}
            </button>
          ))}
        </div>

        {tab === "inicio" ? (
          <div className="flex flex-wrap items-center gap-2">
            {FEED_MODALITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={feedModality === opt.value}
                className={cn(
                  "min-h-[36px] rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 ring-inset transition-colors",
                  feedModality === opt.value
                    ? "bg-emerald-600 text-white ring-emerald-600"
                    : "bg-white text-zinc-600 ring-zinc-200 hover:bg-zinc-50",
                )}
                onClick={() => setFeedModality(opt.value)}
              >
                {opt.label}
              </button>
            ))}
            <div className="mx-1 h-5 w-px self-center bg-zinc-200" />
            {FEED_TIME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={feedWindow === opt.value}
                className={cn(
                  "min-h-[36px] rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 ring-inset transition-colors",
                  feedWindow === opt.value
                    ? "bg-emerald-600 text-white ring-emerald-600"
                    : "bg-white text-zinc-600 ring-zinc-200 hover:bg-zinc-50",
                )}
                onClick={() => setFeedWindow(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        ) : null}

        {tab === "inicio" && feedReturnBanner ? (
          <Card data-testid="feed-return-banner" className="border-emerald-200 bg-emerald-50/70">
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div className="space-y-1 text-sm text-emerald-900">
                {feedReturnBanner.newCount > 0 ? (
                  <p>
                    Hay {matchesText(feedReturnBanner.newCount, "partido nuevo", "partidos nuevos")}
                  </p>
                ) : null}
                {feedReturnBanner.updatedCount > 0 ? (
                  <p>
                    Se actualizaron {matchesText(feedReturnBanner.updatedCount, "partido", "partidos")}
                  </p>
                ) : null}
              </div>
              <Button
                size="sm"
                data-testid="feed-return-view-btn"
                onClick={() => {
                  window.scrollTo({ top: 0, behavior: "smooth" });
                  setNewBadgeIds(feedReturnBanner.newIds);
                  if (newBadgeTimeoutRef.current !== null) {
                    window.clearTimeout(newBadgeTimeoutRef.current);
                  }
                  newBadgeTimeoutRef.current = window.setTimeout(() => {
                    setNewBadgeIds([]);
                  }, NEW_BADGE_TTL_MS);
                  setFeedReturnBanner(null);
                }}
              >
                Ver
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {tab === "mis" && nextMineMatch ? (
          <Card
            data-testid="mine-next-match-block"
            className={cn(isNextMineMatchUrgent && "border-amber-200 bg-amber-50/40")}
          >
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Próximo partido</CardTitle>
                  <CardDescription>{nextMineMatch.club}</CardDescription>
                </div>
                {mineUpdatedCount > 0 ? (
                  <span
                    data-testid="mine-updated-indicator"
                    className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700"
                  >
                    Actualizado · {mineUpdatedCount}
                  </span>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="pt-0 text-sm text-zinc-600">
              <p>{nextMineMatchSchedule}</p>
              <p className="mt-1">
                Cupos: {nextMineMatch.participants.length}/4
              </p>
              {isNextMineMatchUrgent ? (
                <p className="mt-1 text-xs font-semibold text-amber-700">Empieza en menos de 24h</p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {tab === "mis" && !loading && !user ? (
          <Card>
            <CardHeader className="items-center text-center">
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100">
                <LogIn className="h-5 w-5 text-zinc-500" />
              </div>
              <CardTitle>Inicia sesión para ver tus partidos</CardTitle>
              <CardDescription>Podrás gestionar tus partidos creados y confirmados.</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <Button asChild size="lg" className="w-full">
                <Link href="/login?redirect=/">
                  <LogIn className="h-4 w-4" />
                  Iniciar sesión
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }, (_, i) => (
              <MatchCardSkeleton key={i} />
            ))}
          </div>
        ) : null}

        {error ? (
          <div className="flex items-start gap-2 rounded-xl bg-rose-50 p-3.5 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {!isLoading && !error && matches.length === 0 && tab === "inicio" ? (
          <Card>
            <CardHeader className="items-center text-center">
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100">
                <CalendarX2 className="h-5 w-5 text-zinc-400" />
              </div>
              <CardTitle>No hay partidos abiertos en este rango</CardTitle>
              <CardDescription>Ajusta los filtros para ver más opciones disponibles.</CardDescription>
            </CardHeader>
            {hasActiveFilters ? (
              <CardContent className="flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => {
                    setFeedModality("all");
                    setFeedWindow("next7");
                  }}
                >
                  Quitar filtros
                </Button>
              </CardContent>
            ) : null}
          </Card>
        ) : null}

        {!isLoading && !error && matches.length === 0 && tab === "mis" && user ? (
          <Card>
            <CardHeader className="items-center text-center">
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100">
                <CalendarX2 className="h-5 w-5 text-zinc-400" />
              </div>
              <CardTitle>No hay partidos todavía</CardTitle>
              <CardDescription>Crea uno y compártelo por WhatsApp para empezar.</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <Button asChild size="lg" className="w-full">
                <Link href={user ? "/crear" : "/login?redirect=/crear"}>
                  <Plus className="h-4 w-4" />
                  Crear partido
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {!isLoading && !error && matches.length > 0 && tab === "inicio" ? (
          <div className="space-y-5">
            {dayGroups.map((group) => (
              <div key={group.dateKey} className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{group.label}</h3>
                {group.matches.map((match) => (
                  <OpenMatchCard
                    key={match.publicId}
                    match={match}
                    isNew={activeNewBadgeIds.has(match.publicId)}
                    isHighlighted={activeNewBadgeIds.has(match.publicId)}
                  />
                ))}
              </div>
            ))}

            {hasMore ? (
              <div className="flex justify-center pt-2">
                <Button variant="outline" onClick={() => setVisibleCount((prev) => prev + FEED_PAGE_SIZE)}>
                  Cargar más
                </Button>
              </div>
            ) : matches.length > FEED_PAGE_SIZE ? (
              <p className="pt-2 text-center text-sm text-zinc-400">No hay más partidos</p>
            ) : null}
          </div>
        ) : null}

        {!isLoading && !error && matches.length > 0 && tab === "mis" ? (
          <div className="space-y-3">
            {matches.map((match) => (
              <MatchCard key={match.publicId} match={match} />
            ))}
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
