const PUBLIC_ID_REGEX = /[a-z0-9]{10}/i;

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function normalizePublicId(rawValue: string): string {
  const decoded = safeDecodeURIComponent(rawValue).trim();
  if (!decoded) {
    return "";
  }

  const regexMatch = decoded.match(PUBLIC_ID_REGEX);
  if (regexMatch?.[0]) {
    return regexMatch[0];
  }

  const firstToken = decoded.split(/\s+/)[0];
  return firstToken ?? decoded;
}
