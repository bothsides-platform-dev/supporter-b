/** Buyer-only GA4 boundary. Only enum values and sanitized routes leave this module. */
export const EVENTS = ['funnel_step_view', 'funnel_step_complete', 'funnel_step_error', 'funnel_cta_click', 'sign_up', 'quote_request_submitted'] as const;
export type FunnelEvent = typeof EVENTS[number];
export const STEPS = {
  acquisition: ['landing', 'quote_start', 'draft_complete', 'choose_login', 'choose_signup', 'member_return', 'submitted'],
  questions: ['website', 'solution', 'industry', 'products', 'sellers', 'cash', 'price', 'sales', 'delivery', 'contract', 'current-pgs', 'payment', 'annual', 'fee', 'limit', 'insurance', 'cycle', 'title', 'memo', 'attachments'],
  signup: ['email', 'company', 'profile', 'phone', 'account_created', 'auto_login', 'email_verification', 'approval_pending', 'app_entry'],
  request: ['entry', 'business', 'questions', 'recommendation', 'review', 'submitted'],
} as const;
export type FunnelId = keyof typeof STEPS;
export type EntryPath = 'guest' | 'member' | 'direct';
export type FunnelParams = {
  funnel_id: FunnelId; step_id: string; entry_path?: EntryPath;
  contract_type?: 'new' | 'renewal' | 'unknown'; mode?: 'write' | 'edit';
  progression?: 'next' | 'skip'; error_code?: string;
};
const ERRORS = ['VALIDATION', 'NETWORK_ERROR', 'STORAGE_ERROR', 'INVALID_WEBSITE', 'EMAIL_TAKEN', 'PHONE_NOT_VERIFIED', 'SIGNIN_FAILED', 'TOKEN_INVALID_OR_EXPIRED', 'UNKNOWN'];
const ROUTES = ['/', '/quote-start', '/rfp-create', '/signup/buyer', '/signup/buyer/workspace', '/signup/buyer/profile', '/login', '/pending-approval', '/auth/verify', '/home'];
export function safePagePath(value: string): string {
  try { const url = new URL(value, 'https://support-b.com'); return ROUTES.includes(url.pathname) ? url.pathname : '/other'; } catch { return '/other'; }
}
type Identity = { id?: string; workspaceType?: string; isMaster?: boolean } | null;
function attribution(location: string, referrer: string) {
  const out: Record<string, string> = {};
  try {
    const params = new URL(location, 'https://support-b.com').searchParams;
    const source = params.get('utm_source') ?? '';
    const medium = params.get('utm_medium') ?? '';
    if (['naver', 'google', 'bing', 'kakao', 'linkedin', 'facebook', 'instagram', 'newsletter'].includes(source)) out.campaign_source = source;
    if (['organic', 'cpc', 'paid_social', 'social', 'email', 'referral'].includes(medium)) out.campaign_medium = medium;
    const url = new URL(referrer);
    if (['www.google.com', 'www.google.co.kr', 'search.naver.com', 'm.search.naver.com', 'www.bing.com', 'm.dcinside.com', 'gall.dcinside.com', 'namu.wiki', 'chatgpt.com', 'www.perplexity.ai', 'www.linkedin.com'].includes(url.hostname)) out.page_referrer = `https://${url.hostname}/`;
  } catch { /* No arbitrary URL or campaign values leave the browser. */ }
  return out;
}
type Send = (...args: unknown[]) => void;
type Pending = { name: FunnelEvent | 'page_view'; params: Record<string, unknown>; key?: string };
export function createFunnelAnalytics(options: { production: boolean; send: Send; storage: () => Pick<Storage, 'getItem' | 'setItem'> }) {
  let measurementId = '';
  let identity: Identity | undefined;
  let pending: Pending[] = [];
  let campaign: Record<string, string> = {};
  const successes = new Set<string>();
  const safeSend: Send = (...args) => { try { options.send(...args); } catch { /* Analytics must never block work. */ } };
  const allowed = () => options.production && measurementId && identity !== undefined && (!identity || (identity.workspaceType === 'buyer' && !identity.isMaster));
  function deliver(item: Pending) {
    if (!allowed()) return;
    if (!identity && item.params.funnel_id === 'signup' && ['email_verification', 'approval_pending', 'app_entry'].includes(String(item.params.step_id))) return;
    if (item.key) {
      const key = `support-b:funnel:${identity?.id ?? 'anonymous'}:${item.name}:${item.key}`;
      if (successes.has(key)) return;
      try { if (options.storage().getItem(key)) return; } catch { /* In-memory fallback. */ }
      successes.add(key);
      try { options.storage().setItem(key, '1'); } catch { /* In-memory fallback. */ }
    }
    safeSend('event', item.name, { ...item.params, send_to: measurementId });
  }
  function drain() {
    if (!options.production || !measurementId || identity === undefined) return;
    const events = pending; pending = [];
    events.forEach(deliver);
  }
  return {
    configure(id: string, location = '/', referrer = '') { measurementId = /^G-[A-Z0-9]+$/.test(id) ? id : ''; campaign = attribution(location, referrer); },
    pageView(location: string, referrer = '') {
      if (!allowed()) return;
      const page = safePagePath(location);
      if (page === '/other') return;
      const params = { page_location: `https://support-b.com${page}`, page_title: page, page_referrer: '', ...attribution(location, referrer) };
      safeSend('set', params);
      deliver({ name: 'page_view', params });
    },
    identify(user: Identity) {
      const changed = JSON.stringify(identity) !== JSON.stringify(user);
      identity = user;
      if (options.production && measurementId && changed) safeSend('config', measurementId, {
        user_id: allowed() ? user?.id ?? null : null, send_page_view: false,
        page_location: 'https://support-b.com/', page_referrer: '', page_title: '/',
        ...campaign,
        allow_google_signals: false, allow_ad_personalization_signals: false,
      });
      drain();
    },
    track(name: FunnelEvent, input: FunnelParams, location: string, successKey?: string) {
      if (!options.production || !EVENTS.includes(name) || !(input.funnel_id in STEPS) || !(STEPS[input.funnel_id] as readonly string[]).includes(input.step_id)) return;
      const page = safePagePath(location);
      if (page === '/other') return;
      try { if (new URL(location, 'https://support-b.com').hostname !== 'support-b.com') return; } catch { return; }
      const params: Record<string, unknown> = {
        funnel_id: input.funnel_id, step_id: input.step_id,
        entry_path: ['guest', 'member', 'direct'].includes(input.entry_path ?? '') ? input.entry_path : 'direct',
        contract_type: ['new', 'renewal'].includes(input.contract_type ?? '') ? input.contract_type : 'unknown',
        mode: input.mode === 'edit' ? 'edit' : 'write',
        page_location: `https://support-b.com${page}`, page_referrer: '', page_title: page,
      };
      if (input.progression === 'next' || input.progression === 'skip') params.progression = input.progression;
      if (name === 'funnel_step_error') params.error_code = ERRORS.includes(input.error_code ?? '') ? input.error_code : 'UNKNOWN';
      const item = { name, params, key: name === 'quote_request_submitted' || name === 'sign_up' ? successKey : undefined };
      if (identity === undefined || !measurementId) { pending.push(item); pending = pending.slice(-100); } else deliver(item);
    },
    flush(): Promise<void> {
      if (!options.production || (!allowed() && pending.length === 0)) return Promise.resolve();
      return new Promise(resolve => {
        const timer = setTimeout(resolve, 300);
        // A local queue callback gives gtag an opportunity to process prior events.
        safeSend('get', measurementId, 'client_id', () => { clearTimeout(timer); resolve(); });
      });
    },
  };
}

