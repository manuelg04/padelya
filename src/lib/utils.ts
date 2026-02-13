import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPhoneE164(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) {
    return "";
  }
  if (digits.startsWith("57") && digits.length >= 10) {
    return `+${digits}`;
  }
  if (digits.startsWith("0")) {
    return `+57${digits.slice(1)}`;
  }
  if (digits.length === 10) {
    return `+57${digits}`;
  }
  return raw.startsWith("+") ? raw : `+${digits}`;
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Ocurrió un error inesperado";
}
