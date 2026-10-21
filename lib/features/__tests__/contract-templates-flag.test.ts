import {expect,it} from 'vitest';
import {CONTRACT_TEMPLATES_ENABLED} from '../contract-templates';
import {getNavCommands} from '@/lib/nav/nav-config';
it('폐지한 계약 템플릿은 재노출하지 않는다',()=>{
 expect(CONTRACT_TEMPLATES_ENABLED).toBe(false);
 expect(getNavCommands('pg').some(x=>x.href==='/contract-templates')).toBe(false);
});
