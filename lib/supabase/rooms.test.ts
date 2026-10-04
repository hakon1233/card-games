import { describe, expect, it } from "vitest";
import { findRoom } from "./rooms";

// A stand-in for the Supabase client: room_by_code answers with `row`.
function clientReturning(row: unknown) {
  const calls: unknown[] = [];
  const client = {
    rpc: (fn: string, args: unknown) => {
      calls.push([fn, args]);
      return { maybeSingle: async () => ({ data: row, error: null }) };
    },
  };
  return { client: client as unknown as Parameters<typeof findRoom>[0], calls };
}

const row = {
  code: "ABC234",
  game_type: "go_fish",
  host_id: "host-1",
  host_display_name: "Ada",
  status: "waiting",
};

describe("findRoom", () => {
  it("looks the code up through room_by_code and returns the room", async () => {
    const { client, calls } = clientReturning(row);

    expect(await findRoom(client, "abc234")).toEqual({
      code: "ABC234",
      gameType: "go_fish",
      hostId: "host-1",
      hostDisplayName: "Ada",
      status: "waiting",
    });
    expect(calls).toEqual([["room_by_code", { room_code: "abc234" }]]);
  });

  it("returns null for no room or a row it does not recognise", async () => {
    for (const bad of [null, { ...row, game_type: "poker" }, { ...row, host_id: 7 }]) {
      expect(await findRoom(clientReturning(bad).client, "ABC234")).toBeNull();
    }
  });
});
