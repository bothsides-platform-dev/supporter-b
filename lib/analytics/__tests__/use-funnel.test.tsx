import { StrictMode } from 'react';
import { renderHook } from '@testing-library/react';
import { expect,it,vi } from 'vitest';
import { useFunnelView } from '../use-funnel';
const track=vi.hoisted(()=>vi.fn());
vi.mock('../funnel',()=>({trackFunnel:track}));
it('deduplicates Strict Mode and rerenders but records back navigation, edits and remounts',()=>{
 const {rerender,unmount}=renderHook(({step,mode}:{step:string;mode:'write'|'edit'})=>useFunnelView('questions',step,{mode}),{initialProps:{step:'website',mode:'write'},wrapper:StrictMode});
 expect(track).toHaveBeenCalledTimes(1);rerender({step:'website',mode:'write'});expect(track).toHaveBeenCalledTimes(1);
 rerender({step:'solution',mode:'write'});rerender({step:'website',mode:'write'});expect(track).toHaveBeenCalledTimes(3);
 rerender({step:'website',mode:'edit'});expect(track).toHaveBeenLastCalledWith('funnel_step_view',expect.objectContaining({mode:'edit'}));
 unmount();renderHook(()=>useFunnelView('questions','website'));expect(track).toHaveBeenCalledTimes(5);
});
