"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, CheckCheck, LogIn } from "lucide-react";
import { useMutation, useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { useAuth } from "@/src/components/auth/auth-provider";
import { AppShell } from "@/src/components/layout/app-shell";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import type { NotificationRecord } from "@/src/domain/types";
import { listNotifications } from "@/src/lib/api/client";
import { ENABLE_CONVEX_REALTIME } from "@/src/lib/env";
import { toErrorMessage } from "@/src/lib/utils";

type NotificationListItemBase = {
  id: string;
  type: NotificationRecord["type"];
  title: string;
  message: string;
  matchPublicId: string | null;
  createdAt: string;
  isRead: boolean;
};

function formatCreatedAt(isoDate: string): string {
  const date = new Date(isoDate);
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function resolveNotificationLink(item: Pick<NotificationListItemBase, "type" | "matchPublicId">): string | null {
  if (!item.matchPublicId) {
    return null;
  }
  if (item.type === "CUPO_LIBERADO") {
    return `/partido/${item.matchPublicId}?cta=join`;
  }
  return `/partido/${item.matchPublicId}`;
}

function RequireLoginCard() {
  return (
    <AppShell>
      <Card>
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100">
            <LogIn className="h-5 w-5 text-zinc-500" />
          </div>
          <CardTitle>Inicia sesión para ver notificaciones</CardTitle>
          <CardDescription>Te avisaremos cuando cambie el estado de tus partidos.</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button asChild size="lg" className="w-full">
            <Link href="/login?redirect=/notificaciones">Iniciar sesión</Link>
          </Button>
        </CardContent>
      </Card>
    </AppShell>
  );
}

function NotificationList<TItem extends NotificationListItemBase>({
  items,
  onOpen,
}: {
  items: TItem[];
  onOpen: (item: TItem) => Promise<void> | void;
}) {
  return (
    <>
      {items.length === 0 ? (
        <Card>
          <CardContent className="py-5 text-sm text-zinc-500">Aún no tienes notificaciones.</CardContent>
        </Card>
      ) : null}

      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
            item.isRead ? "border-zinc-200 bg-white" : "border-emerald-200 bg-emerald-50/40"
          }`}
          onClick={() => void onOpen(item)}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-zinc-900">{item.title}</p>
              <p className="mt-1 text-sm text-zinc-600">{item.message}</p>
            </div>
            {!item.isRead ? <span className="mt-1 h-2 w-2 rounded-full bg-emerald-500" /> : null}
          </div>
          <p className="mt-2 text-xs text-zinc-500">{formatCreatedAt(item.createdAt)}</p>
        </button>
      ))}
    </>
  );
}

function ConvexNotificationsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const notifications = useQuery(api.padel.listNotificationsForMe, user ? { limit: 50 } : "skip");
  const markRead = useMutation(api.padel.markNotificationRead);
  const markAllRead = useMutation(api.padel.markAllNotificationsRead);

  const items = notifications ?? [];

  if (!loading && !user) {
    return <RequireLoginCard />;
  }

  return (
    <AppShell>
      <section className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-emerald-600" />
                  Notificaciones
                </CardTitle>
                <CardDescription>Cambios en tus partidos, actualizados en tiempo real.</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void markAllRead({})}
                disabled={!items.length || items.every((item) => item.isRead)}
              >
                <CheckCheck className="h-4 w-4" />
                Marcar todo leído
              </Button>
            </div>
          </CardHeader>
        </Card>

        {!notifications ? (
          <Card>
            <CardContent className="py-5 text-sm text-zinc-500">Cargando notificaciones...</CardContent>
          </Card>
        ) : null}

        {notifications ? (
          <NotificationList
            items={notifications}
            onOpen={async (item) => {
              if (!item.isRead) {
                await markRead({ notificationId: item.id });
              }
              const target = resolveNotificationLink(item);
              if (target) {
                router.push(target);
              }
            }}
          />
        ) : null}
      </section>
    </AppShell>
  );
}

function MockNotificationsPage() {
  const { user, loading, token } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<NotificationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    void (async () => {
      if (!token) {
        if (!disposed) {
          setItems([]);
          setIsLoading(false);
        }
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        const next = await listNotifications(token, 50);
        if (!disposed) {
          setItems(next);
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
  }, [token]);

  if (!loading && !user) {
    return <RequireLoginCard />;
  }

  return (
    <AppShell>
      <section className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-emerald-600" />
              Notificaciones
            </CardTitle>
            <CardDescription>Cambios en tus partidos.</CardDescription>
          </CardHeader>
        </Card>

        {isLoading ? (
          <Card>
            <CardContent className="py-5 text-sm text-zinc-500">Cargando notificaciones...</CardContent>
          </Card>
        ) : null}

        {error ? (
          <Card>
            <CardContent className="py-5 text-sm text-rose-700">{error}</CardContent>
          </Card>
        ) : null}

        {!isLoading && !error ? (
          <NotificationList
            items={items}
            onOpen={(item) => {
              const target = resolveNotificationLink(item);
              if (target) {
                router.push(target);
              }
            }}
          />
        ) : null}
      </section>
    </AppShell>
  );
}

export default function NotificationsPage() {
  if (ENABLE_CONVEX_REALTIME) {
    return <ConvexNotificationsPage />;
  }
  return <MockNotificationsPage />;
}
