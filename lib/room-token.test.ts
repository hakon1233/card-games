import { describe, it, expect } from "vitest";
import { signRoomToken, verifyRoomToken } from "./room-token";

const claims = {
  room: "ABC234",
  userId: "user-1",
  displayName: "Ada",
  hostId: "user-1",
  gameType: "go_fish" as const,
};
const NOW = Date.UTC(2026, 9, 4, 12);
const DAY = 24 * 60 * 60 * 1000;

describe("room tokens", () => {
  it("round-trip the signed claims for the same room", async () => {
    const token = await signRoomToken(claims, "s3cret", NOW);

    expect(await verifyRoomToken(token, "ABC234", "s3cret", NOW)).toEqual({
      ...claims,
      exp: NOW + DAY,
    });
  });

  it("expire after 24 hours", async () => {
    const token = await signRoomToken(claims, "s3cret", NOW);

    expect(await verifyRoomToken(token, "ABC234", "s3cret", NOW + DAY - 1)).not.toBeNull();
    expect(await verifyRoomToken(token, "ABC234", "s3cret", NOW + DAY)).toBeNull();
  });

  it("reject a token whose claims were edited", async () => {
    const token = await signRoomToken(claims, "s3cret", NOW);
    const [, signature] = token.split(".");
    const forged = btoa(JSON.stringify({ ...claims, userId: "user-2", exp: NOW + DAY }))
      .replace(/=+$/, "");

    expect(await verifyRoomToken(`${forged}.${signature}`, "ABC234", "s3cret", NOW)).toBeNull();
  });

  it("reject a missing secret, junk and non-strings", async () => {
    const token = await signRoomToken(claims, "s3cret", NOW);

    expect(await verifyRoomToken(token, "ABC234", "", NOW)).toBeNull();
    for (const junk of [undefined, 42, "", "abc", "a.b.c", "!!!.???"]) {
      expect(await verifyRoomToken(junk, "ABC234", "s3cret", NOW)).toBeNull();
    }
  });
});
