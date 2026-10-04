import type { Rng, RulesEngine } from "./engine";

/** A bot chooses the action for the player it plays as; null when it has no move to make. */
export interface Bot<State, Action> {
  getNextMove(state: State, playerId: string): Action | null;
}

/** The bot that plays as this player, or undefined when a human does. */
export type BotFor<State, Action> = (playerId: string) => Bot<State, Action> | undefined;

/**
 * The part of a rules engine that bot turns need, plus an optional fallbackMove: a move the
 * rules always accept for that player, made when the rules reject the bot's own choice.
 */
export type TurnRules<State, Action> = Pick<RulesEngine<State, Action, unknown>, "apply" | "activePlayer"> & {
  fallbackMove?: (state: State, playerId: string) => Action | null;
};

/**
 * Bot moves one call to playBotTurns may make, so a single call always returns and the caller
 * can show the table in between. It does not end a game: when a bot still has the move
 * afterwards (a table of only bots), the caller must call playBotTurns again.
 */
export const MAX_BOT_TURNS = 20;

/**
 * One bot move: when the active player is a bot, its action and the state after it;
 * null when a human must act, nobody can, or the bot has no move.
 */
export function botTurn<State, Action>(
  rules: TurnRules<State, Action>,
  state: State,
  botFor: BotFor<State, Action>,
  rng?: Rng,
): { action: Action; next: State } | null {
  const playerId = rules.activePlayer(state);
  if (playerId === null) return null;
  const bot = botFor(playerId);
  if (!bot) return null;
  const action = bot.getNextMove(state, playerId);
  if (action === null) return null;
  const next = rules.apply(state, action, rng);
  if (next !== state) return { action, next };

  // The rules rejected the bot's move: make the fallback move, or report no move rather than
  // one that changed nothing (which would leave the table waiting on that bot forever).
  const fallback = rules.fallbackMove?.(state, playerId) ?? null;
  if (fallback === null) return null;
  const afterFallback = rules.apply(state, fallback, rng);
  return afterFallback === state ? null : { action: fallback, next: afterFallback };
}

/**
 * Bot moves back to back until a human must act or nobody can, at most MAX_BOT_TURNS; call it
 * again while a bot still has the move. onMove sees every move as it is made, for per-move
 * feedback.
 */
export function playBotTurns<State, Action>(
  rules: TurnRules<State, Action>,
  state: State,
  botFor: BotFor<State, Action>,
  onMove?: (action: Action, before: State, after: State) => void,
  rng?: Rng,
): State {
  let current = state;
  for (let moves = 0; moves < MAX_BOT_TURNS; moves++) {
    const turn = botTurn(rules, current, botFor, rng);
    if (!turn) break;
    onMove?.(turn.action, current, turn.next);
    current = turn.next;
  }
  return current;
}
