// Signed room tokens: how the PartyKit room learns who a socket is.
//
// The Next.js server knows the signed-in user (Supabase session) and the room
// row, so it signs those facts with a secret it shares with the room server.
// The room trusts nothing a client says about identity — only a token whose
// signature, room and expiry check out. HMAC-SHA256 via WebCrypto, which both
// Node and the PartyKit (workerd) runtime provide.

export type RoomGameType = "crazy_eights" | "go_fish";

export type RoomClaims = {
  room: string;
  userId: string;
  displayName: string;
  hostId: string;
  gameType: RoomGameType;
  /** Expiry, epoch milliseconds. */
  exp: number;
};

const TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000;

export async function signRoomToken(
  claims: Omit<RoomClaims, "exp">,
  secret: string,
  now = Date.now(),
): Promise<string> {
  const payload = encode(JSON.stringify({ ...claims, exp: now + TOKEN_LIFETIME_MS }));
  const signature = await crypto.subtle.sign("HMAC", await key(secret), bytes(payload));
  return `${payload}.${encode(new Uint8Array(signature))}`;
}

/** The token's claims if it is genuine, unexpired and for `room`; otherwise null. */
export async function verifyRoomToken(
  token: unknown,
  room: string,
  secret: string,
  now = Date.now(),
): Promise<RoomClaims | null> {
  if (typeof token !== "string" || !secret) return null;
  const [payload, signature, ...rest] = token.split(".");
  if (!payload || !signature || rest.length > 0) return null;

  const signatureBytes = decode(signature);
  if (!signatureBytes) return null;
  const genuine = await crypto.subtle.verify("HMAC", await key(secret), signatureBytes, bytes(payload));
  if (!genuine) return null;

  const json = decode(payload);
  if (!json) return null;
  const claims = parseClaims(new TextDecoder().decode(json));
  if (!claims || claims.room !== room || claims.exp <= now) return null;
  return claims;
}

function parseClaims(text: string): RoomClaims | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { room, userId, displayName, hostId, gameType, exp } = value as Record<string, unknown>;
  if (
    typeof room !== "string" ||
    typeof userId !== "string" ||
    typeof displayName !== "string" ||
    typeof hostId !== "string" ||
    (gameType !== "crazy_eights" && gameType !== "go_fish") ||
    typeof exp !== "number"
  ) {
    return null;
  }
  return { room, userId, displayName, hostId, gameType, exp };
}

function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    bytes(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function bytes(text: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(text);
}

function encode(data: string | Uint8Array): string {
  const raw = typeof data === "string" ? bytes(data) : data;
  return btoa(String.fromCharCode(...raw))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function decode(text: string): Uint8Array<ArrayBuffer> | null {
  try {
    const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  } catch {
    return null;
  }
}
