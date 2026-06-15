import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";

export default function CrazyEightsPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="text-center">
        <BrandLogo className="mb-5 justify-center" imageClassName="h-16 max-w-[240px]" />
        <h1 className="mb-2 font-heading text-3xl font-bold text-foreground">Crazy Eights</h1>
        <p className="mb-8 text-muted-foreground">Game coming soon…</p>
        <Link
          href="/"
          className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          ← Back to games
        </Link>
      </div>
    </main>
  );
}
