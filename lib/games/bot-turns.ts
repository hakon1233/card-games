import type { Rng, RulesEngine } from "./engine";

/** A bot chooses the action for the player it plays as. */
export interface Bot<State, Action> {
  getNextMove(state: State, playerId: string): Action;
}

/** The bot that plays as this player, or undefined when a human does. */
export type BotFor<State, Action> = (playerId: string) => Bot<State, Action> | undefined;

/** The part of a rules engine that bot turns need. */
export type TurnRules<State, Action> = Pick<RulesEngine<State, Action, unknown>, "apply" | "activePlayer">;

/** Bot moves one call to playBotTurns may make, so a table of bots can never spin forever. */
export const MAX_BOT_TURNS = 20;

/**
 * One bot move: when the active player is a bot, its action and the state after it;
 * null when a human must act or nobody can.
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
  return { action, next: rules.apply(state, action, rng) };
}

/**
 * Bot moves back to back until a human must act or nobody can, at most MAX_BOT_TURNS.
 * onMove sees every move as it is made, for per-move feedback.
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
