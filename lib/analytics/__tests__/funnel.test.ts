import { beforeEach, expect, it, vi } from 'vitest';
import { createFunnelAnalytics, safePagePath } from '../funnel';
const event = { funnel_id: 'acquisition', step_id: 'landing', entry_path: 'guest', mode: 'write' } as const;
let send = vi.fn();
beforeEach(() => { send = vi.fn(); localStorage.clear(); });
const create = (production = true) => createFunnelAnalytics({ production, send, storage: () => localStorage });
it('queues until configured and identity resolved, then sets user before events', () => {
 const a = create(); a.track('funnel_step_view', event, '/?email=secret'); a.configure('G-TEST'); expect(send).not.toHaveBeenCalled();
 a.identify({ id: 'internal-id', workspaceType: 'buyer' });
 expect(send.mock.calls[0]).toEqual(['config', 'G-TEST', expect.objectContaining({ user_id: 'internal-id', send_page_view: false })]);
 expect(send.mock.calls[1]).toEqual(['event','funnel_step_view',expect.objectContaining({ page_location: 'https://support-b.com/',page_referrer: '',page_title:'/',send_to:'G-TEST' })]);
});
it('never sends arbitrary fields, errors, query strings or sensitive path segments', () => {
 const a=create(); a.configure('G-TEST'); a.identify(null);
 a.track('funnel_step_error', { ...event, email:'secret',error_code:'email@private.com' } as never, '/auth/verify?token=secret');
 const payload=send.mock.calls.at(-1)![2];
 expect(payload).toMatchObject({ error_code:'UNKNOWN',page_location:'https://support-b.com/auth/verify' });
 expect(JSON.stringify(send.mock.calls)).not.toContain('secret'); expect(JSON.stringify(send.mock.calls)).not.toContain('email@');
 expect(safePagePath('/rfp/private-id?token=secret')).toBe('/other');
 a.track('funnel_step_view', {...event,step_id:'private-name'} as never,'/');
 expect(send.mock.calls.filter(c=>c[0]==='event')).toHaveLength(1);
});
it.each([{workspaceType:'pg'}, {workspaceType:'buyer',isMaster:true}])('discards queued excluded identities %j', user => {
 const a=create(); a.track('funnel_step_view',event,'/'); a.configure('G-TEST'); a.identify(user); expect(send.mock.calls.filter(c=>c[0]==='event')).toHaveLength(0);
});
it('excludes development, demo, tutorial, partner host and unknown session', () => {
 const a=create(false); a.configure('G-TEST'); a.identify(null); a.track('funnel_step_view',event,'/'); expect(send).not.toHaveBeenCalled();
 const b=create(); b.configure('G-TEST'); b.track('funnel_step_view',event,'/'); expect(send).not.toHaveBeenCalled(); b.identify(null);
 send.mockClear(); for(const path of ['/demo','/tutorial','/inbox','https://partner.support-b.com/']) b.track('funnel_step_view',event,path);
 expect(send).not.toHaveBeenCalled();
});
it('clears identity on logout and changes identity before later events', () => {
 const a=create();a.configure('G-TEST');a.identify({id:'one',workspaceType:'buyer'});a.identify(null);a.identify({id:'two',workspaceType:'buyer'});
 expect(send.mock.calls.map(c=>c[2].user_id)).toEqual(['one',null,'two']);
});
it('deduplicates successful request keys across instances, never views or new requests', () => {
 const a=create();a.configure('G-TEST');a.identify({id:'one',workspaceType:'buyer'});
 for(let i=0;i<2;i++) a.track('quote_request_submitted',{...event,funnel_id:'request',step_id:'submitted'},'/rfp-create','key');
 const b=create();b.configure('G-TEST');b.identify({id:'one',workspaceType:'buyer'});b.track('quote_request_submitted',{...event,funnel_id:'request',step_id:'submitted'},'/rfp-create','key');
 b.track('quote_request_submitted',{...event,funnel_id:'request',step_id:'submitted'},'/rfp-create','other');
 expect(send.mock.calls.filter(c=>c[1]==='quote_request_submitted')).toHaveLength(2);
 a.track('funnel_step_view',event,'/');a.track('funnel_step_view',event,'/'); expect(send.mock.calls.filter(c=>c[1]==='funnel_step_view')).toHaveLength(2);
});
it('storage and transport failures never break business flow; flush waits at most 300ms',async()=>{
 vi.useFakeTimers();
 const a=createFunnelAnalytics({production:true,send:()=>{throw Error('blocked')},storage:()=>{throw Error('blocked')}});
 expect(()=>{a.configure('G-TEST');a.identify(null);a.track('quote_request_submitted',{...event,funnel_id:'request',step_id:'submitted'},'/rfp-create','key')}).not.toThrow();
 const done=vi.fn();void a.flush().then(done); await vi.advanceTimersByTimeAsync(300);expect(done).toHaveBeenCalledOnce();vi.useRealTimers();
});

it('preserves sanitized page views and allowlisted source/medium without raw URLs',()=>{
 const a=create();a.configure('G-TEST');a.identify(null);
 a.pageView('/?utm_source=naver&utm_medium=organic&email=secret','https://m.search.naver.com/search?query=private');
 expect(send).toHaveBeenLastCalledWith('event','page_view',expect.objectContaining({page_location:'https://support-b.com/',page_referrer:'https://m.search.naver.com/',campaign_source:'naver',campaign_medium:'organic'}));
 a.pageView('/auth/verify?token=secret&utm_source=private@example.com','https://private.example.com/secret');
 expect(JSON.stringify(send.mock.calls)).not.toContain('secret'); expect(JSON.stringify(send.mock.calls)).not.toContain('private');
});
it('does not treat anonymous email-verification or app access as buyer events',()=>{
 const a=create();a.configure('G-TEST');a.identify(null);
 a.track('funnel_step_complete',{funnel_id:'signup',step_id:'email_verification'},'/auth/verify');
 expect(send.mock.calls.filter(c=>c[0]==='event')).toHaveLength(0);
});

it('gives pending identity a bounded opportunity before hard navigation', async () => {
 vi.useFakeTimers(); const a=create(); a.track('funnel_step_view',event,'/'); const done=vi.fn(); void a.flush().then(done); await vi.advanceTimersByTimeAsync(0); expect(done).not.toHaveBeenCalled(); a.configure('G-TEST'); a.identify(null); await vi.advanceTimersByTimeAsync(300); expect(done).toHaveBeenCalledOnce(); expect(send.mock.calls.filter(c=>c[0]==='event')).toHaveLength(1); vi.useRealTimers();
});
