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

  // Initialise PartyKit room state
  const partyHost = process.env.PARTYKIT_HOST ?? "localhost:1999";
  const partyUrl = `http://${partyHost}/parties/main/${code}`;
  await fetch(partyUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      hostId: user.id,
      hostDisplayName: displayName,
      gameType: body.gameType,
    }),
  }).catch(() => {
    // PartyKit init failing is non-fatal — first player join will trigger onStart
  });

  return NextResponse.json({ code }, { status: 201 });
}
