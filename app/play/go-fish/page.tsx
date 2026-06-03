import Link from "next/link";

export default function GoFishPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="text-center">
        <h1 className="mb-2 text-3xl font-bold text-foreground">Go Fish</h1>
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
