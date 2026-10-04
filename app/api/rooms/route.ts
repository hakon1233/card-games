import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { gameType: "crazy_eights" | "go_fish" };

  if (body.gameType !== "crazy_eights" && body.gameType !== "go_fish") {
    return NextResponse.json({ error: "Invalid game type" }, { status: 400 });
  }

  const displayName =
    (user.user_metadata?.name as string | undefined) ?? user.email?.split("@")[0] ?? "Player";

  // Retry in the rare event of a code collision
  let code = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    code = generateCode();
    const { error } = await supabase.from("rooms").insert({
      code,
      game_type: body.gameType,
      host_id: user.id,
      host_display_name: displayName,
    });
    if (!error) break;
    if (attempt === 4) {
      return NextResponse.json({ error: "Failed to create room" }, { status: 500 });
    }
  }

  return NextResponse.json({ code }, { status: 201 });
}
