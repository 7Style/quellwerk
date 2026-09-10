/**
 * Model routing (ADR-0011). Model ids come from the environment and appear
 * nowhere else in the code, so switching a route is one line in the
 * configuration and never a search through the source.
 */
import { env } from './env.config.js';

export type ModelRole = 'chat' | 'fast' | 'judge';

export const models = {
  /** Chat and reports (one effort, shared cache namespace), overview, mind map, audio script */
  chat: env.MODEL_CHAT,
  /** Source guide, notebook title, follow-up questions */
  fast: env.MODEL_FAST,
  /** Eval judges only; must differ from the model under test */
  judge: env.MODEL_JUDGE,
} as const satisfies Record<ModelRole, string>;

/**
 * One effort for chat and reports: they share a cache namespace, and changing
 * effort invalidates it (ADR-0007).
 */
export const effortChat = env.EFFORT_CHAT;

/**
 * Requests on the fast model carry no `output_config.effort` (the model rejects
 * the parameter) and no `thinking` (only `{type:'enabled', budget_tokens:N}`
 * would work there, and short structured outputs do not need it).
 */
export function supportsEffort(model: string): boolean {
  return model !== models.fast;
}

/**
 * Minimum prefix length for a cache breakpoint to do anything. Below it the
 * request is processed without caching and no error is returned, so the only
 * visible trace is `cache_read_input_tokens` staying at zero
 * (prompts/README.md, cache rule 7).
 */
export const CACHE_MIN_TOKENS: Record<string, number> = {
  'claude-opus-5': 512,
  'claude-sonnet-5': 1_024,
  'claude-haiku-4-5': 4_096,
};
