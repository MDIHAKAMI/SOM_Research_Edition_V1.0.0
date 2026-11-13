// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
/* Production adapter only. Expected values are calculated separately in Python. */
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||'.'),out=path.resolve(process.argv[3]);
const load=n=>require(path.join(root,'work/verification-build/study',n+'.js'));
const p=load('pharmacology'), m=load('multimodal'),pd=load('pd-registry'),pair=load('pair-registry'),roc=load('rocuronium');
const {forecastDrug}=load('forecast');
const inputs=JSON.parse(fs.readFileSync(path.join(out,'inputs.json')));
const lines=(name,rows)=>fs.writeFileSync(path.join(out,name),rows.map(x=>JSON.stringify(x)).join('\n')+'\n');
let rows=[];
for(const c of inputs.histories){
 const params=Object.fromEntries(p.IV.map(d=>[d,p.pk(d,c.patient,c.choice)]));
 for(const t of p.simulate(c.patient,c.events,c.seconds/60,c.choice,{sampleEverySeconds:c.sampleEverySeconds,diagnostics:true}))rows.push({id:c.id,params,t:t.t,cp:t.cp,ce:t.ce,endpointCe:t.endpointCe,diagnostics:t.diagnostics});
}
lines('application_pk.jsonl',rows);console.log('PK rows',rows.length);
rows=[];for(const s of inputs.snapshots)for(const tailPolicy of inputs.protocol.tails)rows.push({id:s.id,tailPolicy,result:m.multimodal(s.trace,p.defaultChoice,s.age,undefined,{tailPolicy})});
lines('application_hn.jsonl',rows);console.log('HN rows',rows.length);
rows=[];for(const f of inputs.forecasts){const before=JSON.stringify(f);const result=forecastDrug(f);rows.push({id:f.id,unchanged:before===JSON.stringify(f),result});}
lines('application_forecast.jsonl',rows);console.log('forecast scenarios',rows.length);
rows=[];for(const c of inputs.worked)for(const trace of p.simulate(c.patient,c.events,c.seconds/60,c.choice,{sampleEverySeconds:c.sampleEverySeconds}))rows.push({id:c.id,title:c.title,trace,hn:m.multimodal(trace,c.choice,c.patient.age)});
lines('application_worked.jsonl',rows);
rows=[];for(const id of ['prop-remi-h','prop-remi-airway','sevo-remi-h','sevo-fent-movement','sevo-fent-bar'])for(let h=0;h<=20;h++)for(let o=0;o<=20;o++){const hp=h*.4,op=o*.5;rows.push({id,h:hp,o:op,value:pair.publishedPairProbability(id,hp,op)});}
lines('application_pd.jsonl',rows);
rows=[];for(const a of [25,43,67,80])for(const w of [55,70,100])for(const sevo of ['none','sevo'])for(const race of ['reference','asian']){
 const patient={age:a,weight:w,height:175,sex:'male'},ctx={crcl:119,sevo,race,reversalAt:null,otherBlocker:false};const par=roc.rocuroniumParameters(patient,ctx);
 for(let j=0;j<=100;j++){const ce=j/10;rows.push({age:a,weight:w,sevo,race,ce,parameters:par,result:roc.rocuroniumTOFR(ce,par,ctx,600)});}
}
lines('application_rocuronium.jsonl',rows);
// In-memory event correction and exported workbook roundtrip fixtures. This is
// explicitly not a hosted API/database or concurrency test.
const {researchSheets,xlsx}=load('workbook'),{eventSnapshot}=load('event-snapshot'),{timeline}=load('live'),{defaultCov}=load('model');
rows=[];for(const c of inputs.worked){
 const startedAt='2026-10-17T09:00:00.000Z',iso=t=>new Date(Date.parse(startedAt)+t*1000).toISOString();
 const session={id:c.id,studyId:'SYNTHETIC',synthetic:true,participant:c.id,site:'VERIFICATION',patient:c.patient,covariates:defaultCov,choice:c.choice,cohort:'development',startedAt,endedAt:iso(c.seconds),revision:1,noticeVersion:'synthetic',priorDrugs:''};
 const entry=(id,t,kind,data,receivedT=t)=>({id,sessionId:c.id,t,kind,data,observedAt:iso(t),receivedAt:iso(receivedT),author:'SYNTHETIC'});
 const entries=c.events.map(e=>entry(e.id,e.t,'drug',{event:e}));
 const t=900,trace=p.simulate(c.patient,c.events,t/60,c.choice).at(-1);
 const observation={...entry('observation',t,'clinical',{name:'Scripted observation; no measured outcome'}),snapshot:eventSnapshot(trace,c.choice,c.patient.age,entries)};
 entries.push(observation);const saved=JSON.stringify(observation.snapshot);
 // Correct the first dose at 1000 s, retaining the original event time and snapshot.
 // Receipt time records when the correction was entered, not when the dose occurred.
 const target=entries.find(e=>e.kind==='drug');entries.push(entry('void-first',1000,'void',{target:target.id}));
 const corrected={...target.data.event,id:'corrected-dose',value:target.data.event.value*1.25};entries.push(entry('corrected-dose',target.t,'drug',{event:corrected},1000));
 const before=JSON.stringify({session,entries});const sheets=researchSheets(session,entries);
 fs.writeFileSync(path.join(out,`${c.id}-research.xlsx`),xlsx(sheets));
 fs.writeFileSync(path.join(out,`${c.id}-research-sheets.json`),JSON.stringify(sheets));
 const currentTimeline=timeline(entries);const correctedTrace=p.simulate(c.patient,currentTimeline,t/60,c.choice).at(-1);
 rows.push({id:c.id,session,entries,checks:{input_unchanged:before===JSON.stringify({session,entries}),snapshot_unchanged:saved===JSON.stringify(observation.snapshot),void_target_absent:!currentTimeline.some(e=>e.id===target.id),replacement_present:currentTimeline.some(e=>e.id==='corrected-dose'),original_and_reconstruction_differ:trace.cp[target.data.event.drug]!==correctedTrace.cp[target.data.event.drug]},sheetCount:sheets.length,savedSnapshot:observation.snapshot,correctedTrace});
}
lines('application_records.jsonl',rows);
fs.writeFileSync(path.join(out,'application_versions.json'),JSON.stringify({package:JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version,release:p.RELEASE,pk:p.PK_VERSION,ce:p.CE_VERSION,hn:pd.HN_VERSION,publishedPD:pd.PUBLISHED_PD_VERSION,node:process.version,repairRevision:'submission-metadata-repair-20261019'},null,2));
console.log('production adapter complete');
