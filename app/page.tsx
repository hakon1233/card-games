import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { GameCard } from "@/components/game-card";

const GAMES = [
  {
    slug: "blackjack",
    name: "Blackjack",
    tagline: "Beat the dealer to 21",
    emoji: "🃏",
  },
  {
    slug: "crazy-eights",
    name: "Crazy Eights",
    tagline: "Match the card, change the suit",
    emoji: "🎴",
  },
  {
    slug: "go-fish",
    name: "Go Fish",
    tagline: "Collect the most sets to win",
    emoji: "🐟",
  },
];

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex min-h-screen flex-col bg-background">
      <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Card Games
          </h1>
          <p className="mt-3 text-lg text-muted-foreground">
            Pick a game and play against a bot or challenge your friends
          </p>
          {user ? (
            <div className="mt-6 flex items-center justify-center gap-3">
              <Link
                href="/rooms/create"
                className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
              >
                Play with friends
              </Link>
            </div>
          ) : (
            <div className="mt-6 flex items-center justify-center gap-3">
              <Link
                href="/auth/sign-in"
                className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
              >
                Sign in
              </Link>
              <Link
                href="/auth/sign-up"
                className="inline-flex items-center justify-center rounded-md border border-border bg-background px-5 py-2.5 text-sm font-semibold text-foreground shadow-sm hover:bg-accent"
              >
                Create account
              </Link>
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {GAMES.map((game) => (
            <GameCard key={game.slug} {...game} />
          ))}
        </div>
      </div>
    </main>
  );
}
