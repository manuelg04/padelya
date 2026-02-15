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

test("operación de grupos: admin genera grupos/fixture y jugador ve mis partidos", async ({ page, request, browser }) => {
  const adminPhone = "3009000100";
  const adminToken = await createApiUser(request, adminPhone, "Admin Operacion");

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
      name: "Torneo Operación",
      startsAtLocal: "2030-02-21T18:00",
      description: "Operación de grupos",
      categories: [{ name: "Mixto Avanzado", capacity: 8 }],
    },
  });
  expect(createdTournament.ok()).toBeTruthy();
  const createdBody = (await createdTournament.json()) as {
    tournamentSlug: string;
    categorySlugs: string[];
  };

  const tournamentSlug = createdBody.tournamentSlug;
  const categorySlug = createdBody.categorySlugs[0]!;

  const registrationIds: string[] = [];
  const firstPlayerPhone = "3009000201";
  let firstPlayerToken = "";

  for (let index = 1; index <= 8; index += 1) {
    const phone = `300900020${index}`;
    const token = await createApiUser(request, phone, `Jugador ${index}`);
    if (index === 1) {
      firstPlayerToken = token;
    }

    const registration = await request.post(
      `/api/tournaments/${encodeURIComponent(tournamentSlug)}/categorias/${encodeURIComponent(categorySlug)}/registrations`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        data: {
          teamName: `Team ${index}`,
        },
      },
    );
    expect(registration.ok()).toBeTruthy();
    const registrationPayload = (await registration.json()) as { registrationId: string };
    registrationIds.push(registrationPayload.registrationId);

    const confirmed = await request.patch(
      `/api/admin/tournaments/registrations/${encodeURIComponent(registrationPayload.registrationId)}/status`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        data: { status: "confirmed" },
      },
    );
    expect(confirmed.ok()).toBeTruthy();
  }

  await page.goto(`/admin/torneos/${tournamentSlug}/categorias/${categorySlug}`);
  await completeAuth(page, adminPhone, "Admin Operacion");
  await expect(page.getByRole("heading", { name: "Operación de grupos" })).toBeVisible();

  await page.getByRole("button", { name: "Generar grupos" }).click();
  await expect(page.getByText("Grupos generados.")).toBeVisible();

  const firstGroupSelect = page.locator("select").first();
  await firstGroupSelect.selectOption("B");
  await expect(page.getByText("Equipo movido de grupo.")).toBeVisible();

  await page.getByRole("button", { name: "Generar partidos de grupos" }).click();
  await expect(page.getByText("Partidos de grupos generados.")).toBeVisible();
  await expect(page.getByText("Partidos de grupos ya generados.")).toBeVisible();

  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  await publicPage.goto(`http://127.0.0.1:3000/torneos/${tournamentSlug}/categorias/${categorySlug}`);
  await expect(publicPage.getByRole("heading", { name: "Grupos y partidos" })).toBeVisible();
  await expect(publicPage.getByText("Grupo A").first()).toBeVisible();
  await expect(publicPage.getByText("vs")).toHaveCount(12);

  const playerContext = await browser.newContext();
  const playerPage = await playerContext.newPage();
  await playerPage.goto(
    `http://127.0.0.1:3000/login?redirect=${encodeURIComponent(`/torneos/${tournamentSlug}/categorias/${categorySlug}`)}`,
  );
  await completeAuth(playerPage, firstPlayerPhone, "Jugador 1");
  await expect(playerPage).toHaveURL(new RegExp(`/torneos/${tournamentSlug}/categorias/${categorySlug}`));
  const myMatchesCard = playerPage.locator("div").filter({
    has: playerPage.getByRole("heading", { name: "Mis partidos" }),
  });
  await expect(myMatchesCard.getByRole("heading", { name: "Mis partidos" })).toBeVisible();

  const myMatchesResponse = await request.get(
    `/api/tournaments/${encodeURIComponent(tournamentSlug)}/categorias/${encodeURIComponent(categorySlug)}`,
    {
      headers: {
        Authorization: `Bearer ${firstPlayerToken}`,
      },
    },
  );
  expect(myMatchesResponse.ok()).toBeTruthy();
  const myMatchesPayload = (await myMatchesResponse.json()) as {
    category: {
      myGroupMatches: unknown[];
    };
  };
  expect(myMatchesPayload.category.myGroupMatches).toHaveLength(3);

  await publicContext.close();
  await playerContext.close();

  const frozenChange = await request.patch(
    `/api/admin/tournaments/registrations/${encodeURIComponent(registrationIds[0]!)}/status`,
    {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
      data: { status: "waitlist" },
    },
  );
  expect(frozenChange.ok()).toBeFalsy();
});

