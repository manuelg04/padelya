"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { Button } from "@/src/components/ui/button";

export function NotificationBell() {
  const unreadCount = useQuery(api.padel.unreadNotificationsCount, {}) ?? 0;

  return (
    <Button variant="ghost" size="icon" asChild aria-label="Notificaciones">
      <Link href="/notificaciones" className="relative">
        <Bell className="h-4 w-4" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1.5 -top-1.5 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-semibold leading-none text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}
