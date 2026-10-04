import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { findRoom } from "@/lib/supabase/rooms";
import { signRoomToken } from "@/lib/room-token";
import { LobbyClient } from "./lobby-client";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const supabase = await createClient();

  // The room lookup does not depend on the authenticated user, so issue both
  // round-trips concurrently instead of waterfalling auth → room.
  const [
    {
      data: { user },
    },
    room,
  ] = await Promise.all([
    supabase.auth.getUser(),
    findRoom(supabase, code),
  ]);

  if (!user) {
    redirect(`/auth/sign-in?next=/rooms/${code}`);
  }

  if (!room) notFound();

  const displayName =
    (user.user_metadata?.name as string | undefined) ?? user.email?.split("@")[0] ?? "Player";

  const partyHost = process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? "localhost:1999";

  // The room server trusts identity only from this server-signed token.
  const secret = process.env.ROOM_TOKEN_SECRET;
  if (!secret) throw new Error("ROOM_TOKEN_SECRET is not set");
  const token = await signRoomToken(
    {
      room: room.code,
      userId: user.id,
      displayName,
      hostId: room.hostId,
      gameType: room.gameType,
    },
    secret,
  );

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <LobbyClient
        code={room.code}
        userId={user.id}
        token={token}
        hostId={room.hostId}
        partyHost={partyHost}
      />
    </main>
  );
}