test("iteración 3: admin reporta resultado y público ve tabla + clasificados en tiempo real", async ({
  page,
  request,
  browser,
}) => {
  const adminPhone = "3009010100";
  const adminToken = await createApiUser(request, adminPhone, "Admin Resultados");

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
      name: "Torneo Resultados E2E",
      startsAtLocal: "2030-02-22T18:00",
      description: "Resultados y tabla",
      categories: [{ name: "Mixto Elite", capacity: 8 }],
    },
  });
  expect(createdTournament.ok()).toBeTruthy();
  const createdBody = (await createdTournament.json()) as {
    tournamentSlug: string;
    categorySlugs: string[];
  };

  const tournamentSlug = createdBody.tournamentSlug;
  const categorySlug = createdBody.categorySlugs[0]!;

  for (let index = 1; index <= 8; index += 1) {
    const phone = `300901020${index}`;
    const token = await createApiUser(request, phone, `Jugador R${index}`);

    const registration = await request.post(
      `/api/tournaments/${encodeURIComponent(tournamentSlug)}/categorias/${encodeURIComponent(categorySlug)}/registrations`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        data: {
          teamName: `Team R${index}`,
        },
      },
    );
    expect(registration.ok()).toBeTruthy();
    const registrationPayload = (await registration.json()) as { registrationId: string };

    const confirmed = await request.patch(
      `/api/admin/tournaments/registrations/${encodeURIComponent(registrationPayload.registrationId)}/status`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        data: { status: "confirmed" },
      },
    );
    expect(confirmed.ok()).toBeTruthy();
  }

  const generatedGroups = await request.post(
    `/api/admin/tournaments/${encodeURIComponent(tournamentSlug)}/categorias/${encodeURIComponent(categorySlug)}/groups`,
    {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
      data: {},
    },
  );
  expect(generatedGroups.ok()).toBeTruthy();

  const generatedMatches = await request.post(
    `/api/admin/tournaments/${encodeURIComponent(tournamentSlug)}/categorias/${encodeURIComponent(categorySlug)}/group-matches`,
    {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    },
  );
  expect(generatedMatches.ok()).toBeTruthy();

  await page.goto(`/admin/torneos/${tournamentSlug}/categorias/${categorySlug}`);
  await completeAuth(page, adminPhone, "Admin Resultados");
  await expect(page.getByRole("heading", { name: "Resultados de grupos" })).toBeVisible();

  const winnerSelect = page.locator("select[id^='winner-']").first();
  await winnerSelect.selectOption({ index: 0 });

  const numberInputs = page.locator("input[type='number']");
  await numberInputs.nth(0).fill("6");
  await numberInputs.nth(1).fill("4");
  await numberInputs.nth(2).fill("6");
  await numberInputs.nth(3).fill("3");

  await page.getByRole("button", { name: "Guardar resultado" }).first().click();
  await expect(page.getByText("Resultado guardado.")).toBeVisible();

  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  await publicPage.goto(`http://127.0.0.1:3000/torneos/${tournamentSlug}/categorias/${categorySlug}`);

  await expect(publicPage.getByRole("heading", { name: "Tabla de posiciones" })).toBeVisible();
  await expect(publicPage.getByRole("heading", { name: "Clasificados" })).toBeVisible();
  await expect(publicPage.getByText("Resultado: 6-4 / 6-3")).toBeVisible();

  const detailResponse = await request.get(
    `/api/tournaments/${encodeURIComponent(tournamentSlug)}/categorias/${encodeURIComponent(categorySlug)}`,
  );
  expect(detailResponse.ok()).toBeTruthy();
  const detailPayload = (await detailResponse.json()) as {
    category: {
      groupStage: {
        standingsByGroup: unknown[];
        qualifiedTeams: unknown[];
        matchesByGroup: Array<{ matches: Array<{ status: string; result: unknown }> }>;
      } | null;
    };
  };
  expect(detailPayload.category.groupStage?.standingsByGroup.length).toBeGreaterThan(0);
  expect(detailPayload.category.groupStage?.qualifiedTeams.length).toBe(4);
  expect(detailPayload.category.groupStage?.matchesByGroup[0]?.matches.some((match) => match.status === "completed")).toBe(
    true,
  );

  await publicContext.close();
});
