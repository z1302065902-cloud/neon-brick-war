/**
 * Afdian order redemption.
 *
 * The player pays on Afdian, gets an order number, and types it into the game. The order is
 * verified server-side (see `api/afdian-verify.ts`) rather than trusted on the client —
 * a client-side check would be a one-line edit away from being worthless.
 *
 * The endpoint lives on Vercel while the game may be served from GitHub Pages or itch, so the
 * URL has to be absolute in production. `VITE_AFDIAN_VERIFY_URL` injects it at build time;
 * without it we fall back to a same-origin `/api/...` path, which is what local dev and a
 * same-host deployment both want.
 */

const ENDPOINT =
  (import.meta.env.VITE_AFDIAN_VERIFY_URL as string | undefined)?.trim() ||
  '/api/afdian-verify';

/** Order numbers from Afdian. Loose on purpose — the server is the authority, not this. */
const ORDER_SHAPE = /^[A-Za-z0-9_-]{6,64}$/;

export const AFDIAN_PAGE = 'https://afdian.com/a/zsy';

export type RedeemResult =
  | { ok: true }
  | { ok: false; reason: 'format' | 'notfound' | 'network' | 'server'; detail?: string };

export function looksLikeOrder(text: string): boolean {
  return ORDER_SHAPE.test(text.trim());
}

/**
 * Ask the backend to confirm an order.
 *
 * Never throws: a dead endpoint must surface as a readable message in the UI, not an
 * unhandled rejection that silently breaks the pause menu.
 */
export async function redeemOrder(order: string): Promise<RedeemResult> {
  const trimmed = order.trim();
  if (!looksLikeOrder(trimmed)) return { ok: false, reason: 'format' };

  const url = `${ENDPOINT}${ENDPOINT.includes('?') ? '&' : '?'}order=${encodeURIComponent(trimmed)}`;
  try {
    const res = await fetch(url, { method: 'GET', headers: { accept: 'application/json' } });
    if (res.status === 404) return { ok: false, reason: 'notfound' };
    if (!res.ok) return { ok: false, reason: 'server', detail: `HTTP ${res.status}` };

    const body = (await res.json()) as { ok?: boolean; valid?: boolean; reason?: string };
    const granted = body.ok === true || body.valid === true;
    return granted ? { ok: true } : { ok: false, reason: 'notfound', detail: body.reason };
  } catch (err) {
    return { ok: false, reason: 'network', detail: String(err).slice(0, 120) };
  }
}
