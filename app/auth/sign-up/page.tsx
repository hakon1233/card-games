import Link from "next/link";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { GoogleButton } from "@/components/auth/google-button";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; invite?: string }>;
}) {
  const { next = "/", invite } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-foreground">
            {invite ? "Sign up to join the game" : "Create an account"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {invite
              ? "Sign up to join your friend's game."
              : "Play with friends and track your games."}
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <GoogleButton next={next} />
          <div className="relative flex items-center">
            <div className="flex-1 border-t border-border" />
            <span className="mx-3 text-xs text-muted-foreground">or</span>
            <div className="flex-1 border-t border-border" />
          </div>
          <SignUpForm next={next} />
        </div>
        <div className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href={`/auth/sign-in?next=${encodeURIComponent(next)}${invite ? "&invite=1" : ""}`}
            className="font-medium text-foreground underline underline-offset-4 hover:text-muted-foreground"
          >
            Sign in
          </Link>
        </div>
        <div className="mt-4 text-center">
          <Link
            href="/"
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Back to games
          </Link>
        </div>
      </div>
    </main>
  );
}
