const AVATAR_INITIAL_FALLBACK = "?";

export const AVATAR_MAX_BYTES = 3 * 1024 * 1024;
export const AVATAR_ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export function getAvatarInitials(alias: string | null | undefined): string {
  const normalized = alias?.trim().replace(/\s+/g, " ") ?? "";
  if (!normalized) {
    return AVATAR_INITIAL_FALLBACK;
  }

  const parts = normalized.split(" ");
  if (parts.length === 1) {
    return parts[0].slice(0, 1).toUpperCase();
  }

  const first = parts[0].slice(0, 1);
  const last = parts[parts.length - 1].slice(0, 1);
  return `${first}${last}`.toUpperCase();
}

export function validateAvatarFile(file: File): string | null {
  if (!AVATAR_ALLOWED_MIME_TYPES.includes(file.type as (typeof AVATAR_ALLOWED_MIME_TYPES)[number])) {
    return "Formato inválido. Usa JPG, PNG o WEBP.";
  }

  if (file.size <= 0 || file.size > AVATAR_MAX_BYTES) {
    return "La foto debe pesar máximo 3MB.";
  }

  return null;
}
