import Link from "next/link";

export default function AuthErrorPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-bold text-foreground">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We couldn&apos;t complete the sign-in. Please try again.
        </p>
        <Link
          href="/auth/sign-in"
          className="mt-6 inline-block text-sm font-medium text-foreground underline underline-offset-4 hover:text-muted-foreground"
        >
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
