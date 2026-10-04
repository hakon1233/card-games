import { describe, it, expect } from "vitest";
import { signRoomToken, verifyRoomToken } from "./room-token";

const claims = {
  room: "ABC234",
  userId: "user-1",
  displayName: "Ada",
  hostId: "user-1",
  gameType: "go_fish" as const,
};
const SECRET = "a-room-token-secret-of-32-chars!!";
const NOW = Date.UTC(2026, 9, 4, 12);
const DAY = 24 * 60 * 60 * 1000;

describe("room tokens", () => {
  it("round-trip the signed claims for the same room", async () => {
    const token = await signRoomToken(claims, SECRET, NOW);

    expect(await verifyRoomToken(token, "ABC234", SECRET, NOW)).toEqual({
      ...claims,
      exp: NOW + DAY,
    });
  });

  it("expire after 24 hours", async () => {
    const token = await signRoomToken(claims, SECRET, NOW);

    expect(await verifyRoomToken(token, "ABC234", SECRET, NOW + DAY - 1)).not.toBeNull();
    expect(await verifyRoomToken(token, "ABC234", SECRET, NOW + DAY)).toBeNull();
  });

  it("reject a token whose claims were edited", async () => {
    const token = await signRoomToken(claims, SECRET, NOW);
    const [, signature] = token.split(".");
    const forged = btoa(JSON.stringify({ ...claims, userId: "user-2", exp: NOW + DAY }))
      .replace(/=+$/, "");

    expect(await verifyRoomToken(`${forged}.${signature}`, "ABC234", SECRET, NOW)).toBeNull();
  });

  it("refuse a secret shorter than 32 characters", async () => {
    const token = await signRoomToken(claims, SECRET, NOW);

    await expect(signRoomToken(claims, "too-short", NOW)).rejects.toThrow(/32 characters/);
    expect(await verifyRoomToken(token, "ABC234", SECRET.slice(0, 31), NOW)).toBeNull();
  });

  it("reject a missing secret, junk and non-strings", async () => {
    const token = await signRoomToken(claims, SECRET, NOW);

    expect(await verifyRoomToken(token, "ABC234", "", NOW)).toBeNull();
    for (const junk of [undefined, 42, "", "abc", "a.b.c", "!!!.???"]) {
      expect(await verifyRoomToken(junk, "ABC234", SECRET, NOW)).toBeNull();
    }
  });
});
