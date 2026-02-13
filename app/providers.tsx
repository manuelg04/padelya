"use client";

import { AuthProvider } from "@/src/components/auth/auth-provider";
import { ConvexAuthProvider } from "@/src/components/auth/convex-auth-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ConvexAuthProvider>{children}</ConvexAuthProvider>
    </AuthProvider>
  );
}
