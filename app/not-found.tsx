import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-center">
      <h1 className="text-4xl font-bold text-foreground">404</h1>
      <p className="mt-2 text-muted-foreground">Page not found</p>
      <Link
        href="/"
        className="mt-6 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        Back to games
      </Link>
    </main>
  );
}
