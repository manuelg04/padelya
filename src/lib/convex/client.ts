"use client";

import { ConvexReactClient } from "convex/react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

const globalForConvex = globalThis as typeof globalThis & {
  __padelConvexClient?: ConvexReactClient;
};

export const convexClient =
  convexUrl && !globalForConvex.__padelConvexClient
    ? (globalForConvex.__padelConvexClient = new ConvexReactClient(convexUrl))
    : globalForConvex.__padelConvexClient;
