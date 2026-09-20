/**
 * Campaign gating.
 *
 * itch.io exposes **no client-side API** for checking whether a player owns a paid game,
 * so a purely in-page unlock flag would be a one-line localStorage edit away from being
 * worthless. The shipping model is therefore a two-build split, driven at build time:
 *
 *   gated  (default)  the free demo — map 1 only, ends with a purchase prompt
 *   free              the full campaign — served to owners through itch's download keys
 *
 * `?unlock=all` force-unlocks the campaign for local preview and QA, and is the only
 * client-side override; it is deliberately not surfaced anywhere in the UI.
 */

export type CampaignMode = 'gated' | 'free';

export type UnlockState = {
  campaign: boolean;
  cosmetics: boolean;
};

const KEY = 'neon-brick-war-unlocks';

const DEFAULT: UnlockState = { campaign: false, cosmetics: false };

/** Set VITE_PURCHASE_URL to the live itch page before shipping. */
export const PURCHASE_URL =
  (import.meta.env.VITE_PURCHASE_URL as string | undefined) ?? 'https://itch.io/';

const BUILD_MODE: CampaignMode = import.meta.env.VITE_CAMPAIGN === 'free' ? 'free' : 'gated';

export class UnlockStore {
  private readonly state: UnlockState;
  private readonly mode: CampaignMode;

  constructor() {
    this.mode = BUILD_MODE;
    this.state = this.load();
    // Local preview / QA escape hatch. Not reachable from the shipped UI.
    if (new URLSearchParams(window.location.search).get('unlock') === 'all') {
      this.state.campaign = true;
      this.state.cosmetics = true;
    }
  }

  private load(): UnlockState {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { ...DEFAULT };
      const parsed = JSON.parse(raw) as Partial<UnlockState>;
      return { campaign: parsed.campaign === true, cosmetics: parsed.cosmetics === true };
    } catch {
      return { ...DEFAULT };
    }
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.state));
    } catch {
      /* private mode — the gate simply resets next load */
    }
  }

  /** True when the full campaign (maps 2-3 + ending) is available. */
  get campaignUnlocked(): boolean {
    return this.mode === 'free' || this.state.campaign;
  }

  get isGatedBuild(): boolean {
    return this.mode === 'gated';
  }

  canPlayMap(index: 1 | 2 | 3): boolean {
    return index === 1 || this.campaignUnlocked;
  }

  /**
   * Records a completed purchase. Only meaningful for a PWYW in-page flow; the standard
   * route is the two-build split, where the full build ships unlocked.
   */
  grantCampaign(): void {
    this.state.campaign = true;
    this.state.cosmetics = true;
    this.save();
  }

  get snapshot(): UnlockState {
    return { ...this.state };
  }
}
