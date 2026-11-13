// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate, pk, defaultChoice, DRUG_IDS } from '../study/pharmacology';
import { RHOS, PUBLISHED_PD_VERSION, HN_VERSION } from '../study/pd-registry';
import { multimodal } from '../study/multimodal';
import { step, identity } from '../pharmacology/pk/linear';
const p = { age: 40, weight: 70, height: 175, sex: 'male' as const };
test('unresolved Ce serializes as null and inactive agents remain absent', () => {
 const s = simulate(p, [{id:'a',drug:'fentanyl',kind:'bolus',value:100,t:0}], 1).at(-1)!;
 for (const d of ['fentanyl','alfentanil','sufentanil','morphine','ketamine'] as const) {
  assert.equal(s.ce[d], null); assert.ok(s.ceUnavailableReason![d]);
 }
 assert.equal(JSON.parse(JSON.stringify(s)).ce.fentanyl, null);
 assert.equal(multimodal(simulate(p,[],0)[0],defaultChoice,40).H.value,0);
});
test('source variant corrections preserve exact author microparameters', () => {
 const f=pk('fentanyl',p), a=pk('alfentanil',p);
 assert.equal(f.cl,6.09*.0827); assert.equal(f.v2,6.09*.471/.102);
 assert.equal(a.v1,.111*70); assert.equal(f.ke0,null); assert.equal(a.ke0,null);
 assert.equal(pk('propofol',p,{...defaultChoice,propofol:'marsh'}).ke0,.26);
});
test('raw sample time and finite delivery boundaries retain exact cumulative mass', () => {
 const events=[{id:'l',drug:'propofol' as const,kind:'bolus' as const,value:60,t:3,durationSeconds:7},
 {id:'i1',drug:'propofol' as const,kind:'infusion' as const,value:60,t:10},
 {id:'i2',drug:'propofol' as const,kind:'infusion' as const,value:120,t:10},
 {id:'stop',drug:'propofol' as const,kind:'infusion' as const,value:0,t:20}];
 const r=simulate(p,events,21/60,defaultChoice,{sampleEverySeconds:1,diagnostics:true});
 assert.equal(r.length,22);assert.equal(r[3].cp.propofol,0);
 assert.ok(Math.abs(r[10].diagnostics!.cumulative.propofol-60)<1e-9);
 assert.ok(Math.abs(r[20].diagnostics!.cumulative.propofol-(60+120/360))<1e-9);
 for(const s of r) {
  const q=s.diagnostics!;
  assert.ok(Math.abs(q.amounts.propofol.reduce((a,b)=>a+b,0)+q.eliminated.propofol-q.cumulative.propofol)<1e-8);
 }
});
test('numerical residual preserves raw evidence and refuses significant negative state', () => {
 let evidence:number[]=[];
 const result=step(identity(5),[-1e-12,0,0,0],0,raw=>{evidence=raw;});
 assert.equal(result[0],0); assert.equal(evidence[0],-1e-12);
 assert.throws(()=>step(identity(5),[-1e-6,0,0,0],0));
});
test('H/N configuration is separately versioned and removes the legacy cross-domain rho rule', () => {
 assert.notEqual(HN_VERSION as string,PUBLISHED_PD_VERSION as string);
 assert.equal(HN_VERSION,'som-hn-3.0.0');
 assert.deepEqual(RHOS,[]);
 const z=simulate(p,[],0)[0]; for(const d of DRUG_IDS) assert.equal(z.cp[d],0);
});
