import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const E2E_BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

async function completeAuth(page: Page, phone: string, alias: string, redirect: string) {
  await page.goto(`/login?redirect=${encodeURIComponent(redirect)}`);
  await page.getByTestId("phone-input").fill(phone);
  await page.getByTestId("send-otp-btn").click();
  await page.getByTestId("otp-input").fill("123456");
  await page.getByTestId("verify-otp-btn").click();

  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 });
  if (page.url().includes("/perfil")) {
    await page.getByLabel("Alias").fill(alias);
    await page.getByRole("button", { name: "Guardar alias" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/perfil"), { timeout: 15000 });
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

async function copySummaryFromUi(page: Page, expectedSnippet: string): Promise<string> {
  await page.getByTestId("copy-summary-btn").click();
  await expect(page.getByText("Resumen copiado para WhatsApp.")).toBeVisible();
  await expect.poll(async () => page.evaluate(() => navigator.clipboard.readText())).toContain(expectedSnippet);
  return page.evaluate(() => navigator.clipboard.readText());
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
  await expect(page.getByTestId("leave-btn")).toHaveCount(0);

  await page.getByTestId("copy-summary-btn").click();
  await expect(page.getByText("Resumen copiado para WhatsApp.")).toBeVisible();

  const matchUrl = page.url();
  const publicPage = await browser.newContext({
    baseURL: E2E_BASE_URL,
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

  await publicTab.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 });
  if (publicTab.url().includes("/perfil")) {
    await publicTab.getByLabel("Alias").fill("Jugador Dos");
    await publicTab.getByRole("button", { name: "Guardar alias" }).click();
    await publicTab.waitForURL((url) => !url.pathname.startsWith("/perfil"), { timeout: 15000 });
  }

  await expect(publicTab).toHaveURL(/\/partido\/[a-z0-9]+/i);

  await publicTab.getByTestId("join-btn").click();
  await expect(publicTab.getByText("Te uniste al partido.")).toBeVisible();
  await expect(publicTab.getByText("2/4")).toBeVisible();

  await publicTab.getByTestId("leave-btn").click();
  await expect(publicTab.getByText("Saliste del partido.")).toBeVisible();

  await page.getByTestId("cancel-btn").click();
  await expect(page.getByRole("dialog", { name: "Cancelar partido" })).toBeVisible();
  await expect(page.getByText("Si cancelas, el partido se cerrará para todos y dejará de aparecer como abierto.")).toBeVisible();
  await page.getByTestId("cancel-confirm-back-btn").click();
  await expect(page.getByRole("dialog", { name: "Cancelar partido" })).toHaveCount(0);
  await expect(page.getByTestId("canceled-banner")).toHaveCount(0);

  await page.getByTestId("cancel-btn").click();
  await page.getByTestId("confirm-cancel-btn").click();
  await expect(page.getByTestId("canceled-banner")).toBeVisible();

  await publicTab.reload();
  await expect(publicTab.getByTestId("canceled-banner")).toBeVisible();
  await expect(publicTab.getByTestId("join-btn")).toHaveCount(0);

  await publicPage.close();
});

test("onboarding usuario nuevo: OTP -> perfil -> regreso al flujo de creación", async ({ page }) => {
  await page.goto("/crear");
  await expect(page).toHaveURL(/\/login\?redirect=(%2Fcrear|\/crear)/);

  await page.getByTestId("phone-input").fill("3011110000");
  await page.getByTestId("send-otp-btn").click();
  await expect(page.getByText("Código enviado por SMS.")).toBeVisible();

  await page.getByTestId("otp-input").fill("123456");
  await page.getByTestId("verify-otp-btn").click();

  await expect(page).toHaveURL(/\/perfil\?redirect=(%2Fcrear|\/crear)/);
  await expect(page.getByRole("heading", { name: "Tu perfil de jugador" })).toBeVisible();

  await page.getByLabel("Alias").fill("Onboard Flow");
  await page.getByRole("button", { name: "Guardar alias" }).click();

  await expect(page).toHaveURL(/\/crear$/);
  await expect(page.getByRole("heading", { name: "Crear partido" })).toBeVisible();
});

test("visitante sin autenticación puede ver partido compartido por link", async ({ request, browser }) => {
  const organizerToken = await createApiUser(request, "3011110100", "Link Host");
  const match = await createApiMatch(request, organizerToken, {
    club: "Padel Link Publico",
    startsAtLocal: "2030-03-03T20:00",
    category: "4ta",
    modality: "mixto",
  });

  const visitorContext = await browser.newContext({ baseURL: E2E_BASE_URL });
  const visitorPage = await visitorContext.newPage();

  await visitorPage.goto(`/partido/${match.publicId}`);
  await expect(visitorPage.getByRole("heading", { name: "Confirmados" })).toBeVisible();
  await expect(visitorPage.getByText("1/4")).toBeVisible();
  await expect(visitorPage.getByText("Link Host")).toBeVisible();
  await expect(visitorPage.getByRole("link", { name: "Inicia sesión para participar" })).toBeVisible();
  await expect(visitorPage.getByTestId("join-btn")).toHaveCount(0);

  await visitorContext.close();
});

test("watchlist: liberar cupo no autoasigna al observador y permite unirse manualmente", async ({
  page,
  request,
}) => {
  const organizer = await createApiUser(request, "3011110200", "Watchlist Org");
  const match = await createApiMatch(request, organizer, {
    club: "Padel Watchlist",
    startsAtLocal: "2030-03-04T20:00",
    category: "4ta",
    modality: "mixto",
  });

  const p2 = await createApiUser(request, "3011110201", "Watchlist P2");
  const p3 = await createApiUser(request, "3011110202", "Watchlist P3");
  const p4 = await createApiUser(request, "3011110203", "Watchlist P4");
  const watcherPhone = "3011110204";
  const watcherAlias = "Watchlist Cola";
  const watcherToken = await createApiUser(request, watcherPhone, watcherAlias);

  await joinApiMatch(request, p2, match.publicId);
  await joinApiMatch(request, p3, match.publicId);
  await joinApiMatch(request, p4, match.publicId);

  await completeAuth(page, watcherPhone, watcherAlias, `/partido/${match.publicId}`);
  await expect(page).toHaveURL(new RegExp(`/partido/${match.publicId}$`));
  await expect(page.getByText("Estado: Lleno (4/4)")).toBeVisible();

  await page.getByTestId("follow-watch-btn").click();
  await expect(page.getByTestId("unfollow-watch-btn")).toBeVisible();

  await leaveApiMatch(request, p4, match.publicId);
  await page.reload();

  await expect(page.getByText("3/4")).toBeVisible();
  await expect(page.getByTestId("join-btn")).toBeVisible();
  await expect(page.getByText("Tú")).toHaveCount(0);
  await expect(page.getByTestId("leave-btn")).toHaveCount(0);

  const watcherViewResponse = await request.get(`/api/matches/${match.publicId}`, {
    headers: {
      Authorization: `Bearer ${watcherToken}`,
    },
  });
  expect(watcherViewResponse.ok()).toBeTruthy();
  const watcherViewPayload = (await watcherViewResponse.json()) as {
    match: { canJoin: boolean; participants: Array<{ alias: string }> };
  };
  expect(watcherViewPayload.match.canJoin).toBe(true);
  expect(watcherViewPayload.match.participants.some((participant) => participant.alias === watcherAlias)).toBe(false);

  await page.getByTestId("join-btn").click();
  await expect(page.getByText("Te uniste al partido.")).toBeVisible();
  await expect(page.getByText("Estado: Lleno (4/4)")).toBeVisible();
  await expect(page.getByRole("main").getByText(watcherAlias)).toBeVisible();
});

test("reservas futuras: feed muestra Mañana y fecha absoluta para días posteriores", async ({ page, request }) => {
  const dayMs = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const organizer = await createApiUser(request, "3011110300", "Future Org");
  const tomorrowMatch = await createApiMatch(request, organizer, {
    club: "Padel Manana Visible",
    startsAtLocal: toBogotaDateTimeLocal(new Date(now + dayMs + 2 * 60 * 60 * 1000)),
    category: "4ta",
    modality: "mixto",
  });
  const futureMatch = await createApiMatch(request, organizer, {
    club: "Padel Fecha Visible",
    startsAtLocal: toBogotaDateTimeLocal(new Date(now + 3 * dayMs + 2 * 60 * 60 * 1000)),
    category: "4ta",
    modality: "fem",
  });

  await page.goto("/");
  await expect(page.getByText("Padel Manana Visible")).toBeVisible();
  await expect(page.getByText("Padel Fecha Visible")).toBeVisible();

  const tomorrowCard = page.getByTestId(`open-match-card-${tomorrowMatch.publicId}`);
  await expect(tomorrowCard).toContainText("Mañana de");

  const futureCard = page.getByTestId(`open-match-card-${futureMatch.publicId}`);
  await expect(futureCard).toContainText(/\d{2}\/\d{2}\/\d{4} de/);
});

test("whatsapp summary E2E: open/full states show names, urgency and CTA rules", async ({ page, request }) => {
  const organizer = await createApiUser(request, "3002223344", "Resumen Org");
  const match = await createApiMatch(request, organizer, {
    club: "Padel WA Real",
    startsAtLocal: "2030-03-01T20:00",
    category: "4ta",
    modality: "mixto",
  });

  await page.goto(`/partido/${match.publicId}`);
  await expect(page.getByRole("heading", { name: "Confirmados" })).toBeVisible();
  await expect(page.getByText("1/4")).toBeVisible();

  const summaryOneOfFour = await copySummaryFromUi(page, "Confirmados (1/4):");
  expect(summaryOneOfFour).toContain("Padel WA Real");
  expect(summaryOneOfFour).toContain("· Mixto");
  expect(summaryOneOfFour).toContain("Confirmados (1/4): Resumen Org");
  expect(summaryOneOfFour).toContain("Faltan 3 cupos");
  const joinLineOneOfFour = summaryOneOfFour.split("\n").at(-1) ?? "";
  expect(joinLineOneOfFour).toMatch(new RegExp(`^Únete aquí: https?://[^\\s]+/partido/${match.publicId}$`));
  expect(new URL(joinLineOneOfFour.replace("Únete aquí: ", "")).pathname).toBe(`/partido/${match.publicId}`);

  const p2 = await createApiUser(request, "3002223345", "Resumen Dos");
  const p3 = await createApiUser(request, "3002223346", "Resumen Tres");
  await joinApiMatch(request, p2, match.publicId);
  await joinApiMatch(request, p3, match.publicId);

  await page.reload();
  await expect(page.getByText("3/4")).toBeVisible();

  const summaryThreeOfFour = await copySummaryFromUi(page, "Confirmados (3/4):");
  expect(summaryThreeOfFour).toContain("Confirmados (3/4): Resumen Org, Resumen Dos, Resumen Tres");
  expect(summaryThreeOfFour).toContain("Faltan 1 cupo");
  expect(summaryThreeOfFour).not.toContain("Faltan 0 cupos");
  const joinLineThreeOfFour = summaryThreeOfFour.split("\n").at(-1) ?? "";
  expect(joinLineThreeOfFour).toMatch(new RegExp(`^Únete aquí: https?://[^\\s]+/partido/${match.publicId}$`));

  const p4 = await createApiUser(request, "3002223347", "Resumen Cuatro");
  await joinApiMatch(request, p4, match.publicId);

  await page.reload();
  await expect(page.getByText("Estado: Lleno (4/4)")).toBeVisible();

  const summaryFourOfFour = await copySummaryFromUi(page, "Confirmados (4/4):");
  expect(summaryFourOfFour).toContain("Confirmados (4/4): Resumen Org, Resumen Dos, Resumen Tres, Resumen Cuatro");
  expect(summaryFourOfFour).toContain("Completo");
  const detailsLineFourOfFour = summaryFourOfFour.split("\n").at(-1) ?? "";
  expect(detailsLineFourOfFour).toMatch(new RegExp(`^Ver detalles: https?://[^\\s]+/partido/${match.publicId}$`));
  expect(new URL(detailsLineFourOfFour.replace("Ver detalles: ", "")).pathname).toBe(`/partido/${match.publicId}`);
  expect(summaryFourOfFour).not.toContain("Faltan");
  expect(summaryFourOfFour).not.toContain("Únete aquí");
});

test("whatsapp summary E2E: canceled match does not invite joining", async ({ page, request }) => {
  const organizer = await createApiUser(request, "3003334455", "Resumen Cancel");
  const match = await createApiMatch(request, organizer, {
    club: "Padel WA Cancelado",
    startsAtLocal: "2030-03-02T20:00",
    category: "4ta",
    modality: "masc",
  });
  const participant = await createApiUser(request, "3003334456", "Resumen Invitado");
  await joinApiMatch(request, participant, match.publicId);
  await cancelApiMatch(request, organizer, match.publicId);

  await page.goto(`/partido/${match.publicId}`);
  await expect(page.getByTestId("canceled-banner")).toBeVisible();

  const summaryCanceled = await copySummaryFromUi(page, "Cancelado");
  expect(summaryCanceled).toContain("Padel WA Cancelado");
  expect(summaryCanceled).toContain("· Masc");
  expect(summaryCanceled).toContain("Cancelado");
  const detailsLineCanceled = summaryCanceled.split("\n").at(-1) ?? "";
  expect(detailsLineCanceled).toMatch(new RegExp(`^Ver detalles: https?://[^\\s]+/partido/${match.publicId}$`));
  expect(new URL(detailsLineCanceled.replace("Ver detalles: ", "")).pathname).toBe(`/partido/${match.publicId}`);
  expect(summaryCanceled).not.toContain("Confirmados");
  expect(summaryCanceled).not.toContain("Faltan");
  expect(summaryCanceled).not.toContain("Únete aquí");
});

test("feed publico: filtra partidos abiertos y abre detalle sin login", async ({ page, request }) => {
  const seeded = await seedOpenFeedData(request);

  await page.goto("/");
  await expect(page.getByText("Club Feed Mixto")).toBeVisible();
  await expect(page.getByText("Club Feed Fem")).toBeVisible();
  await expect(page.getByText("Club Feed Lleno")).toHaveCount(0);
  await expect(page.getByText("Club Feed Cancelado")).toHaveCount(0);
  await expect(page.getByText("Club Feed Fuera Ventana")).toHaveCount(0);

  await page.getByRole("button", { name: "Fem" }).click();
  await expect(page.getByText("Club Feed Fem")).toBeVisible();
  await expect(page.getByText("Club Feed Mixto")).toHaveCount(0);

  await page.getByRole("button", { name: "Hoy" }).click();
  await expect(page.getByText("No hay partidos abiertos en este rango")).toBeVisible();

  await page.getByRole("button", { name: "7 días" }).click();
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

test("organizer leave API legacy returns ORGANIZER_MUST_CANCEL", async ({ request }) => {
  const organizer = await createApiUser(request, "3009991100", "Legacy Org");
  const match = await createApiMatch(request, organizer, {
    club: "Padel Legacy Leave",
    startsAtLocal: "2030-02-26T19:00",
    category: "4ta",
    modality: "mixto",
  });

  const leaveResponse = await request.post(`/api/matches/${match.publicId}/leave`, {
    headers: {
      Authorization: `Bearer ${organizer}`,
    },
  });
  expect(leaveResponse.status()).toBe(400);
  const leaveBody = (await leaveResponse.json()) as { error?: { code?: string; message?: string } };
  expect(leaveBody.error?.code).toBe("ORGANIZER_MUST_CANCEL");
  expect(leaveBody.error?.message).toBe("El organizador no puede salir. Debe cancelar el partido.");
});

test("organizer does not see watchlist CTA on own full match", async ({ page, request }) => {
  const organizerPhone = "3009991200";
  const organizer = await createApiUser(request, organizerPhone, "Watch Org Owner");
  const match = await createApiMatch(request, organizer, {
    club: "Padel Organizer Full",
    startsAtLocal: "2030-02-27T19:00",
    category: "4ta",
    modality: "mixto",
  });
  const p2 = await createApiUser(request, "3009991201", "Org Full P2");
  const p3 = await createApiUser(request, "3009991202", "Org Full P3");
  const p4 = await createApiUser(request, "3009991203", "Org Full P4");
  await joinApiMatch(request, p2, match.publicId);
  await joinApiMatch(request, p3, match.publicId);
  await joinApiMatch(request, p4, match.publicId);

  await completeAuth(page, organizerPhone, "Watch Org Owner", `/partido/${match.publicId}`);
  await expect(page).toHaveURL(new RegExp(`/partido/${match.publicId}$`));
  await expect(page.getByText("Estado: Lleno (4/4)")).toBeVisible();
  await expect(page.getByTestId("leave-btn")).toHaveCount(0);
  await expect(page.getByTestId("follow-watch-btn")).toHaveCount(0);
  await expect(page.getByTestId("cancel-btn")).toBeVisible();
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

test("feed: no muestra banner por cambio de tab interno", async ({ page, request }) => {
  const now = Date.now();
  const organizer = await createApiUser(request, "3010000001", "Internal Tab Org");
  await createApiMatch(request, organizer, {
    club: "Feed Base Club",
    startsAtLocal: toBogotaDateTimeLocal(new Date(now + 2 * 24 * 60 * 60 * 1000)),
    category: "4ta",
    modality: "mixto",
  });

  await page.goto("/");
  await expect(page.getByText("Feed Base Club")).toBeVisible();
  await expect(page.getByTestId("feed-return-banner")).toHaveCount(0);

  await createApiMatch(request, organizer, {
    club: "Feed Nuevo Interno",
    startsAtLocal: toBogotaDateTimeLocal(new Date(now + 2 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000)),
    category: "4ta",
    modality: "mixto",
  });

  await page.getByRole("button", { name: "Mis partidos" }).click();
  await page.getByRole("button", { name: "Inicio" }).click();

  await expect(page.getByText("Feed Nuevo Interno")).toBeVisible();
  await expect(page.getByTestId("feed-return-banner")).toHaveCount(0);
});

test("feed: online dispara return, muestra banner y badge Nuevo por 5s", async ({ page, request }) => {
  const now = Date.now();
  const organizer = await createApiUser(request, "3010000002", "Online Trigger Org");
  await createApiMatch(request, organizer, {
    club: "Feed Online Base",
    startsAtLocal: toBogotaDateTimeLocal(new Date(now + 2 * 24 * 60 * 60 * 1000)),
    category: "4ta",
    modality: "mixto",
  });

  await page.goto("/");
  await expect(page.getByText("Feed Online Base")).toBeVisible();

  await page.context().setOffline(true);
  const created = await createApiMatch(request, organizer, {
    club: "Feed Online Nuevo",
    startsAtLocal: toBogotaDateTimeLocal(new Date(now + 2 * 60 * 60 * 1000)),
    category: "4ta",
    modality: "mixto",
  });
  await page.context().setOffline(false);

  await expect(page.getByTestId("feed-return-banner")).toBeVisible();
  await expect(page.getByText("Hay 1 partido nuevo")).toBeVisible();
  await page.getByTestId("feed-return-view-btn").click();

  await expect(page.getByTestId(`new-badge-${created.publicId}`)).toBeVisible();
  await page.waitForTimeout(5100);
  await expect(page.getByTestId(`new-badge-${created.publicId}`)).toHaveCount(0);
});

test("mis partidos: muestra próximo y actualizado al volver online", async ({ page, request }) => {
  const now = Date.now();
  const organizerPhone = "3010000003";
  const organizer = await createApiUser(request, organizerPhone, "Mis Org");
  const match = await createApiMatch(request, organizer, {
    club: "Mis Proximo Club",
    startsAtLocal: toBogotaDateTimeLocal(new Date(now + 2 * 60 * 60 * 1000)),
    category: "4ta",
    modality: "mixto",
  });
  const joiner = await createApiUser(request, "3010000004", "Mis Joiner");

  await completeAuth(page, organizerPhone, "Mis Org", "/");
  await page.getByRole("button", { name: "Mis partidos" }).click();
  await expect(page.getByTestId("mine-next-match-block")).toBeVisible();

  await page.context().setOffline(true);
  await joinApiMatch(request, joiner, match.publicId);
  await page.context().setOffline(false);

  await expect(page.getByTestId("mine-updated-indicator")).toBeVisible();
  await expect(page.getByTestId("mine-updated-indicator")).toContainText("Actualizado · 1");
});
