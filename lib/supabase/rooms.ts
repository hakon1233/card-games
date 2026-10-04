import type { createClient } from "./server";
import type { RoomGameType } from "@/lib/room-token";

export type Room = {
  code: string;
  gameType: RoomGameType;
  hostId: string;
  hostDisplayName: string;
  status: string;
};

/** The room an invite code names, or null. Codes are matched case-insensitively. */
export async function findRoom(
  supabase: Awaited<ReturnType<typeof createClient>>,
  code: string,
): Promise<Room | null> {
  const { data } = await supabase.rpc("room_by_code", { room_code: code }).maybeSingle();
  if (typeof data !== "object" || data === null) return null;
  const { code: roomCode, game_type, host_id, host_display_name, status } = data as Record<string, unknown>;
  if (
    typeof roomCode !== "string" ||
    (game_type !== "crazy_eights" && game_type !== "go_fish") ||
    typeof host_id !== "string" ||
    typeof host_display_name !== "string" ||
    typeof status !== "string"
  ) {
    return null;
  }
  return { code: roomCode, gameType: game_type, hostId: host_id, hostDisplayName: host_display_name, status };
}
