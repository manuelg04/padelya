export const APP_TIMEZONE = process.env.NEXT_PUBLIC_APP_TIMEZONE ?? "America/Bogota";
export const DEFAULT_PHONE_COUNTRY = process.env.NEXT_PUBLIC_DEFAULT_PHONE_COUNTRY ?? "CO";
export const USE_MOCK_BACKEND = process.env.NEXT_PUBLIC_USE_MOCK_BACKEND === "true";
export const USE_AUTH_EMULATOR =
  process.env.NEXT_PUBLIC_USE_AUTH_EMULATOR === "true" ||
  process.env.NODE_ENV === "test";
export const ENABLE_CONVEX_REALTIME = !USE_MOCK_BACKEND && Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);
export const WEB_PUSH_VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY ?? "";
