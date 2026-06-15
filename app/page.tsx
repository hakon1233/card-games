import { GameCard } from "@/components/game-card";
import { BrandLogo } from "@/components/brand-logo";

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
        <div className="mb-12 flex flex-col items-center text-center">
          <BrandLogo imageClassName="h-24 max-w-[290px] sm:h-28 sm:max-w-[340px]" />
          <p className="pip-eyebrow mt-5 text-xs">Playing & Card Co.</p>
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
