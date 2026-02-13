import type { ReactNode } from "react";

import { AppHeader } from "@/src/components/layout/app-header";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto w-full max-w-xl px-4 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
    </div>
  );
}
