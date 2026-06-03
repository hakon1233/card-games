"use client";

import { Button } from "@/components/ui/button";
import { signInWithGoogle } from "@/app/actions/auth";

export function GoogleButton({ next = "/" }: { next?: string }) {
  return (
    <Button
      type="button"
      className="h-11 w-full"
      onClick={() => signInWithGoogle(next)}
    >
      Sign in with Google
    </Button>
  );
}
