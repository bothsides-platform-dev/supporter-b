import { expect,it,vi,beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { Analytics } from '../Analytics';
const state=vi.hoisted(()=>({data:{user:{id:'one',workspaceType:'buyer',isMaster:false}},path:'/'}));
const configure=vi.hoisted(()=>vi.fn());const identify=vi.hoisted(()=>vi.fn());
const journeyTrack = vi.hoisted(() => vi.fn());
vi.mock('@/lib/guest-rfp/journey-client', () => ({ configureJourneyAnalytics: vi.fn(), guestJourney: {
 identity: vi.fn(), selected: () => null, capture: vi.fn(), flush: vi.fn(), track: journeyTrack,
} }));
vi.mock('@/components/landing/use-session-authed',()=>({useAnalyticsSession:()=>({data:state.data})}));
vi.mock('@/lib/analytics/funnel',()=>({funnelAnalytics:{configure,identify,pageView:vi.fn()},trackFunnel:vi.fn()}));
vi.mock('next/navigation',()=>({usePathname:()=>state.path}));
vi.mock('next/script',()=>({default:({src}:{src:string})=><div data-testid="script" data-src={src}/>}));
beforeEach(()=>{vi.stubEnv('NODE_ENV','production');});
it('loads once, shares session identity and updates on account switch',()=>{
 const view=render(<Analytics gaId="G-TEST123"/>);
 expect(view.getByTestId('script')).toHaveAttribute('data-src','https://www.googletagmanager.com/gtag/js?id=G-TEST123');
 expect(configure).toHaveBeenCalledWith('G-TEST123',expect.any(String),expect.any(String));expect(identify).toHaveBeenCalledWith(state.data.user);
 state.data={user:{id:'two',workspaceType:'buyer',isMaster:false}};view.rerender(<Analytics gaId="G-TEST123"/>);expect(identify).toHaveBeenLastCalledWith(state.data.user);
});
it('does not load without a measurement id or in development',()=>{
 const view=render(<Analytics/>);expect(view.queryByTestId('script')).toBeNull();
 vi.stubEnv('NODE_ENV','development');view.rerender(<Analytics gaId="G-TEST123"/>);expect(view.queryByTestId('script')).toBeNull();
});
it('listens for internal actions even without GA configured', () => {
 vi.stubEnv('NEXT_PUBLIC_GUEST_RFP_SLACK_THREADS_ENABLED', 'true');
 const view = render(<Analytics />);
 window.dispatchEvent(new CustomEvent('support-b:funnel', { detail: { name: 'funnel_step_view', params: { funnel_id: 'questions', step_id: 'industry' } } }));
 expect(journeyTrack).toHaveBeenCalledWith('funnel_step_view', { funnel_id: 'questions', step_id: 'industry' });
 view.unmount();
 vi.unstubAllEnvs();
});

it('does not reinterpret a cached pre-login session as logout on navigation', async () => {
 vi.stubEnv('NEXT_PUBLIC_GUEST_RFP_SLACK_THREADS_ENABLED', 'true');
 const { guestJourney } = await import('@/lib/guest-rfp/journey-client');
 vi.mocked(guestJourney.identity).mockClear();
 state.path = '/login';
 const view = render(<Analytics />);
 expect(guestJourney.identity).toHaveBeenCalledTimes(1);
 state.path = '/rfp-create'; view.rerender(<Analytics />);
 expect(guestJourney.identity).toHaveBeenCalledTimes(1);
 view.unmount(); vi.unstubAllEnvs();
});
