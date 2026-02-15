export function slugify(input: string): string {
  const base = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  return base || "item";
}

export async function makeUniqueSlug(
  preferred: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  const base = slugify(preferred);
  if (!(await exists(base))) {
    return base;
  }

  for (let i = 2; i <= 1000; i += 1) {
    const candidate = `${base}-${i}`;
    if (!(await exists(candidate))) {
      return candidate;
    }
  }

  throw new Error("VALIDATION_ERROR");
}
