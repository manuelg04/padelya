import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

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

async function completeAuth(page: Page, phone: string, alias: string) {
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

test.beforeEach(async ({ request }) => {
  await request.post("/api/test/reset");
});

test("happy path torneo por link: otp + inscripción + confirmación admin", async ({ page, request }) => {
  const adminToken = await createApiUser(request, "3009000001", "Admin Torneo");

  const seeded = await request.post("/api/test/seed-club-admin", {
    headers: {
      Authorization: `Bearer ${adminToken}`,
    },
    data: {
      clubSlug: "smash-club",
      clubName: "Smash Club",
      seedToken: "test-seed-token",
    },
  });
  expect(seeded.ok()).toBeTruthy();

  const createdTournament = await request.post("/api/admin/tournaments", {
    headers: {
      Authorization: `Bearer ${adminToken}`,
    },
    data: {
      clubSlug: "smash-club",
      name: "Torneo E2E",
      startsAtLocal: "2030-02-20T18:00",
      description: "Torneo por link",
      categories: [{ name: "Mixto Iniciación", capacity: 2 }],
    },
  });
  expect(createdTournament.ok()).toBeTruthy();
  const createdBody = (await createdTournament.json()) as {
    tournamentSlug: string;
    categorySlugs: string[];
  };

  const tournamentSlug = createdBody.tournamentSlug;
  const categorySlug = createdBody.categorySlugs[0]!;

  await page.goto(`/torneos/${tournamentSlug}/categorias/${categorySlug}`);
  await expect(page.getByRole("heading", { name: "Mixto Iniciación" })).toBeVisible();

  await page.getByLabel("Nombre de pareja").fill("Jugadora 1 / Jugadora 2");
  await page.getByRole("button", { name: "Solicitar cupo" }).click();

  await expect(page).toHaveURL(/\/login\?/);
  await completeAuth(page, "3009000002", "Jugadora Link");

  await expect(page).toHaveURL(new RegExp(`/torneos/${tournamentSlug}/categorias/${categorySlug}`));
  await page.getByLabel("Nombre de pareja").fill("Jugadora Link / Pareja");
  await page.getByRole("button", { name: "Solicitar cupo" }).click();
  await expect(page.getByText("Solicitud enviada.")).toBeVisible();

  const adminDashboard = await request.get(
    `/api/admin/tournaments/${encodeURIComponent(tournamentSlug)}/categorias/${encodeURIComponent(categorySlug)}/registrations`,
    {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    },
  );
  expect(adminDashboard.ok()).toBeTruthy();
  const dashboardBody = (await adminDashboard.json()) as {
    dashboard: {
      registrations: {
        pending: Array<{ id: string }>;
      };
    };
  };

  const registrationId = dashboardBody.dashboard.registrations.pending[0]?.id;
  expect(registrationId).toBeTruthy();

  const confirm = await request.patch(
    `/api/admin/tournaments/registrations/${encodeURIComponent(registrationId!)}/status`,
    {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
      data: {
        status: "confirmed",
      },
    },
  );
  expect(confirm.ok()).toBeTruthy();

  await page.reload();
  await expect(page.getByText("Estado:")).toBeVisible();
  await expect(page.getByText("confirmed")).toBeVisible();
});