// The standard gtag arguments queue works before the remote SDK has loaded.
function send(...args: unknown[]) {
  const target = window as Window & { dataLayer?: unknown[] };
  if (!target.dataLayer) { target.dataLayer = []; send('js', new Date()); }
  // gtag's queue consumes IArguments commands, not GTM event objects.
  // eslint-disable-next-line prefer-rest-params -- Required gtag queue representation.
  function command(..._values: unknown[]) { return arguments; }
  target.dataLayer.push(command(...args));
}
export const funnelAnalytics = createFunnelAnalytics({
  production: process.env.NODE_ENV === 'production', send,
  storage: () => localStorage,
});
export function funnelEntry(): EntryPath {
  if (typeof window === 'undefined') return 'direct';
  if (window.location.pathname === '/quote-start' || new URLSearchParams(window.location.search).get('resume') === 'guest' || new URLSearchParams(window.location.search).get('next') === '/rfp-create?resume=guest') return 'guest';
  return window.location.pathname === '/rfp-create' ? 'member' : 'direct';
}
export function trackFunnel(name: FunnelEvent, params: FunnelParams, key?: string) {
  if (typeof window === 'undefined') return;
  funnelAnalytics.track(name, { entry_path: funnelEntry(), ...params }, window.location.href, key);
}
export const flushFunnel = () => funnelAnalytics.flush();
