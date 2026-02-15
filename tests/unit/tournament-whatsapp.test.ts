import { describe, expect, it } from "vitest";

import {
  buildCategoryAnnouncementMessage,
  buildCategoryConfirmedListMessage,
  buildCategoryPaymentMessage,
  buildCategoryReminderMessage,
  buildTournamentCategoryUrl,
} from "@/src/domain/tournament";
import type { AdminCategoryDashboard, PublicTournamentCategoryDetail } from "@/src/domain/types";

const categoryDetail: PublicTournamentCategoryDetail = {
  tournament: {
    id: "t1",
    slug: "torneo-prueba",
    name: "Torneo Prueba",
    startsAtUtc: "2030-01-20T23:00:00.000Z",
    timezone: "America/Bogota",
    description: "Desc",
    prizes: "Premios",
    priceInfo: "$60.000",
    posterUrl: null,
  },
  club: {
    id: "c1",
    slug: "smash-club",
    name: "Smash Club",
  },
  category: {
    id: "cat1",
    slug: "mixto",
    name: "Mixto",
    capacity: 16,
    note: null,
    counts: {
      pending: 3,
      confirmed: 10,
      waitlist: 2,
      cancelled: 1,
    },
  },
  myRegistration: null,
};

const dashboard: AdminCategoryDashboard = {
  tournament: {
    id: "t1",
    slug: "torneo-prueba",
    name: "Torneo Prueba",
    startsAtUtc: "2030-01-20T23:00:00.000Z",
    timezone: "America/Bogota",
  },
  club: {
    slug: "smash-club",
    name: "Smash Club",
    paymentInstructions: "Nequi 3000000000",
  },
  category: {
    id: "cat1",
    slug: "mixto",
    name: "Mixto",
    capacity: 16,
    note: null,
    counts: {
      pending: 3,
      confirmed: 10,
      waitlist: 2,
      cancelled: 1,
    },
  },
  registrations: {
    pending: [],
    confirmed: [
      {
        id: "r1",
        status: "confirmed",
        createdAt: "2030-01-01T00:00:00.000Z",
        updatedAt: "2030-01-01T00:00:00.000Z",
        primaryUserId: "u1",
        primaryAlias: "Ana",
        primaryPhone: "+573001111111",
        teamName: "Ana/Lu",
        partnerPhone: "+573009999999",
      },
    ],
    waitlist: [],
    cancelled: [],
  },
};

describe("tournament WhatsApp messages", () => {
  it("builds all message types", () => {
    const url = buildTournamentCategoryUrl("https://app.test", "torneo-prueba", "mixto");

    const announcement = buildCategoryAnnouncementMessage(categoryDetail, url);
    const confirmed = buildCategoryConfirmedListMessage(dashboard);
    const payment = buildCategoryPaymentMessage(dashboard);
    const reminder = buildCategoryReminderMessage(categoryDetail, url);

    expect(announcement).toContain("Inscripción: https://app.test/torneos/torneo-prueba/categorias/mixto");
    expect(confirmed).toContain("Confirmados 10/16");
    expect(payment).toContain("Nequi 3000000000");
    expect(reminder).toContain("Recordatorio");
  });
});
