import { expect, it } from 'vitest';

import { buildContractTabEntries } from '../build-contract-tab-entries';

it('PG와 레거시 계약에는 계약 탭을 만들지 않는다',()=>{
 for(const side of ['pg','buyer'] as const){
  expect(buildContractTabEntries({rfpCode:'P-1',signing:{contract:{kind:'pg_buyer'}} as never,side,contact:null})).toEqual([]);
 }
 expect(buildContractTabEntries({rfpCode:'P-1',signing:{contract:{kind:'platform_buyer'}} as never,side:'pg',contact:null})).toEqual([]);
});
