# Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
"""Deterministic synthetic cases, frozen before application execution."""
from pathlib import Path
import json,random,sys
from reference import DRUGS,IV,SITES,Q
out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
patient={'age':40,'weight':70,'height':175,'sex':'male'}
choice={'propofol':'schnider','ketamine':'domino'}
doses={'propofol':100,'fentanyl':100,'remifentanil':50,'alfentanil':500,'sufentanil':10,'ketamine':30,'dexmedetomidine':20,'morphine':5,'midazolam':2,'hydromorphone':.5,'rocuronium':30}
histories=[]
for pi,p in enumerate([patient,{'age':67,'weight':55,'height':160,'sex':'female'},{'age':80,'weight':100,'height':185,'sex':'male'}]):
 for ci,c in enumerate([choice,dict(choice,propofol='marsh'),dict(choice,ketamine='clements250')]):
  events=[]
  for d,amount in doses.items():
   for j,(t,kind,v,duration) in enumerate([(0,'bolus',amount,None),(37,'bolus',amount/2,83),(60,'infusion',amount,None),(120,'infusion',amount/2,None),(120,'infusion',amount/4,None),(1200,'bolus',amount/3,None),(1800,'infusion',0,None)]):
    e={'id':f'{d}-{j}','drug':d,'t':t,'kind':kind,'value':v}
    if duration:e['durationSeconds']=duration
    events.append(e)
  events += [{'id':'sevo','drug':'sevoflurane','t':0,'kind':'et','value':1.8},{'id':'des','drug':'desflurane','t':600,'kind':'et','value':3.3}]
  histories.append({'id':f'PK-{pi+1}-{ci+1}','patient':p,'choice':c,'events':events,'seconds':7200,'sampleEverySeconds':30})

def snapshot(values=None):
 cp={d:0 for d in DRUGS};ce={d:0 for d in DRUGS};ep={k:0 for k in SITES}
 for d,v in (values or {}).items():
  cp[d]=v;ce[d]=v
  for k,(sd,_) in SITES.items():
   if sd==d:ep[k]=v
 return {'t':0,'cp':cp,'ce':ce,'effect':dict(cp),'endpointCe':ep}

maxima={'propofol':8,'sevoflurane':4,'desflurane':10,'ketamine':3000,'dexmedetomidine':2,'remifentanil':12,'fentanyl':12,'alfentanil':1500,'morphine':150,'sufentanil':1,'midazolam':150,'hydromorphone':10,'rocuronium':5}
snapshots=[]
for d in DRUGS:
 for j in range(101):snapshots.append({'id':f'sweep-{d}-{j:03}','drug':d,'fraction':j/100,'age':40,'trace':snapshot({d:maxima[d]*j/100})})
rng=random.Random(20261017)
for j in range(137):snapshots.append({'id':f'mixture-{j:03}','age':[25,40,67,80][j%4],'trace':snapshot({d:maxima[d]*rng.random() for d in DRUGS})})
for d,x in [('propofol',1.85),('sevoflurane',.9),('ketamine',1640),('fentanyl',3),('midazolam',21),('midazolam',52),('sufentanil',.3)]:snapshots.append({'id':f'anchor-{d}-{x}','age':40,'trace':snapshot({d:x})})
for j in range(21):
 fraction=j/20;s=snapshot({'fentanyl':3*fraction,'remifentanil':3*(1-fraction)/Q['remifentanil']})
 snapshots.append({'id':f'pool-split-{j:02}','age':40,'trace':s})
for d in ['ketamine','sufentanil','midazolam','remifentanil','morphine','hydromorphone']:
 s=snapshot({d:1,'propofol':1,'fentanyl':1});s['ce'][d]=None
 for k,(sd,_) in SITES.items():
  if sd==d:s['endpointCe'].pop(k)
 snapshots.append({'id':f'missing-{d}','age':40,'trace':s})

forecasts=[]
for d in IV:
 for mode in ['push','loading','infusion']:
  value=doses[d]/10 if mode!='infusion' else .05
  events=[{'id':'prior','drug':d,'t':0,'kind':'bolus','value':doses[d]}, {'id':'rate','drug':d,'t':15,'kind':'infusion','value':doses[d]/2}, {'id':'future','drug':d,'t':50,'kind':'bolus','value':doses[d]*5}]
  forecasts.append({'id':f'forecast-{d}-{mode}','patient':patient,'choice':choice,'events':events,'now':37,'drug':d,'mode':mode,'value':value,'minutes':2.5})

worked=[]
for name,events in [
 ('Balanced anesthesia',[(0,'midazolam','bolus',2),(30,'fentanyl','bolus',100),(60,'propofol','bolus',120),(90,'rocuronium','bolus',40),(180,'sevoflurane','et',1.8),(1800,'fentanyl','bolus',50),(3600,'sevoflurane','et',.5),(4200,'sevoflurane','et',0)]),
 ('Adjunct-based anesthesia',[(0,'dexmedetomidine','bolus',35,600),(120,'ketamine','bolus',20),(180,'propofol','bolus',100),(180,'propofol','infusion',300),(600,'dexmedetomidine','infusion',28),(1800,'hydromorphone','bolus',.5),(3600,'propofol','infusion',0),(3600,'dexmedetomidine','infusion',0)]),
 ('Intravenous anesthesia and emergence',[(0,'midazolam','bolus',1),(60,'propofol','bolus',100),(60,'propofol','infusion',350),(60,'remifentanil','infusion',420),(1800,'hydromorphone','bolus',.5),(3600,'propofol','infusion',0),(3600,'remifentanil','infusion',0)])]:
  ev=[]
  for i,e in enumerate(events):
   t,d,k,v,*dur=e;ee={'id':f'case-{i}','t':t,'drug':d,'kind':k,'value':v}
   if dur:ee['durationSeconds']=dur[0]
   ev.append(ee)
  worked.append({'id':f'CASE-{len(worked)+1}','title':name,'patient':patient,'choice':choice,'events':ev,'seconds':5400,'sampleEverySeconds':30})
data={'protocol':{'run_id':'SOM-RESEARCH-1.0-VERIFICATION','synthetic':True,'numeric_criterion':'absolute difference <= 1e-9 + 1e-10 * abs(reference); H/N <= 1e-12 + 1e-12 * abs(reference); published probabilities <= 1e-12; exact null/category match','independence':'Python references independently transcribed; scipy.linalg.expm event-to-event propagation; no production code imported','tails':['exponential','hold','linear'],'seed':20261017},'histories':histories,'snapshots':snapshots,'forecasts':forecasts,'worked':worked,'doses':doses}
(out/'inputs.json').write_text(json.dumps(data,indent=2));print({k:len(data[k]) for k in ['histories','snapshots','forecasts','worked']})
