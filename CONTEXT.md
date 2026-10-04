# Card Games

Four card games played in the browser against bots — Yaniv, Blackjack, Crazy Eights and Go
Fish — plus multiplayer rooms where signed-in players gather before a game.

## Language

### Shared

**Game**:
One playthrough of one of the four card games, from the deal to a winner.
_Avoid_: match, session

**Rules engine**:
The pure rules of one game: it deals a game and turns a game state plus a player's action into the
next game state.
_Avoid_: reducer, logic, game service

**Action**:
One move a player asks to make, such as playing a card, drawing or asking for a rank. The rules
engine decides whether it is legal.
_Avoid_: intent, move (in code), event

**Bot**:
A computer-controlled player that chooses its own actions.
_Avoid_: AI, CPU

**Hand**:
The cards one player holds.

**Draw pile**:
The face-down cards players draw from.
_Avoid_: deck (in UI copy), Pond, stock

**Discard pile**:
The face-up cards played or thrown away; only its top cards matter to play.

**Player view**:
What one player is allowed to see of a game: their own hand, every opponent's hand size and the
size of the draw pile.
_Avoid_: public state, redacted state

**Round**:
In Yaniv, one deal that ends when a player calls Yaniv; a game is many rounds.
_Avoid_: hand (for a deal)

**Card colours**:
The player's choice of colour theme for card faces.
_Avoid_: card deck (for the theme)

### Yaniv

**Yaniv** (the call):
Ending the round by declaring your hand total is at or under the Yaniv threshold.

**Yaniv threshold**:
The highest hand total at which a player may call Yaniv (default 7).

**Assaf**:
When another player's hand total is at or under the caller's; the caller takes a penalty instead
of scoring zero.

**Save rule**:
A score that lands exactly on 50 or 100 drops to 25 or 50.

**Elimination score**:
The score at which a player is out of the game (default 200).
_Avoid_: score limit (in UI copy), bust

**Eliminated**:
Out of the game after reaching the elimination score.
_Avoid_: busted

**Quick Draw**:
An optional rule: after a player discards and before they draw, another player may take the card
just discarded.
_Avoid_: snap

**Turn clock**:
The countdown a player has to act before a default move is made for them.
_Avoid_: timer, countdown

### Go Fish

**Ask**:
A Go Fish action: asking one opponent for all their cards of a rank.

**Go Fish** (the outcome):
The asked player has none of that rank, so the asker draws from the draw pile.

**Book**:
All four cards of one rank, laid down by the player who collects them.
_Avoid_: set

### Blackjack

**Dealer**:
The house hand the player plays against in Blackjack.

**Bust**:
A Blackjack hand worth more than 21.

**Natural**:
A two-card Blackjack hand worth exactly 21.
_Avoid_: blackjack (for the hand)

### Multiplayer rooms

**Room**:
A place where signed-in players gather to play Crazy Eights or Go Fish together, identified by a
room code.
_Avoid_: party, lobby (for the room itself)

**Room code**:
The six-character code that names a room and goes in its invite link.

**Host**:
The player who created the room and alone may start the game.

**Lobby**:
A room's waiting phase, before the host starts the game.

**Room token**:
The server-signed proof of who a player is, which a room requires before it lets them in.

## Flagged ambiguities

- **"Bust"** means over 21 in Blackjack, but the Yaniv scoreboard code also says "busted" for
  eliminated. Canonical: bust = Blackjack only; eliminated = Yaniv.
- **"Session"** is used for the running win/loss tally on a game page and for the Supabase sign-in
  session.
