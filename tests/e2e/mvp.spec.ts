import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

async function completeAuth(page: Page, phone: string, alias: string, redirect: string) {
  await page.goto(`/login?redirect=${encodeURIComponent(redirect)}`);
  await page.getByTestId("phone-input").fill(phone);
  await page.getByTestId("send-otp-btn").click();
  await page.getByTestId("otp-input").fill("123456");
  await page.getByTestId("verify-otp-btn").click();

  await page.waitForLoadState("networkidle");
  if (page.url().includes("/perfil")) {
    await page.getByLabel("Alias").fill(alias);
    await page.getByRole("button", { name: "Guardar alias" }).click();
    await page.waitForLoadState("networkidle");
  }
}

function toBogotaDateTimeLocal(date: Date): string {
  const bogotaTime = new Date(date.getTime() - 5 * 60 * 60 * 1000);
  bogotaTime.setUTCMinutes(0, 0, 0);
  const year = bogotaTime.getUTCFullYear();
  const month = String(bogotaTime.getUTCMonth() + 1).padStart(2, "0");
  const day = String(bogotaTime.getUTCDate()).padStart(2, "0");
  const hours = String(bogotaTime.getUTCHours()).padStart(2, "0");
  const minutes = "00";
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

async function createApiUser(request: APIRequestContext, phone: string, alias: string): Promise<string> {
  const otpRequest = await request.post("/api/auth/request-otp", { data: { phone } });
  expect(otpRequest.ok()).toBeTruthy();

  const verifyOtp = await request.post("/api/auth/verify-otp", { data: { phone, code: "123456" } });
  expect(verifyOtp.ok()).toBeTruthy();
  const verifyPayload = (await verifyOtp.json()) as { token: string };

  const saveAlias = await request.patch("/api/me", {
    headers: {
      Authorization: `Bearer ${verifyPayload.token}`,
    },
    data: { alias },
  });
  expect(saveAlias.ok()).toBeTruthy();

  return verifyPayload.token;
}

async function createApiMatch(
  request: APIRequestContext,
  token: string,
  payload: { club: string; startsAtLocal: string; category: string; modality: "mixto" | "masc" | "fem" },
): Promise<{ publicId: string }> {
  const response = await request.post("/api/matches", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    data: payload,
  });
  expect(response.ok()).toBeTruthy();

  const body = (await response.json()) as { match: { publicId: string } };
  return body.match;
}

