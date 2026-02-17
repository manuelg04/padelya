"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { useAuth } from "@/src/components/auth/auth-provider";
import { AppShell } from "@/src/components/layout/app-shell";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import type {
  AdminClubMembership,
  AdminTournamentsResponse,
  CreateTournamentInput,
  TournamentCompetitionMode,
} from "@/src/domain/types";
import { createTournament, listAdminTournamentClubs, listAdminTournaments } from "@/src/lib/api/client";
import { ENABLE_CONVEX_REALTIME } from "@/src/lib/env";
import { toErrorMessage } from "@/src/lib/utils";

type CategoryDraft = {
  name: string;
  competitionMode: TournamentCompetitionMode;
  capacity: number;
  note: string;
};

function nextWeekDateLocal(): string {
  const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const iso = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000).toISOString();
  return iso.slice(0, 10);
}

function AdminTournamentsContent({
  clubs,
  tournamentsResult,
  selectedClubSlug,
  setSelectedClubSlug,
  onCreateTournament,
  isSubmitting,
  error,
  success,
  name,
  setName,
  startsAtDate,
  setStartsAtDate,
  startsAtTime,
  setStartsAtTime,
  description,
  setDescription,
  priceInfo,
  setPriceInfo,
  prizes,
  setPrizes,
  posterUrl,
  setPosterUrl,
  categories,
  setCategories,
}: {
  clubs: AdminClubMembership[];
  tournamentsResult: AdminTournamentsResponse | null;
  selectedClubSlug: string;
  setSelectedClubSlug: (value: string) => void;
  onCreateTournament: () => Promise<void>;
  isSubmitting: boolean;
  error: string | null;
  success: string | null;
  name: string;
  setName: (value: string) => void;
  startsAtDate: string;
  setStartsAtDate: (value: string) => void;
  startsAtTime: string;
  setStartsAtTime: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  priceInfo: string;
  setPriceInfo: (value: string) => void;
  prizes: string;
  setPrizes: (value: string) => void;
  posterUrl: string;
  setPosterUrl: (value: string) => void;
  categories: CategoryDraft[];
  setCategories: (value: CategoryDraft[]) => void;
}) {
  async function copyCategoryLink(tournamentSlug: string, categorySlug: string) {
    if (typeof window === "undefined" || !window.navigator?.clipboard) {
      return;
    }
    const url = `${window.location.origin}/torneos/${encodeURIComponent(tournamentSlug)}/categorias/${encodeURIComponent(categorySlug)}`;
    await window.navigator.clipboard.writeText(url);
  }

  return (
    <AppShell>
      <section className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Admin Torneos</CardTitle>
            <CardDescription>Crear torneos y gestionar categorías por club.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {error ? <p className="text-sm text-rose-700">{error}</p> : null}
            {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

            <div className="space-y-1.5">
              <Label htmlFor="admin-tournament-club">Club</Label>
              <select
                data-testid="admin-tournament-club"
                id="admin-tournament-club"
                name="adminTournamentClub"
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm"
                value={selectedClubSlug}
                onChange={(event) => setSelectedClubSlug(event.target.value)}
              >
                {clubs.map((club) => (
                  <option key={club.clubSlug} value={club.clubSlug}>
                    {club.clubName} ({club.role})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="admin-tournament-name">Nombre torneo</Label>
              <Input
                data-testid="admin-tournament-name"
                id="admin-tournament-name"
                name="adminTournamentName"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="admin-tournament-start-date">Fecha</Label>
                <Input
                  data-testid="admin-tournament-start-date"
                  id="admin-tournament-start-date"
                  name="adminTournamentStartDate"
                  type="date"
                  value={startsAtDate}
                  onChange={(event) => setStartsAtDate(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="admin-tournament-start-time">Hora de inicio (opcional)</Label>
                <Input
                  data-testid="admin-tournament-start-time"
                  id="admin-tournament-start-time"
                  name="adminTournamentStartTime"
                  type="time"
                  value={startsAtTime}
                  onChange={(event) => setStartsAtTime(event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-tournament-description">Descripción</Label>
              <Input
                data-testid="admin-tournament-description"
                id="admin-tournament-description"
                name="adminTournamentDescription"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-tournament-price-info">Precio informativo</Label>
              <Input
                data-testid="admin-tournament-price-info"
                id="admin-tournament-price-info"
                name="adminTournamentPriceInfo"
                value={priceInfo}
                onChange={(event) => setPriceInfo(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-tournament-prizes">Premios</Label>
              <Input
                data-testid="admin-tournament-prizes"
                id="admin-tournament-prizes"
                name="adminTournamentPrizes"
                value={prizes}
                onChange={(event) => setPrizes(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-tournament-poster-url">Poster URL (opcional)</Label>
              <Input
                data-testid="admin-tournament-poster-url"
                id="admin-tournament-poster-url"
                name="adminTournamentPosterUrl"
                value={posterUrl}
                onChange={(event) => setPosterUrl(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Categorías</Label>
              {categories.map((category, index) => (
                <div key={index} className="space-y-2 rounded-lg border border-zinc-200 p-3">
                  <Label className="sr-only" htmlFor={`admin-tournament-category-name-${index}`}>
                    Nombre categoría {index + 1}
                  </Label>
                  <Input
                    data-testid={`admin-tournament-category-name-${index}`}
                    id={`admin-tournament-category-name-${index}`}
                    name={`adminTournamentCategoryName${index}`}
                    placeholder="Nombre categoría"
                    value={category.name}
                    onChange={(event) => {
                      const next = [...categories];
                      next[index] = { ...next[index]!, name: event.target.value };
                      setCategories(next);
                    }}
                  />
                  <Label className="sr-only" htmlFor={`admin-tournament-category-mode-${index}`}>
                    Modo categoría {index + 1}
                  </Label>
                  <select
                    data-testid={`admin-tournament-category-mode-${index}`}
                    id={`admin-tournament-category-mode-${index}`}
                    name={`adminTournamentCategoryMode${index}`}
                    className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm"
                    value={category.competitionMode}
                    onChange={(event) => {
                      const next = [...categories];
                      next[index] = {
                        ...next[index]!,
                        competitionMode: event.target.value as TournamentCompetitionMode,
                      };
                      setCategories(next);
                    }}
                  >
                    <option value="groups">Grupos</option>
                    <option value="free">Libre</option>
                  </select>
                  <Label className="sr-only" htmlFor={`admin-tournament-category-capacity-${index}`}>
                    Cupo categoría {index + 1}
                  </Label>
                  <Input
                    data-testid={`admin-tournament-category-capacity-${index}`}
                    id={`admin-tournament-category-capacity-${index}`}
                    name={`adminTournamentCategoryCapacity${index}`}
                    type="number"
                    min={1}
                    value={category.capacity}
                    onChange={(event) => {
                      const next = [...categories];
                      next[index] = { ...next[index]!, capacity: Number(event.target.value) };
                      setCategories(next);
                    }}
                  />
                  <Label className="sr-only" htmlFor={`admin-tournament-category-note-${index}`}>
                    Nota categoría {index + 1}
                  </Label>
                  <Input
                    data-testid={`admin-tournament-category-note-${index}`}
                    id={`admin-tournament-category-note-${index}`}
                    name={`adminTournamentCategoryNote${index}`}
                    placeholder="Nota"
                    value={category.note}
                    onChange={(event) => {
                      const next = [...categories];
                      next[index] = { ...next[index]!, note: event.target.value };
                      setCategories(next);
                    }}
                  />
                </div>
              ))}
              <Button
                data-testid="admin-tournament-add-category-btn"
                type="button"
                variant="outline"
                className="w-full"
                onClick={() =>
                  setCategories([...categories, { name: "", competitionMode: "groups", capacity: 16, note: "" }])
                }
              >
                Agregar categoría
              </Button>
            </div>

            <Button
              data-testid="admin-tournament-create-btn"
              className="w-full"
              onClick={() => void onCreateTournament()}
              disabled={
                isSubmitting ||
                !selectedClubSlug ||
                !name.trim() ||
                !startsAtDate ||
                !description.trim() ||
                categories.some((category) => !category.name.trim())
              }
            >
              {isSubmitting ? "Creando..." : "Crear torneo"}
            </Button>
          </CardContent>
        </Card>

        {tournamentsResult ? (
          <section className="space-y-3">
            {tournamentsResult.tournaments.map((tournament) => (
              <Card key={tournament.id}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{tournament.name}</CardTitle>
                  <CardDescription>{tournament.startsAtUtc}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-zinc-600">{tournament.description}</p>
                  {tournament.categories.map((category) => (
                    <div key={category.slug} className="space-y-2">
                      <Button variant="outline" className="w-full" asChild>
                        <Link href={`/admin/torneos/${tournament.slug}/categorias/${category.slug}`}>
                          {category.name} · {category.competitionMode === "free" ? "Libre" : "Grupos"} · Cupo{" "}
                          {category.capacity}
                        </Link>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={() => void copyCategoryLink(tournament.slug, category.slug)}
                      >
                        Copiar link de inscripción
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </section>
        ) : null}
      </section>
    </AppShell>
  );
}

function useCreateForm() {
  const [name, setName] = useState("");
  const [startsAtDate, setStartsAtDate] = useState(nextWeekDateLocal());
  const [startsAtTime, setStartsAtTime] = useState("");
  const [description, setDescription] = useState("");
  const [priceInfo, setPriceInfo] = useState("");
  const [prizes, setPrizes] = useState("");
  const [posterUrl, setPosterUrl] = useState("");
  const [categories, setCategories] = useState<CategoryDraft[]>([
    { name: "", competitionMode: "groups", capacity: 16, note: "" },
  ]);
  const reset = () => {
    setName("");
    setStartsAtDate(nextWeekDateLocal());
    setStartsAtTime("");
    setDescription("");
    setPriceInfo("");
    setPrizes("");
    setPosterUrl("");
    setCategories([{ name: "", competitionMode: "groups", capacity: 16, note: "" }]);
  };

  return {
    name,
    setName,
    startsAtDate,
    setStartsAtDate,
    startsAtTime,
    setStartsAtTime,
    description,
    setDescription,
    priceInfo,
    setPriceInfo,
    prizes,
    setPrizes,
    posterUrl,
    setPosterUrl,
    categories,
    setCategories,
    reset,
  };
}

function ConvexAdminTournamentsPage() {
  const { token, loading } = useAuth();
  const router = useRouter();
  const clubsQuery = useQuery(api.tournaments.listAdminClubs, token ? {} : "skip");
  const clubs = useMemo(() => clubsQuery ?? [], [clubsQuery]);
  const [selectedClubSlug, setSelectedClubSlug] = useState("");
  const tournamentsResult = useQuery(
    api.tournaments.listAdminTournaments,
    token && selectedClubSlug ? { clubSlug: selectedClubSlug } : "skip",
  );

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const form = useCreateForm();

  useEffect(() => {
    if (!loading && !token) {
      router.replace(`/login?redirect=${encodeURIComponent("/admin/torneos")}`);
    }
  }, [loading, router, token]);

  useEffect(() => {
    if (!selectedClubSlug && clubs.length > 0) {
      setSelectedClubSlug(clubs[0]!.clubSlug);
    }
  }, [clubs, selectedClubSlug]);

  async function onCreateTournament() {
    if (!token || !selectedClubSlug) {
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      setSuccess(null);

      const input: CreateTournamentInput = {
        clubSlug: selectedClubSlug,
        name: form.name,
        startsAtDate: form.startsAtDate,
        startsAtTime: form.startsAtTime || undefined,
        description: form.description,
        priceInfo: form.priceInfo,
        prizes: form.prizes,
        posterUrl: form.posterUrl,
        categories: form.categories.map((category) => ({
          name: category.name,
          competitionMode: category.competitionMode,
          capacity: category.capacity,
          note: category.note || undefined,
        })),
      };

      const created = await createTournament(token, input);
      setSuccess(`Torneo creado: ${created.tournamentSlug}`);
      form.reset();
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AdminTournamentsContent
      clubs={clubs}
      tournamentsResult={tournamentsResult ?? null}
      selectedClubSlug={selectedClubSlug}
      setSelectedClubSlug={setSelectedClubSlug}
      onCreateTournament={onCreateTournament}
      isSubmitting={isSubmitting}
      error={error}
      success={success}
      {...form}
    />
  );
}

function MockAdminTournamentsPage() {
  const { token, loading } = useAuth();
  const router = useRouter();

  const [clubs, setClubs] = useState<AdminClubMembership[]>([]);
  const [tournamentsResult, setTournamentsResult] = useState<AdminTournamentsResponse | null>(null);
  const [selectedClubSlug, setSelectedClubSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const form = useCreateForm();

  useEffect(() => {
    if (!loading && !token) {
      router.replace(`/login?redirect=${encodeURIComponent("/admin/torneos")}`);
    }
  }, [loading, router, token]);

  const load = useCallback(async () => {
    if (!token) {
      return;
    }
    const nextClubs = await listAdminTournamentClubs(token);
    setClubs(nextClubs);

    const clubSlug = selectedClubSlug || nextClubs[0]?.clubSlug;
    if (clubSlug) {
      setSelectedClubSlug(clubSlug);
      const next = await listAdminTournaments(token, clubSlug);
      setTournamentsResult(next);
    } else {
      setTournamentsResult(null);
    }
  }, [selectedClubSlug, token]);

  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        await load();
      } catch (nextError) {
        if (!disposed) {
          setError(toErrorMessage(nextError));
        }
      }
    })();

    return () => {
      disposed = true;
    };
  }, [load]);

  async function onCreateTournament() {
    if (!token || !selectedClubSlug) {
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      setSuccess(null);
      const input: CreateTournamentInput = {
        clubSlug: selectedClubSlug,
        name: form.name,
        startsAtDate: form.startsAtDate,
        startsAtTime: form.startsAtTime || undefined,
        description: form.description,
        priceInfo: form.priceInfo,
        prizes: form.prizes,
        posterUrl: form.posterUrl,
        categories: form.categories.map((category) => ({
          name: category.name,
          competitionMode: category.competitionMode,
          capacity: category.capacity,
          note: category.note || undefined,
        })),
      };
      const created = await createTournament(token, input);
      setSuccess(`Torneo creado: ${created.tournamentSlug}`);
      form.reset();
      await load();
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function onChangeClub(nextClubSlug: string) {
    setSelectedClubSlug(nextClubSlug);
    if (!token) {
      return;
    }
    try {
      const next = await listAdminTournaments(token, nextClubSlug);
      setTournamentsResult(next);
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    }
  }

  return (
    <AdminTournamentsContent
      clubs={clubs}
      tournamentsResult={tournamentsResult}
      selectedClubSlug={selectedClubSlug}
      setSelectedClubSlug={(value) => void onChangeClub(value)}
      onCreateTournament={onCreateTournament}
      isSubmitting={isSubmitting}
      error={error}
      success={success}
      {...form}
    />
  );
}

export default function AdminTournamentsPage() {
  if (ENABLE_CONVEX_REALTIME) {
    return <ConvexAdminTournamentsPage />;
  }
  return <MockAdminTournamentsPage />;
}
