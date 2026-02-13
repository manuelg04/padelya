"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarX2, LogIn, Plus, XCircle, Zap } from "lucide-react";

import { useAuth } from "@/src/components/auth/auth-provider";
import { MatchCard } from "@/src/components/features/match-card";
import { OpenMatchCard } from "@/src/components/features/open-match-card";
import { AppShell } from "@/src/components/layout/app-shell";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Label } from "@/src/components/ui/label";
import { Skeleton } from "@/src/components/ui/skeleton";
import type { MatchView, Modality, OpenFeedWindow } from "@/src/domain/types";
import { listMatches } from "@/src/lib/api/client";
import { toErrorMessage } from "@/src/lib/utils";

type HomeTab = "inicio" | "mis";
type FeedModalityFilter = "all" | Modality;

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
  { value: "next7", label: "Próximos 7 días" },
];

function MatchCardSkeleton() {
  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm space-y-3">
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

export default function HomePage() {
  const { loading, token, user } = useAuth();
  const [tab, setTab] = useState<HomeTab>("inicio");
  const [feedModality, setFeedModality] = useState<FeedModalityFilter>("all");
  const [feedWindow, setFeedWindow] = useState<OpenFeedWindow>("next7");
  const [matches, setMatches] = useState<MatchView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const mineToken = tab === "mis" ? token : null;

  useEffect(() => {
    let disposed = false;

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
          if (!disposed) {
            setMatches(myMatches);
          }
          return;
        }

        const openMatches = await listMatches({
          open: true,
          modality: feedModality === "all" ? undefined : feedModality,
          window: feedWindow,
        });
        if (!disposed) {
          setMatches(openMatches);
        }
      } catch (nextError) {
        if (!disposed) {
          setError(toErrorMessage(nextError));
        }
      } finally {
        if (!disposed) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      disposed = true;
    };
  }, [tab, mineToken, feedModality, feedWindow]);

  const MatchListItem = tab === "inicio" ? OpenMatchCard : MatchCard;

  return (
    <AppShell>
      <section className="space-y-5">
        {/* Hero banner */}
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

        {/* Tabs */}
        <div className="flex w-full border-b border-zinc-200">
          {TABS.map(({ value, label }) => (
            <button
              key={value}
              className={`relative min-h-[44px] flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                tab === value
                  ? "text-emerald-700"
                  : "text-zinc-500 hover:text-zinc-700"
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
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Partidos abiertos</CardTitle>
              <CardDescription>Vista pública en modo lectura para descubrir partidos con cupos disponibles.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="feed-modality">Modalidad</Label>
                  <select
                    id="feed-modality"
                    className="flex min-h-[44px] w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                    value={feedModality}
                    onChange={(event) => setFeedModality(event.target.value as FeedModalityFilter)}
                  >
                    {FEED_MODALITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="feed-window">Tiempo</Label>
                  <select
                    id="feed-window"
                    className="flex min-h-[44px] w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                    value={feedWindow}
                    onChange={(event) => setFeedWindow(event.target.value as OpenFeedWindow)}
                  >
                    {FEED_TIME_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Login prompt for "Mis partidos" */}
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

        {/* Loading skeletons */}
        {isLoading ? (
          <div className="space-y-3">
            <MatchCardSkeleton />
            <MatchCardSkeleton />
            <MatchCardSkeleton />
          </div>
        ) : null}

        {/* Error state */}
        {error ? (
          <div className="flex items-start gap-2 rounded-xl bg-rose-50 p-3.5 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {/* Empty state */}
        {!isLoading && !error && matches.length === 0 && tab === "inicio" ? (
          <Card>
            <CardHeader className="items-center text-center">
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100">
                <CalendarX2 className="h-5 w-5 text-zinc-400" />
              </div>
              <CardTitle>No hay partidos abiertos en este rango</CardTitle>
              <CardDescription>Ajusta los filtros para ver más opciones disponibles.</CardDescription>
            </CardHeader>
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

        {!isLoading && !error && matches.length > 0 ? (
          <div className="space-y-3">
            {matches.map((match) => (
              <MatchListItem key={match.publicId} match={match} />
            ))}
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
