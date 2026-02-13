"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import { ConvexProviderWithAuth } from "convex/react";

import { useAuth } from "@/src/components/auth/auth-provider";
import { firebaseAuth } from "@/src/lib/firebase/client";
import { convexClient } from "@/src/lib/convex/client";
import { ENABLE_CONVEX_REALTIME } from "@/src/lib/env";

function useFirebaseConvexAuth() {
  const { loading, user } = useAuth();

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      if (!firebaseAuth?.currentUser) {
        return null;
      }
      return firebaseAuth.currentUser.getIdToken(forceRefreshToken);
    },
    [],
  );

  return useMemo(
    () => ({
      isLoading: loading,
      isAuthenticated: Boolean(user && firebaseAuth?.currentUser),
      fetchAccessToken,
    }),
    [fetchAccessToken, loading, user],
  );
}

export function ConvexAuthProvider({ children }: { children: ReactNode }) {
  if (!ENABLE_CONVEX_REALTIME || !convexClient) {
    return <>{children}</>;
  }

  return (
    <ConvexProviderWithAuth client={convexClient} useAuth={useFirebaseConvexAuth}>
      {children}
    </ConvexProviderWithAuth>
  );
}
