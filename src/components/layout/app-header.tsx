"use client";

import Link from "next/link";
import { Bell, LogOut } from "lucide-react";

import { useAuth } from "@/src/components/auth/auth-provider";
import { NotificationBell } from "@/src/components/notifications/notification-bell";
import { Button } from "@/src/components/ui/button";
import { ENABLE_CONVEX_REALTIME } from "@/src/lib/env";

function UserAvatar({ alias }: { alias: string | null }) {
  const initial = alias ? alias.charAt(0).toUpperCase() : "?";

  return (
    <div
      className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700"
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}

export function AppHeader() {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200/80 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-xl items-center justify-between px-4 py-3.5">
        <Link href="/" className="text-base font-bold tracking-tight text-zinc-900">
          🎾 Padel por Link
        </Link>
        <div className="flex items-center gap-2.5">
          {user ? (
            <>
              {ENABLE_CONVEX_REALTIME ? (
                <NotificationBell />
              ) : (
                <Button variant="ghost" size="icon" asChild aria-label="Notificaciones">
                  <Link href="/notificaciones">
                    <Bell className="h-4 w-4" />
                  </Link>
                </Button>
              )}
              <Link href="/perfil" className="flex items-center gap-2 rounded-full transition-opacity hover:opacity-80">
                <UserAvatar alias={user.alias} />
                <span className="max-w-[100px] truncate text-sm font-medium text-zinc-700">
                  {user.alias ?? "Sin alias"}
                </span>
              </Link>
              <Button variant="ghost" size="icon" onClick={logout} aria-label="Cerrar sesión">
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button asChild size="sm">
              <Link href="/login">Entrar</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
