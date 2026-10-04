import { describe, expect, it } from "vitest";
import * as blackjack from "./blackjack";
import * as crazyEights from "./crazy-eights";
import * as goFish from "./go-fish";
import * as yaniv from "./yaniv";
import { seededRng, type Rng, type RulesEngine } from "./engine";
import type { Card } from "./types";

// Every game module is a rules engine (checked at compile time).
blackjack satisfies RulesEngine<blackjack.BlackjackState, blackjack.BlackjackAction, blackjack.BlackjackPlayerView>;
crazyEights satisfies RulesEngine<
  crazyEights.CrazyEightsState,
  crazyEights.CrazyEightsAction,
  crazyEights.CrazyEightsPlayerView
>;
goFish satisfies RulesEngine<goFish.GoFishGameState, goFish.GoFishAction, goFish.GoFishPlayerView>;
yaniv satisfies RulesEngine<yaniv.YanivGameState, yaniv.YanivAction, yaniv.YanivPlayerView>;

/** What the shared behaviour tests need to know about one game. */
interface Fixture<S, A, V> {
  engine: RulesEngine<S, A, V>;
  deal: (rng: Rng) => S;
  /** The seated players' ids. */
  players: string[];
  /** A state and an action by a player who is not the active player in it. */
  outOfTurn: (dealt: S) => { state: S; action: A };
  hand: (state: S, playerId: string) => Card[];
  /** Cards every player may see: the discard pile, the dealer's up-card. */
  faceUp: (state: S) => Card[];
  /** States in which the round or game is over. */
  ended: (dealt: S) => S[];
}

function isCard(value: unknown): value is Card {
  return typeof value === "object" && value !== null && "suit" in value && "rank" in value;
}

function cardsIn(value: unknown): Card[] {
  if (isCard(value)) return [value];
  if (Array.isArray(value)) return value.flatMap(cardsIn);
  if (typeof value === "object" && value !== null) return Object.values(value).flatMap(cardsIn);
  return [];
}

const key = (c: Card) => `${c.rank}-${c.suit}`;

/** Face-up cards reachable in `value` that are neither in the player's hand nor on the table. */
function cardsPlayerMayNotSee<S, A, V>(value: unknown, f: Fixture<S, A, V>, state: S, playerId: string) {
  const allowed = new Set([...f.hand(state, playerId), ...f.faceUp(state)].map(key));
  // A card flagged hidden is face-down (Blackjack's hole card) and is shown as a card back.
  return cardsIn(value).filter((c) => !c.hidden && !allowed.has(key(c)));
}

function rulesEngineContract<S, A, V>(name: string, f: Fixture<S, A, V>) {
  describe(`${name} rules engine`, () => {
    it("deals the same game from the same seed", () => {
      expect(f.deal(seededRng(11))).toEqual(f.deal(seededRng(11)));
    });

    it("ignores an action by a player whose turn it is not", () => {
      const { state, action } = f.outOfTurn(f.deal(seededRng(2)));
      expect(f.engine.apply(state, action, seededRng(3))).toBe(state);
    });

    it("gives each player a view with no opponent's hand and no draw pile cards", () => {
      const state = f.deal(seededRng(2));
      for (const playerId of f.players) {
        // The full state does hold cards this player may not see, so the check can fail.
        expect(cardsPlayerMayNotSee(state, f, state, playerId)).not.toEqual([]);
        expect(cardsPlayerMayNotSee(f.engine.playerView(state, playerId), f, state, playerId)).toEqual([]);
      }
    });

    it("names a seated player as active while the game is in progress, and nobody once it is over", () => {
      const dealt = f.deal(seededRng(2));
      expect(f.players).toContain(f.engine.activePlayer(dealt));
      for (const over of f.ended(dealt)) {
        expect(f.engine.activePlayer(over)).toBeNull();
      }
    });
  });
}

const SEATS = [
  { id: "p1", name: "One", isBot: false },
  { id: "p2", name: "Two", isBot: true },
  { id: "p3", name: "Three", isBot: true },
];
const IDS = SEATS.map((s) => s.id);

rulesEngineContract<blackjack.BlackjackState, blackjack.BlackjackAction, blackjack.BlackjackPlayerView>("Blackjack", {
  engine: blackjack,
  // Seed 2 deals no natural, so the game is still in progress.
  deal: (rng) => blackjack.deal("g", "p1", rng),
  players: ["p1"],
  // One seat: once the player stands nobody is active, and a hit does nothing.
  outOfTurn: (dealt) => ({
    state: blackjack.apply(dealt, { type: "STAND", playerId: "p1" }),
    action: { type: "HIT", playerId: "p1" },
  }),
  hand: (s) => s.playerHand.cards,
  faceUp: (s) => s.dealerHand.filter((c) => !c.hidden),
  ended: (dealt) => [blackjack.apply(dealt, { type: "STAND", playerId: "p1" })],
});

rulesEngineContract<
  crazyEights.CrazyEightsState,
  crazyEights.CrazyEightsAction,
  crazyEights.CrazyEightsPlayerView
>("Crazy Eights", {
  engine: crazyEights,
  deal: (rng) => crazyEights.deal("g", IDS, [false, true, true], rng),
  players: IDS,
  outOfTurn: (state) => ({ state, action: { type: "DRAW_CARD", playerId: "p2" } }),
  hand: (s, id) => s.players.find((p) => p.id === id)?.hand ?? [],
  faceUp: (s) => s.discardPile,
  ended: (dealt) => [{ ...dealt, status: "round_over", winnerId: "p1" }],
});

rulesEngineContract<goFish.GoFishGameState, goFish.GoFishAction, goFish.GoFishPlayerView>("Go Fish", {
  engine: goFish,
  deal: (rng) => goFish.deal("g", SEATS, rng),
  players: IDS,
  outOfTurn: (state) => ({
    state,
    action: { type: "ASK", playerId: "p2", targetPlayerId: "p1", rank: state.players[1].hand[0].rank },
  }),
  hand: (s, id) => s.players.find((p) => p.id === id)?.hand ?? [],
  faceUp: () => [],
  ended: (dealt) => [{ ...dealt, status: "over", winners: ["p1"] }],
});

rulesEngineContract<yaniv.YanivGameState, yaniv.YanivAction, yaniv.YanivPlayerView>("Yaniv", {
  engine: yaniv,
  deal: (rng) => yaniv.deal("g", SEATS, undefined, rng),
  players: IDS,
  outOfTurn: (state) => ({
    state,
    action: { type: "DISCARD_AND_DRAW", playerId: "p2", discardIndices: [0], drawFromDiscard: false },
  }),
  hand: (s, id) => s.players.find((p) => p.id === id)?.hand ?? [],
  faceUp: (s) => s.discardPile,
  ended: (dealt) => [
    { ...dealt, status: "round_over" },
    { ...dealt, status: "game_over", winnerId: "p1" },
  ],
});
