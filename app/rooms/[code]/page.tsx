import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LobbyClient } from "./lobby-client";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/sign-in?next=/rooms/${code}`);
  }

  const { data: room } = await supabase
    .from("rooms")
    .select("code, game_type, host_id, host_display_name, status")
    .eq("code", code.toUpperCase())
    .single();

  if (!room) notFound();

  const displayName =
    (user.user_metadata?.name as string | undefined) ?? user.email?.split("@")[0] ?? "Player";

  const partyHost = process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? "localhost:1999";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <LobbyClient
        code={room.code}
        userId={user.id}
        displayName={displayName}
        hostId={room.host_id}
        partyHost={partyHost}
      />
    </main>
  );
}
