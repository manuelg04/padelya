"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, Save, User, XCircle } from "lucide-react";

import { useAuth } from "@/src/components/auth/auth-provider";
import { AppShell } from "@/src/components/layout/app-shell";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Separator } from "@/src/components/ui/separator";
import { toErrorMessage } from "@/src/lib/utils";

const MIN_ALIAS_LENGTH = 3;
const MAX_ALIAS_LENGTH = 24;

export default function ProfilePage() {
  const { loading, user, saveAlias } = useAuth();
  const router = useRouter();
  const [redirect, setRedirect] = useState("/");
  const [alias, setAlias] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setRedirect(params.get("redirect") ?? "/");
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/login?redirect=${encodeURIComponent(`/perfil?redirect=${redirect}`)}`);
      return;
    }
    if (user?.alias) {
      setAlias(user.alias);
    }
  }, [loading, user, router, redirect]);

  async function onSaveAlias() {
    try {
      setIsSaving(true);
      setError(null);
      await saveAlias(alias);
      router.replace(redirect);
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    } finally {
      setIsSaving(false);
    }
  }

  const trimmedLength = alias.trim().length;
  const isValidLength = trimmedLength >= MIN_ALIAS_LENGTH && trimmedLength <= MAX_ALIAS_LENGTH;

  return (
    <AppShell>
      <Card>
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
            <User className="h-6 w-6 text-emerald-600" />
          </div>
          <CardTitle className="text-xl">Tu alias de jugador</CardTitle>
          <CardDescription>Este nombre aparecerá en la lista de confirmados del partido.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="alias" className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-zinc-400" />
              Alias
            </Label>
            <Input
              id="alias"
              value={alias}
              onChange={(event) => setAlias(event.target.value)}
              placeholder="Ej: Manu"
              maxLength={MAX_ALIAS_LENGTH}
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-zinc-500">
                {MIN_ALIAS_LENGTH}-{MAX_ALIAS_LENGTH} caracteres. Letras, números y espacios.
              </p>
              <span
                className={`text-xs font-medium tabular-nums ${
                  trimmedLength > 0 && !isValidLength ? "text-rose-500" : "text-zinc-400"
                }`}
              >
                {trimmedLength}/{MAX_ALIAS_LENGTH}
              </span>
            </div>
          </div>

          {error ? (
            <div className="flex items-start gap-2 rounded-xl bg-rose-50 p-3.5 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <Separator />

          <Button className="w-full" size="lg" onClick={onSaveAlias} disabled={isSaving || !isValidLength}>
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isSaving ? "Guardando..." : "Guardar alias"}
          </Button>
        </CardContent>
      </Card>
    </AppShell>
  );
}
