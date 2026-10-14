export const CLARITY_PROJECT_ID = 'xiq81e87yn';
export type ClaritySession = { userId: string; sessionId: string };

// Best effort: the hosted SDK exposes metadata callbacks (microsoft/clarity,
// packages/clarity-js/src/data/metadata.ts). Do not parse private cookies.
export function captureGuestClarity(draftId: string, event: string): Promise<ClaritySession | undefined> {
  const clarity = typeof window === 'undefined' ? undefined :
    (window as Window & { clarity?: (...args: unknown[]) => void }).clarity;
  if (typeof clarity !== 'function') return Promise.resolve(undefined);
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(undefined), 1500);
    const finish = (session?: ClaritySession) => { clearTimeout(timer); resolve(session); };
    try {
      clarity('set', 'guest_rfp_draft', draftId);
      clarity('event', `guest_rfp_${event}`);
      clarity('metadata', (data: unknown) => {
        if (!data || typeof data !== 'object') return finish();
        const { projectId, userId, sessionId } = data as Record<string, unknown>;
        if (projectId !== CLARITY_PROJECT_ID || typeof userId !== 'string' ||
          typeof sessionId !== 'string' || !/^[a-z0-9]{1,64}$/.test(userId) ||
          !/^[a-z0-9]{1,64}$/.test(sessionId)) return finish();
        finish({ userId, sessionId });
      }, false);
    } catch { finish(); }
  });
}
