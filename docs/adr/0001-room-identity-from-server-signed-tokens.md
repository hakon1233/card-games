# Room identity comes from server-signed tokens

The PartyKit room server learns who a socket is from a short-lived HMAC token that the Next.js
server signs from the Supabase session and the room row, not by verifying Supabase JWTs inside the
room. The room then needs one shared secret (`ROOM_TOKEN_SECRET`) and no Supabase keys, network
calls or JWKS handling, and the token also carries the room's host and game, so the room can open
its lobby without an HTTP create call that would need its own authentication. The cost: the secret
must be set in both deployments, and a token stays valid for its lifetime (24 hours) even if the
user signs out.
