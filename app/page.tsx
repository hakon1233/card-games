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
  {
    slug: "yaniv",
    name: "Yaniv",
    tagline: "Get low, call Yaniv, win the round",
    emoji: "🎯",
  },
];

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col bg-background">
      <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Card Games
          </h1>
          <p className="mt-3 text-lg text-muted-foreground">
            Pick a game and play against a bot
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {GAMES.map((game) => (
            <GameCard key={game.slug} {...game} />
          ))}
        </div>
      </div>
    </main>
  );
}
