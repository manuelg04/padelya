"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Camera, Loader2, Save, Trash2, User, XCircle } from "lucide-react";

import { useAuth } from "@/src/components/auth/auth-provider";
import { AppShell } from "@/src/components/layout/app-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/src/components/ui/avatar";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Separator } from "@/src/components/ui/separator";
import { getAvatarInitials, validateAvatarFile } from "@/src/lib/avatar";
import { USE_MOCK_BACKEND } from "@/src/lib/env";
import { toErrorMessage } from "@/src/lib/utils";

const MIN_ALIAS_LENGTH = 3;
const MAX_ALIAS_LENGTH = 24;

export default function ProfilePage() {
  const { loading, user, saveAlias, uploadAvatar, removeAvatar } = useAuth();
  const router = useRouter();
  const [redirect, setRedirect] = useState("/");
  const [alias, setAlias] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isRemovingAvatar, setIsRemovingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function onSelectAvatarFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    const fileError = validateAvatarFile(file);
    if (fileError) {
      setError(fileError);
      return;
    }

    try {
      setIsUploading(true);
      setError(null);
      await uploadAvatar(file);
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    } finally {
      setIsUploading(false);
    }
  }

  async function onRemoveAvatar() {
    try {
      setIsRemovingAvatar(true);
      setError(null);
      await removeAvatar();
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    } finally {
      setIsRemovingAvatar(false);
    }
  }

  const trimmedLength = alias.trim().length;
  const isValidLength = trimmedLength >= MIN_ALIAS_LENGTH && trimmedLength <= MAX_ALIAS_LENGTH;
  const initials = getAvatarInitials(user?.alias ?? alias);

  return (
    <AppShell>
      <Card>
        <CardHeader className="items-center text-center">
          <Avatar size="lg" className="mb-2 ring-2 ring-emerald-200/80">
            <AvatarImage src={user?.avatarUrl ?? undefined} alt={user?.alias ?? "Jugador"} />
            <AvatarFallback className="text-sm">{initials}</AvatarFallback>
          </Avatar>
          <CardTitle className="text-xl">Tu perfil de jugador</CardTitle>
          <CardDescription>Tu alias siempre es obligatorio. La foto es opcional.</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-800">Foto de perfil (opcional)</h3>
            </div>

            {!USE_MOCK_BACKEND ? (
              <>
                <input
                  ref={fileInputRef}
                  id="avatar-file"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={onSelectAvatarFile}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading || isRemovingAvatar || isSaving}
                  >
                    {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                    {isUploading ? "Subiendo..." : "Agregar foto"}
                  </Button>

                  {user?.avatarUrl ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={onRemoveAvatar}
                      disabled={isUploading || isRemovingAvatar || isSaving}
                    >
                      {isRemovingAvatar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      {isRemovingAvatar ? "Eliminando..." : "Eliminar foto"}
                    </Button>
                  ) : null}
                </div>
                <p className="text-xs text-zinc-500">Formatos: JPG, PNG, WEBP. Tamaño máximo: 3MB.</p>
              </>
            ) : (
              <p className="text-xs text-zinc-500">Foto disponible con backend Convex.</p>
            )}
          </div>

          <Separator />

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
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isSaving ? "Guardando..." : "Guardar alias"}
          </Button>
        </CardContent>
      </Card>
    </AppShell>
  );
}
