"use client";

import { es } from "date-fns/locale";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3, Loader2, MapPin, Plus, Tag, Users, XCircle } from "lucide-react";

import { useAuth } from "@/src/components/auth/auth-provider";
import { AppShell } from "@/src/components/layout/app-shell";
import { Button } from "@/src/components/ui/button";
import { Calendar } from "@/src/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Separator } from "@/src/components/ui/separator";
import { isFutureBogotaLocalDateTime } from "@/src/domain/match";
import type { Modality } from "@/src/domain/types";
import { createMatch } from "@/src/lib/api/client";
import { toErrorMessage } from "@/src/lib/utils";

const MODALITY_OPTIONS: { value: Modality; label: string }[] = [
  { value: "mixto", label: "Mixto" },
  { value: "masc", label: "Masculino" },
  { value: "fem", label: "Femenino" },
];

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => {
  const start = String(hour).padStart(2, "0");
  const end = String((hour + 1) % 24).padStart(2, "0");
  return {
    value: start,
    label: `${start}:00 - ${end}:00`,
  };
});

const DATE_PRESETS = [
  { id: "today", label: "Hoy", offsetDays: 0 },
  { id: "tomorrow", label: "Mañana", offsetDays: 1 },
  { id: "in2days", label: "Pasado mañana", offsetDays: 2 },
] as const;

function getBogotaDateParts(date: Date): { year: string; month: string; day: string } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: byType.year,
    month: byType.month,
    day: byType.day,
  };
}

function getBogotaNowParts(date: Date): { dateKey: string; hour: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = Number(byType.hour) % 24;

  return {
    dateKey: `${byType.year}-${byType.month}-${byType.day}`,
    hour,
  };
}

function toBogotaDateKey(date: Date): string {
  const { year, month, day } = getBogotaDateParts(date);
  return `${year}-${month}-${day}`;
}

function fromBogotaDateKey(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00-05:00`);
}

function addBogotaDays(dateKey: string, offsetDays: number): string {
  const date = new Date(`${dateKey}T12:00:00-05:00`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return toBogotaDateKey(date);
}

function formatBogotaDateLabel(dateKey: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${dateKey}T12:00:00-05:00`));
}