async function joinApiMatch(request: APIRequestContext, token: string, publicId: string): Promise<void> {
  const response = await request.post(`/api/matches/${publicId}/join`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  expect(response.ok()).toBeTruthy();
}

async function leaveApiMatch(request: APIRequestContext, token: string, publicId: string): Promise<void> {
  const response = await request.post(`/api/matches/${publicId}/leave`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  expect(response.ok()).toBeTruthy();
}

async function cancelApiMatch(request: APIRequestContext, token: string, publicId: string): Promise<void> {
  const response = await request.post(`/api/matches/${publicId}/cancel`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  expect(response.ok()).toBeTruthy();
}

async function seedOpenFeedData(request: APIRequestContext) {
  const dayMs = 24 * 60 * 60 * 1000;
  const now = Date.now();

  const organizerToken = await createApiUser(request, "3007771000", "Seed Org");

  await createApiMatch(request, organizerToken, {
    club: "Club Feed Mixto",
    startsAtLocal: toBogotaDateTimeLocal(new Date(now + 2 * dayMs)),
    category: "4ta",
    modality: "mixto",
  });

  const femMatch = await createApiMatch(request, organizerToken, {
    club: "Club Feed Fem",
    startsAtLocal: toBogotaDateTimeLocal(new Date(now + 3 * dayMs)),
    category: "4ta",
    modality: "fem",
  });

  const fullMatch = await createApiMatch(request, organizerToken, {
    club: "Club Feed Lleno",
    startsAtLocal: toBogotaDateTimeLocal(new Date(now + 2 * dayMs + 60 * 60 * 1000)),
    category: "4ta",
    modality: "mixto",
  });
  const player2 = await createApiUser(request, "3007771001", "Seed P2");
  const player3 = await createApiUser(request, "3007771002", "Seed P3");
  const player4 = await createApiUser(request, "3007771003", "Seed P4");
  await joinApiMatch(request, player2, fullMatch.publicId);
  await joinApiMatch(request, player3, fullMatch.publicId);
  await joinApiMatch(request, player4, fullMatch.publicId);

  const canceledMatch = await createApiMatch(request, organizerToken, {
    club: "Club Feed Cancelado",
    startsAtLocal: toBogotaDateTimeLocal(new Date(now + 2 * dayMs + 2 * 60 * 60 * 1000)),
    category: "4ta",
    modality: "masc",
  });
  await cancelApiMatch(request, organizerToken, canceledMatch.publicId);

  await createApiMatch(request, organizerToken, {
    club: "Club Feed Fuera Ventana",
    startsAtLocal: toBogotaDateTimeLocal(new Date(now + 8 * dayMs)),
    category: "4ta",
    modality: "mixto",
  });

  return { femClubName: "Club Feed Fem", femPublicId: femMatch.publicId };
}

test.beforeEach(async ({ request }) => {
  await request.post("/api/test/reset");
});

test("happy path P0: crear, ver link público, join/leave, cancelado, copiar resumen", async ({
  page,
  browser,
}) => {
  await completeAuth(page, "3001112233", "Organizador", "/crear");

  await page.getByLabel("Club").fill("Padel Norte");
  await page.getByTestId("date-preset-tomorrow").click();
  await page.getByTestId("hour-slot-select").selectOption("19");
  await page.getByLabel("Categoría").fill("4ta");
  await page.getByLabel("Modalidad").selectOption("mixto");
  await page.getByTestId("create-match-btn").click();

  await expect(page).toHaveURL(/\/partido\/[a-z0-9]+/i);
  await expect(page.getByRole("heading", { name: "Confirmados" })).toBeVisible();
  await expect(page.getByText("1/4")).toBeVisible();

  await page.getByTestId("copy-summary-btn").click();
  await expect(page.getByText("Resumen copiado para WhatsApp.")).toBeVisible();

  const matchUrl = page.url();
  const publicPage = await browser.newContext({
    baseURL: "http://127.0.0.1:3000",
    permissions: ["clipboard-read", "clipboard-write"],
    viewport: { width: 390, height: 844 },
  });
  const publicTab = await publicPage.newPage();

  await publicTab.goto(matchUrl);
  await expect(publicTab.getByRole("heading", { name: "Confirmados" })).toBeVisible();
  await expect(publicTab.getByText("1/4")).toBeVisible();
  await expect(publicTab.getByRole("link", { name: "Inicia sesión para participar" })).toBeVisible();

  const dirtyUrl = `${matchUrl}%20S%C3%BAmate%20al%20partido`;
  await publicTab.goto(dirtyUrl);
  await expect(publicTab.getByRole("heading", { name: "Confirmados" })).toBeVisible();
  await expect(publicTab).toHaveURL(/\/partido\/[a-z0-9]+$/i);

  await publicTab.getByRole("link", { name: "Inicia sesión para participar" }).click();
  await publicTab.getByTestId("phone-input").fill("3004445566");
  await publicTab.getByTestId("send-otp-btn").click();
  await publicTab.getByTestId("otp-input").fill("123456");
  await publicTab.getByTestId("verify-otp-btn").click();

  await publicTab.waitForLoadState("networkidle");
  if (publicTab.url().includes("/perfil")) {
    await publicTab.getByLabel("Alias").fill("Jugador Dos");
    await publicTab.getByRole("button", { name: "Guardar alias" }).click();
  }

  await expect(publicTab).toHaveURL(/\/partido\/[a-z0-9]+/i);

  await publicTab.getByTestId("join-btn").click();
  await expect(publicTab.getByText("Te uniste al partido.")).toBeVisible();
  await expect(publicTab.getByText("2/4")).toBeVisible();

  await publicTab.getByTestId("leave-btn").click();
  await expect(publicTab.getByText("Saliste del partido.")).toBeVisible();

  await page.getByTestId("cancel-btn").click();
  await expect(page.getByTestId("canceled-banner")).toBeVisible();

  await publicTab.reload();
  await expect(publicTab.getByTestId("canceled-banner")).toBeVisible();
  await expect(publicTab.getByTestId("join-btn")).toHaveCount(0);

  await publicPage.close();
});

test("feed publico: filtra partidos abiertos y abre detalle sin login", async ({ page, request }) => {
  const seeded = await seedOpenFeedData(request);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Partidos abiertos" })).toBeVisible();

  await expect(page.getByText("Club Feed Mixto")).toBeVisible();
  await expect(page.getByText("Club Feed Fem")).toBeVisible();
  await expect(page.getByText("Club Feed Lleno")).toHaveCount(0);
  await expect(page.getByText("Club Feed Cancelado")).toHaveCount(0);
  await expect(page.getByText("Club Feed Fuera Ventana")).toHaveCount(0);

  await page.getByLabel("Modalidad").selectOption("fem");
  await expect(page.getByText("Club Feed Fem")).toBeVisible();
  await expect(page.getByText("Club Feed Mixto")).toHaveCount(0);

  await page.getByLabel("Tiempo").selectOption("today");
  await expect(page.getByText("No hay partidos abiertos en este rango")).toBeVisible();

  await page.getByLabel("Tiempo").selectOption("next7");
  await expect(page.getByText(seeded.femClubName)).toBeVisible();

  await page.getByRole("link", { name: `Ver ${seeded.femClubName}` }).click();
  await expect(page).toHaveURL(new RegExp(`/partido/${seeded.femPublicId}$`));
  await expect(page.getByRole("heading", { name: "Confirmados" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Inicia sesión para participar" })).toBeVisible();
});

test("watchlist: avisa en 4->3 y el detalle refleja refill rápido", async ({ page, request }) => {
  const organizer = await createApiUser(request, "3008881100", "Watch Org");
  const match = await createApiMatch(request, organizer, {
    club: "Padel Watch Club",
    startsAtLocal: "2030-02-25T19:00",
    category: "4ta",
    modality: "mixto",
  });

  const p2 = await createApiUser(request, "3008881101", "Watch P2");
  const p3 = await createApiUser(request, "3008881102", "Watch P3");
  const p4 = await createApiUser(request, "3008881103", "Watch P4");
  const refill = await createApiUser(request, "3008881104", "Watch Refill");

  await joinApiMatch(request, p2, match.publicId);
  await joinApiMatch(request, p3, match.publicId);
  await joinApiMatch(request, p4, match.publicId);

  await completeAuth(page, "3008881105", "Watch User", `/partido/${match.publicId}`);
  await expect(page).toHaveURL(new RegExp(`/partido/${match.publicId}$`));
  await expect(page.getByText("Estado: Lleno (4/4)")).toBeVisible();

  await page.getByTestId("follow-watch-btn").click();
  await expect(page.getByTestId("unfollow-watch-btn")).toBeVisible();

  await leaveApiMatch(request, p4, match.publicId);
  await joinApiMatch(request, refill, match.publicId);

  await page.goto("/notificaciones");
  await expect(page.getByText("Cupo liberado")).toBeVisible();
  await expect(page.getByText("Padel Watch Club")).toBeVisible();

  await page.getByRole("button", { name: /Cupo liberado/i }).first().click();
  await expect(page).toHaveURL(new RegExp(`/partido/${match.publicId}\\?cta=join$`));
  await expect(page.getByText("Estado: Lleno (4/4)")).toBeVisible();
  await expect(page.getByTestId("join-btn")).toHaveCount(0);
});

test("security: watch and notifications endpoints require auth", async ({ request }) => {
  const notificationsResponse = await request.get("/api/notifications");
  expect(notificationsResponse.status()).toBe(401);
  const notificationsBody = (await notificationsResponse.json()) as { error?: { code?: string } };
  expect(notificationsBody.error?.code).toBe("UNAUTHORIZED");

  const watchResponse = await request.post("/api/matches/abc123/watch");
  expect(watchResponse.status()).toBe(401);
  const watchBody = (await watchResponse.json()) as { error?: { code?: string } };
  expect(watchBody.error?.code).toBe("UNAUTHORIZED");
});
