import type { createClient } from "./server";
import { isRoomGameType, type RoomGameType } from "@/lib/room-token";

export type Room = {
  code: string;
  gameType: RoomGameType;
  hostId: string;
  hostDisplayName: string;
  status: RoomStatus;
};

/** Mirrors the check constraint on rooms.status. */
type RoomStatus = "waiting" | "playing" | "done";

function isRoomStatus(value: unknown): value is RoomStatus {
  return value === "waiting" || value === "playing" || value === "done";
}

/** The room an invite code names, or null. Codes are matched case-insensitively. */
export async function findRoom(
  supabase: Awaited<ReturnType<typeof createClient>>,
  code: string,
): Promise<Room | null> {
  const { data } = await supabase.rpc("room_by_code", { room_code: code }).maybeSingle();
  if (typeof data !== "object" || data === null) return null;
  const row: Record<string, unknown> = { ...data };
  const { code: roomCode, game_type, host_id, host_display_name, status } = row;
  if (
    typeof roomCode !== "string" ||
    !isRoomGameType(game_type) ||
    typeof host_id !== "string" ||
    typeof host_display_name !== "string" ||
    !isRoomStatus(status)
  ) {
    return null;
  }
  return { code: roomCode, gameType: game_type, hostId: host_id, hostDisplayName: host_display_name, status };
}