export default function CreateMatchPage() {
  const { loading, token, user } = useAuth();
  const router = useRouter();

  const [club, setClub] = useState("");
  const [selectedDateKey, setSelectedDateKey] = useState<string>("");
  const [selectedHour, setSelectedHour] = useState("");
  const [showCalendar, setShowCalendar] = useState(false);
  const [category, setCategory] = useState("");
  const [modality, setModality] = useState<Modality>("mixto");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && !token) {
      router.replace("/login?redirect=/crear");
      return;
    }
    if (!loading && user && !user.alias) {
      router.replace("/perfil?redirect=/crear");
    }
  }, [loading, token, user, router]);

  useEffect(() => {
    const now = getBogotaNowParts(new Date());
    let dateKey = now.dateKey;
    let nextHour = now.hour + 1;
    if (nextHour >= 24) {
      nextHour = 0;
      dateKey = addBogotaDays(dateKey, 1);
    }
    setSelectedDateKey(dateKey);
    setSelectedHour(String(nextHour).padStart(2, "0"));
  }, []);

  const nowParts = useMemo(() => getBogotaNowParts(new Date()), []);
  const startsAtLocal = selectedDateKey && selectedHour ? `${selectedDateKey}T${selectedHour}:00` : "";
  const selectedDate = selectedDateKey ? fromBogotaDateKey(selectedDateKey) : undefined;
  const isDateToday = selectedDateKey === nowParts.dateKey;

  const hourOptions = HOUR_OPTIONS.map((option) => ({
    ...option,
    isDisabled: isDateToday && Number(option.value) <= nowParts.hour,
  }));

  useEffect(() => {
    if (!selectedDateKey) {
      return;
    }
    const hasValidSelectedHour = hourOptions.some(
      (option) => option.value === selectedHour && !option.isDisabled,
    );
    if (!hasValidSelectedHour) {
      const firstAvailableHour = hourOptions.find((option) => !option.isDisabled);
      setSelectedHour(firstAvailableHour?.value ?? "");
    }
  }, [hourOptions, selectedDateKey, selectedHour]);

  function setDateByPreset(offsetDays: number) {
    const nextDateKey = addBogotaDays(nowParts.dateKey, offsetDays);
    setSelectedDateKey(nextDateKey);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      router.push("/login?redirect=/crear");
      return;
    }
    if (!startsAtLocal || !isFutureBogotaLocalDateTime(startsAtLocal)) {
      setError("Selecciona una fecha futura en bloques exactos de 1 hora.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      const match = await createMatch(token, {
        club,
        startsAtLocal,
        category,
        modality,
      });
      router.push(`/partido/${match.publicId}`);
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AppShell>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Crear partido</CardTitle>
          <CardDescription>Completa los datos y comparte el link en tu grupo de WhatsApp.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="club" className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-zinc-400" />
                Club
              </Label>
              <Input
                id="club"
                value={club}
                onChange={(event) => setClub(event.target.value)}
                placeholder="Padel Norte"
                required
              />
            </div>

            <div className="space-y-3">
              <Label className="flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5 text-zinc-400" />
                Fecha y hora
              </Label>

              <div className="grid grid-cols-3 gap-2">
                {DATE_PRESETS.map((preset) => {
                  const dateKey = addBogotaDays(nowParts.dateKey, preset.offsetDays);
                  return (
                    <Button
                      key={preset.id}
                      type="button"
                      variant={selectedDateKey === dateKey ? "default" : "outline"}
                      className="min-h-[40px]"
                      onClick={() => setDateByPreset(preset.offsetDays)}
                      data-testid={`date-preset-${preset.id}`}
                    >
                      {preset.label}
                    </Button>
                  );
                })}
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full justify-start text-left font-medium"
                onClick={() => setShowCalendar((previous) => !previous)}
                data-testid="create-date-trigger"
              >
                <CalendarDays className="h-4 w-4 text-emerald-600" />
                {selectedDateKey ? formatBogotaDateLabel(selectedDateKey) : "Selecciona una fecha"}
              </Button>

              {showCalendar ? (
                <div className="rounded-xl border border-zinc-200 bg-white p-2 shadow-sm">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(value) => {
                      if (!value) {
                        return;
                      }
                      setSelectedDateKey(toBogotaDateKey(value));
                    }}
                    disabled={(date) => toBogotaDateKey(date) < nowParts.dateKey}
                    locale={es}
                    className="mx-auto [--cell-size:2.6rem] sm:[--cell-size:2.8rem]"
                    timeZone="America/Bogota"
                    captionLayout="dropdown"
                    startMonth={new Date(`${nowParts.dateKey}T00:00:00-05:00`)}
                  />
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="hour-slot" className="flex items-center gap-1.5">
                  <Clock3 className="h-3.5 w-3.5 text-zinc-400" />
                  Bloque horario (1 hora)
                </Label>
                <select
                  id="hour-slot"
                  aria-label="Bloque horario"
                  className="flex min-h-[44px] w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  value={selectedHour}
                  onChange={(event) => setSelectedHour(event.target.value)}
                  data-testid="hour-slot-select"
                  required
                >
                  <option value="" disabled>
                    Selecciona una hora
                  </option>
                  {hourOptions.map((option) => (
                    <option key={option.value} value={option.value} disabled={option.isDisabled}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <p className="text-xs text-zinc-500">
                Zona horaria: Bogotá (GMT-5). Solo se permiten horarios futuros en punto.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category" className="flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5 text-zinc-400" />
                Categoría
              </Label>
              <Input
                id="category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                placeholder="4ta"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="modality" className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-zinc-400" />
                Modalidad
              </Label>
              <select
                id="modality"
                className="flex min-h-[44px] w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                value={modality}
                onChange={(event) => setModality(event.target.value as Modality)}
              >
                {MODALITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {error ? (
              <div className="flex items-start gap-2 rounded-xl bg-rose-50 p-3.5 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}

            <Separator />

            <Button className="w-full" type="submit" size="lg" disabled={isSubmitting} data-testid="create-match-btn">
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {isSubmitting ? "Creando partido..." : "Crear partido"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </AppShell>
  );
}
