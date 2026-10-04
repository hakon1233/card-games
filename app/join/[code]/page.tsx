import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { findRoom } from "@/lib/supabase/rooms";
import type { RoomGameType } from "@/lib/room-token";

const GAME_LABELS: Record<RoomGameType, string> = {
  crazy_eights: "Crazy Eights",
  go_fish: "Go Fish",
};

export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const supabase = await createClient();

  const room = await findRoom(supabase, code);

  if (!room) notFound();

  const gameLabel = GAME_LABELS[room.gameType];
  const nextPath = `/rooms/${room.code}`;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm text-center">
        <div className="mb-8">
          <p className="text-5xl mb-4">🃏</p>
          <h1 className="text-2xl font-bold text-foreground">
            {room.hostDisplayName} invited you to play {gameLabel}
          </h1>
          {room.status !== "waiting" && (
            <p className="mt-2 text-sm text-muted-foreground">
              This game has already started.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <Link
            href={`/auth/sign-in?next=${encodeURIComponent(nextPath)}&invite=1`}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Sign in to join
          </Link>
          <Link
            href={`/auth/sign-up?next=${encodeURIComponent(nextPath)}&invite=1`}
            className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Create an account
          </Link>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          Room code: <span className="font-mono font-medium">{room.code}</span>
        </p>
      </div>
    </main>
  );
}
