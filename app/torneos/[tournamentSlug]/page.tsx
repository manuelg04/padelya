"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { AppShell } from "@/src/components/layout/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import type { PublicTournamentDetail } from "@/src/domain/types";
import { getTournamentBySlug } from "@/src/lib/api/client";
import { ENABLE_CONVEX_REALTIME } from "@/src/lib/env";
import { toErrorMessage } from "@/src/lib/utils";

function LoadingView() {
  return (
    <AppShell>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-4 w-56" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    </AppShell>
  );
}

function TournamentContent({ data }: { data: PublicTournamentDetail }) {
  return (
    <AppShell>
      <section className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{data.tournament.name}</CardTitle>
            <CardDescription>{data.club.name}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-zinc-700">
            <p>{data.tournament.description}</p>
            {data.tournament.prizes ? <p><strong>Premios:</strong> {data.tournament.prizes}</p> : null}
            {data.tournament.priceInfo ? <p><strong>Precio:</strong> {data.tournament.priceInfo}</p> : null}
            <Button className="mt-2" asChild>
              <a href="#categorias">Ver categorías</a>
            </Button>
          </CardContent>
        </Card>

        <section id="categorias" className="space-y-3">
          {data.categories.map((category) => (
            <Card key={category.id}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{category.name}</CardTitle>
                <CardDescription>
                  Cupos disponibles {category.slotsRemaining} · Con pago confirmado {category.counts.confirmed}/{category.capacity} · Sin pago confirmado {category.counts.pending}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {category.note ? <p className="text-sm text-zinc-600">{category.note}</p> : null}
                <Button className="w-full" asChild>
                  <Link href={`/torneos/${data.tournament.slug}/categorias/${category.slug}`}>
                    {category.competitionMode === "free" ? "Modo libre" : "Fase de grupos"} · Inscribirme
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </section>
      </section>
    </AppShell>
  );
}

function ConvexTournamentLandingPage() {
  const params = useParams<{ tournamentSlug: string }>();
  const tournamentSlug = decodeURIComponent(params.tournamentSlug ?? "");
  const data = useQuery(api.tournaments.getTournamentBySlug, { tournamentSlug });

  if (data === undefined) {
    return <LoadingView />;
  }

  return <TournamentContent data={data} />;
}

function MockTournamentLandingPage() {
  const params = useParams<{ tournamentSlug: string }>();
  const tournamentSlug = decodeURIComponent(params.tournamentSlug ?? "");

  const [data, setData] = useState<PublicTournamentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        setLoading(true);
        setError(null);
        const next = await getTournamentBySlug(tournamentSlug);
        if (!disposed) {
          setData(next);
        }
      } catch (nextError) {
        if (!disposed) {
          setError(toErrorMessage(nextError));
        }
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    })();

    return () => {
      disposed = true;
    };
  }, [tournamentSlug]);

  if (loading) {
    return <LoadingView />;
  }

  if (error || !data) {
    return (
      <AppShell>
        <Card>
          <CardContent className="py-5 text-sm text-rose-700">{error ?? "No se encontró el torneo."}</CardContent>
        </Card>
      </AppShell>
    );
  }

  return <TournamentContent data={data} />;
}

export default function TournamentLandingPage() {
  if (ENABLE_CONVEX_REALTIME) {
    return <ConvexTournamentLandingPage />;
  }
  return <MockTournamentLandingPage />;
}
