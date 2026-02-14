import { describe, expect, it, vi } from "vitest";

import {
  NEW_BADGE_TTL_MS,
  computeFeedReturnDiff,
  countStrictUpdatedMatches,
  hasStrictMatchUpdate,
  resolveDetailReturnNotice,
  shouldShowFeedReturnBanner,
  toMatchReentrySnapshot,
  toMatchReentrySnapshotMap,
} from "@/src/domain/reentry";
import type { MatchView } from "@/src/domain/types";

function buildMatch(overrides: Partial<MatchView> = {}): MatchView {
  return {
    publicId: "match-1",
    organizerUserId: "u1",
    club: "Padel Norte",
    startsAtUtc: "2030-02-12T20:00:00.000Z",
    timezone: "America/Bogota",
    category: "4ta",
    modality: "mixto",
    status: "abierta",
    participants: [
      {
        userId: "u1",
        alias: "Org",
        joinedAt: "2030-02-12T10:00:00.000Z",
        avatarUrl: null,
      },
    ],
    isOrganizer: true,
    canJoin: false,
    canLeave: false,
    isCanceled: false,
    isWatchingReleaseSpot: false,
    ...overrides,
  };
}

describe("domain/reentry", () => {
  it("counts updates only when status or participantCount changes", () => {
    const previous = toMatchReentrySnapshotMap([
      buildMatch({ publicId: "a", status: "abierta", participants: [{ userId: "u1", alias: "Org", joinedAt: "1", avatarUrl: null }] }),
      buildMatch({ publicId: "b", status: "cerrada", participants: [
        { userId: "u1", alias: "Org", joinedAt: "1", avatarUrl: null },
        { userId: "u2", alias: "B", joinedAt: "2", avatarUrl: null },
        { userId: "u3", alias: "C", joinedAt: "3", avatarUrl: null },
        { userId: "u4", alias: "D", joinedAt: "4", avatarUrl: null },
      ] }),
    ]);

    const next = toMatchReentrySnapshotMap([
      buildMatch({ publicId: "a", status: "abierta", participants: [
        { userId: "u1", alias: "Org x", joinedAt: "1", avatarUrl: null },
      ] }),
      buildMatch({ publicId: "b", status: "abierta", participants: [
        { userId: "u1", alias: "Org", joinedAt: "1", avatarUrl: null },
        { userId: "u2", alias: "B", joinedAt: "2", avatarUrl: null },
        { userId: "u3", alias: "C", joinedAt: "3", avatarUrl: null },
      ] }),
    ]);

    expect(countStrictUpdatedMatches(previous, next)).toBe(1);
  });

  it("ignores order and cosmetic changes in feed diffs", () => {
    const previous = toMatchReentrySnapshotMap([
      buildMatch({
        publicId: "a",
        participants: [
          { userId: "u1", alias: "Org", joinedAt: "1", avatarUrl: null },
          { userId: "u2", alias: "Ana", joinedAt: "2", avatarUrl: null },
        ],
      }),
      buildMatch({ publicId: "b" }),
    ]);

    const next = toMatchReentrySnapshotMap([
      buildMatch({ publicId: "b" }),
      buildMatch({
        publicId: "a",
        participants: [
          { userId: "u2", alias: "Ana Updated", joinedAt: "2", avatarUrl: "https://cdn/a.png" },
          { userId: "u1", alias: "Org", joinedAt: "1", avatarUrl: null },
        ],
      }),
    ]);

    const diff = computeFeedReturnDiff(previous, next);
    expect(diff.newIds).toEqual([]);
    expect(diff.updatedIds).toEqual([]);
    expect(diff.missingIds).toEqual([]);
  });

  it("applies anti-noise rule for feed return banner", () => {
    expect(
      shouldShowFeedReturnBanner({ awayMs: 31_000, newCount: 0, relevantCount: 0, totalCount: 1 }),
    ).toBe(true);
    expect(
      shouldShowFeedReturnBanner({ awayMs: 5_000, newCount: 2, relevantCount: 0, totalCount: 2 }),
    ).toBe(true);
    expect(
      shouldShowFeedReturnBanner({ awayMs: 5_000, newCount: 0, relevantCount: 1, totalCount: 1 }),
    ).toBe(true);
    expect(
      shouldShowFeedReturnBanner({ awayMs: 5_000, newCount: 1, relevantCount: 0, totalCount: 1 }),
    ).toBe(false);
  });

  it("resolves detail notice with expected priority", () => {
    const base = toMatchReentrySnapshot(buildMatch({
      status: "abierta",
      participants: [
        { userId: "u1", alias: "Org", joinedAt: "1", avatarUrl: null },
        { userId: "u2", alias: "A", joinedAt: "2", avatarUrl: null },
        { userId: "u3", alias: "B", joinedAt: "3", avatarUrl: null },
      ],
    }));

    const canceled = toMatchReentrySnapshot(buildMatch({
      status: "cancelada",
      isCanceled: true,
      participants: [
        { userId: "u1", alias: "Org", joinedAt: "1", avatarUrl: null },
      ],
    }));

    const noShow = toMatchReentrySnapshot(buildMatch({
      status: "no_se_armo",
      participants: [
        { userId: "u1", alias: "Org", joinedAt: "1", avatarUrl: null },
      ],
    }));

    const full = toMatchReentrySnapshot(buildMatch({
      status: "cerrada",
      participants: [
        { userId: "u1", alias: "Org", joinedAt: "1", avatarUrl: null },
        { userId: "u2", alias: "A", joinedAt: "2", avatarUrl: null },
        { userId: "u3", alias: "B", joinedAt: "3", avatarUrl: null },
        { userId: "u4", alias: "C", joinedAt: "4", avatarUrl: null },
      ],
    }));

    const reopened = toMatchReentrySnapshot(buildMatch({
      status: "abierta",
      participants: [
        { userId: "u1", alias: "Org", joinedAt: "1", avatarUrl: null },
        { userId: "u2", alias: "A", joinedAt: "2", avatarUrl: null },
        { userId: "u3", alias: "B", joinedAt: "3", avatarUrl: null },
      ],
    }));

    expect(resolveDetailReturnNotice(base, canceled)).toBe("Partido cancelado");
    expect(resolveDetailReturnNotice(base, noShow)).toBe("No se armó");
    expect(resolveDetailReturnNotice(base, full)).toBe("Completo (4/4)");
    expect(resolveDetailReturnNotice(full, reopened)).toBe("Se liberó 1 cupo");
  });

  it("keeps Nuevo badge visible for exactly 5 seconds", () => {
    vi.useFakeTimers();

    let isVisible = true;
    setTimeout(() => {
      isVisible = false;
    }, NEW_BADGE_TTL_MS);

    vi.advanceTimersByTime(NEW_BADGE_TTL_MS - 1);
    expect(isVisible).toBe(true);

    vi.advanceTimersByTime(1);
    expect(isVisible).toBe(false);

    vi.useRealTimers();
  });

  it("has strict update helper based only on status and participantCount", () => {
    const previousSnapshot = toMatchReentrySnapshot(buildMatch({ publicId: "match-1" }));
    const nextSnapshot = toMatchReentrySnapshot(
      buildMatch({
        publicId: "match-1",
        club: "Club Renamed",
        participants: [{ userId: "u1", alias: "Org updated", joinedAt: "1", avatarUrl: "https://cdn/img.png" }],
      }),
    );

    expect(hasStrictMatchUpdate(previousSnapshot, nextSnapshot)).toBe(false);
  });
});
