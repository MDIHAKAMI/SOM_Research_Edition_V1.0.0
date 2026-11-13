# Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
"""Compare full-precision application observations against independent references."""
from pathlib import Path
import json,csv,math,sys,gzip,hashlib,platform,copy
import numpy as np
import scipy
from reference import *
out=Path(sys.argv[1]); inp=json.loads((out/'inputs.json').read_text());summary={};allrows=[]
def read(name):return [json.loads(l) for l in (out/name).read_text().splitlines() if l]
def check(group,scenario,variable,actual,expected,t=0,abs_tol=1e-9,rel_tol=1e-10):
 numerical=isinstance(actual,(int,float)) and not isinstance(actual,bool) and isinstance(expected,(int,float)) and not isinstance(expected,bool)
 error=abs(actual-expected) if numerical else None;limit=abs_tol+rel_tol*abs(expected) if numerical else None
 ok=bool(error<=limit if numerical else actual==expected)
 row={'group':group,'scenario':scenario,'time_seconds':t,'variable':variable,'actual':actual,'reference':expected,'absolute_error':error,'allowed_error':limit,'passed':ok};allrows.append(row);return row
def writecsv(name,rows):
 if not rows:
  (out/name).write_text('');return
 with (out/name).open('w',newline='') as f:
  w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)

app=read('application_pk.jsonl');byid={c['id']:c for c in inp['histories']}
for cid in byid:
 rows=[r for r in app if r['id']==cid];c=byid[cid];ref=replay(c['patient'],c['events'],c['choice'],[r['t'] for r in rows])
 for d in IV:
  for key,e in zip(['v1','v2','v3','cl','q2','q3','ke0'],params(d,c['patient'],c['choice'])):check('PK parameters',cid,d+'.'+key,rows[0]['params'][d][key],e)
 for r in rows:
  rr=ref[r['t']]
  for kind in ['cp','ce','endpointCe']:
   for d,e in rr[kind].items():check('PK trajectory',cid,kind+'.'+d,r[kind].get(d),e,r['t'])
  for d in IV:
   diag=r['diagnostics'];res=sum(diag['amounts'][d])+diag['eliminated'][d]-diag['cumulative'][d]
   check('Mass conservation',cid,d,res,0.,r['t'],1e-7,0)
  check('State corrections',cid,'residual corrections',len(r['diagnostics']['residualCorrections']),0,r['t'])

snapshots={s['id']:s for s in inp['snapshots']};hnrows=[]
for r in read('application_hn.jsonl'):
 s=snapshots[r['id']];e=hn(s['trace'],s['age'],r['tailPolicy']);a=r['result']
 for domain in ['H','N']:
  check('H/N totals',r['id'],domain,a[domain]['value'],e[domain],abs_tol=1e-12,rel_tol=1e-12)
  check('H/N known subtotal',r['id'],domain,a[domain]['knownSubtotal'],e['knownSubtotal'][domain],abs_tol=1e-12,rel_tol=1e-12)
  check('H/N availability',r['id'],domain,a[domain]['complete'],e[domain] is not None)
  for d in DRUGS:
   value=next(x['value'] for x in a['contributions'] if x['drug']==d and x['domain']==domain)
   check('H/N contributions',r['id'],domain+'.'+d,value,e['contributions'][domain][d],abs_tol=1e-12,rel_tol=1e-12)
 hnrows.append({'scenario':r['id'],'age':s['age'],'tail':r['tailPolicy'],'H':a['H']['value'],'N':a['N']['value'],'reference_H':e['H'],'reference_N':e['N'],'H_complete':a['H']['complete'],'N_complete':a['N']['complete']})
writecsv('HN_totals.csv',hnrows)
for tail in inp['protocol']['tails']:
 for d in DRUGS:
  rr=[r for r in hnrows if r['tail']==tail and r['scenario'].startswith('sweep-'+d+'-')]
  for domain in ['H','N']:
   for before,after in zip(rr,rr[1:]):check('H/N monotonicity',after['scenario'],domain+':'+tail,after[domain]>=before[domain]-1e-13,True)
 for r in [r for r in hnrows if r['tail']==tail and r['scenario'].startswith('pool-split-')]:check('Opioid split invariance',r['scenario'],tail,r['N'],1.,abs_tol=1e-12,rel_tol=1e-12)

for r in read('application_pd.jsonl'):check('Published PD',r['id'],f'h={r["h"]};o={r["o"]}',r['value'],pair(r['id'],r['h'],r['o']),abs_tol=1e-12,rel_tol=0)
for j,r in enumerate(read('application_rocuronium.jsonl')):
 ec50=1.62*(.605 if r['sevo']=='sevo' else 1);norm=1/(1+(r['ce']/ec50)**7.52)
 for key,exp in [('raw',1.04*norm),('normalized',norm)]:check('Rocuronium PD',str(j),key,r['result'][key],exp,abs_tol=1e-12,rel_tol=0)

forecasts={x['id']:x for x in inp['forecasts']};forecast_rows=[]
for r in read('application_forecast.jsonl'):
 c=forecasts[r['id']];d=c['drug'];value=c['value'];mode=c['mode'];hist=[e for e in c['events'] if e['t']<=c['now']]
 e={'id':'independent-counterfactual','drug':d,'t':c['now'],'kind':'infusion' if mode=='infusion' else 'bolus','value':value}
 if mode=='loading':e['durationSeconds']=round(c['minutes']*60)
 if mode=='infusion':e['value']=value*c['patient']['weight']*(1 if d=='dexmedetomidine' else 60)/(1000 if d in ['propofol','ketamine','morphine','midazolam','hydromorphone','rocuronium'] else 1)
 times=[x['t'] for x in r['result']['rows']]
 baseline=replay(c['patient'],hist,c['choice'],times);hyp=replay(c['patient'],hist+[e],c['choice'],times)
 check('Forecast isolation',r['id'],'input unchanged',r['unchanged'],True)
 for row in r['result']['rows']:
  for branch,ref in [('baseline',baseline),('hypothetical',hyp)]:
   for kind in ['cp','ce','endpointCe']:
    for drug,expected in ref[row['t']][kind].items():check('Dose forecast',r['id'],branch+'.'+kind+'.'+drug,row[branch][kind].get(drug),expected,row['t'])
  forecast_rows.append({'scenario':r['id'],'drug':d,'mode':mode,'minutes_ahead':row['minutesAhead'],'baseline_Cp':row['baseline']['cp'][d],'hypothetical_Cp':row['hypothetical']['cp'][d],'reference_Cp':hyp[row['t']]['cp'][d],'baseline_Ce':row['baseline']['ce'][d],'hypothetical_Ce':row['hypothetical']['ce'][d]})
writecsv('Dose_forecast.csv',forecast_rows)

# Reopen the application's actual XLSX bytes independently, compare every cell
# against the unformatted sheet arrays. Strings, nulls and numbers stay distinct.
import openpyxl
for r in read('application_records.jsonl'):
 for key,value in r['checks'].items():check('Record correction',r['id'],key,value,True)
 c=next(c for c in inp['worked'] if c['id']==r['id']);original=replay(c['patient'],c['events'],c['choice'],[900])[900]
 corrected_events=copy.deepcopy(c['events']);corrected_events[0]['value']*=1.25
 corrected=replay(c['patient'],corrected_events,c['choice'],[900])[900]
 for label,actual,expected in [('original',r['savedSnapshot'],original),('corrected',r['correctedTrace'],corrected)]:
  for kind in ['cp','ce','endpointCe']:
   for drug,value in expected[kind].items():check('Research concentrations',r['id'],label+'.'+kind+'.'+drug,actual[kind].get(drug),value,900)
 expected_hn=hn(original)
 for domain in ['H','N']:check('Research H/N snapshot',r['id'],domain,r['savedSnapshot']['multimodal'][domain]['value'],expected_hn[domain],900,1e-12,1e-12)
 sheets=json.loads((out/(r['id']+'-research-sheets.json')).read_text());w=openpyxl.load_workbook(out/(r['id']+'-research.xlsx'),read_only=True,data_only=False)
 check('XLSX roundtrip',r['id'],'sheet names',w.sheetnames,[s['name'] for s in sheets])
 audit=list(w['Audit'].iter_rows(values_only=True));headers=list(audit[0]);saved=next(row for row in audit[1:] if row[0]=='observation')
 first=headers.index('Original snapshot JSON');count=1
 if 'Snapshot JSON parts' in headers:count=int(saved[headers.index('Snapshot JSON parts')])
 assembled=str(saved[first] or '')+''.join(str(saved[headers.index(f'Original snapshot JSON part {j}')] or '') for j in range(2,count+1))
 canonical=lambda x:json.dumps(x,sort_keys=True,separators=(',',':'),ensure_ascii=False)
 ah=hashlib.sha256(canonical(json.loads(assembled)).encode()).hexdigest();eh=hashlib.sha256(canonical(r['savedSnapshot']).encode()).hexdigest()
 check('Research snapshot serialization',r['id'],'reassembled snapshot SHA256',ah,eh)
 check('Research snapshot serialization',r['id'],'Excel cell size bound',all(not isinstance(v,str) or len(v.encode('utf-16-le'))//2<=32767 for row in audit for v in row),True)
 for s in sheets:
  actual=list(w[s['name']].iter_rows(values_only=True))
  for i,row in enumerate(s['rows']):
   for j,expected in enumerate(row):
    value=actual[i][j] if i<len(actual) and j<len(actual[i]) else None
    # The app serializes both null and empty text as empty inline strings.
    # A reopened empty inline string and an empty cell are the same export blank.
    if expected=='':expected=None
    if value=='':value=None
    check('XLSX roundtrip',r['id'],s['name']+f'!R{i+1}C{j+1}',value,expected,abs_tol=1e-12,rel_tol=1e-12)
 w.close()

worked=[]
for r in read('application_worked.jsonl'):
 c=next(x for x in inp['worked'] if x['id']==r['id']);e=hn(r['trace'],c['patient']['age'])
 for domain in ['H','N']:check('Worked-case H/N',r['id'],domain,r['hn'][domain]['value'],e[domain],r['trace']['t'],1e-12,1e-12)
 worked.append({'case':r['id'],'title':r['title'],'time_seconds':r['trace']['t'],'H':r['hn']['H']['value'],'N':r['hn']['N']['value'],**{'Cp_'+d:v for d,v in r['trace']['cp'].items()},**{'Ce_'+d:v for d,v in r['trace']['ce'].items()},**{'endpoint_'+d:v for d,v in r['trace']['endpointCe'].items()}})
writecsv('Worked_cases.csv',worked)

for group in sorted({r['group'] for r in allrows}):
 rows=[r for r in allrows if r['group']==group];numeric=[r for r in rows if r['absolute_error'] is not None]
 summary[group]={'checks':len(rows),'numeric_checks':len(numeric),'categorical_checks':len(rows)-len(numeric),'passed':sum(r['passed'] for r in rows),'failed':sum(not r['passed'] for r in rows),'maximum_absolute_error':max([r['absolute_error'] for r in numeric],default=None)}
writecsv('Comparison_summary.csv',[dict(group=k,**v) for k,v in summary.items()]);writecsv('Failures.csv',[r for r in allrows if not r['passed']])
by_output=[]
for group in ['PK trajectory','Dose forecast','H/N totals','H/N contributions','Research concentrations']:
 for variable in sorted({r['variable'] for r in allrows if r['group']==group}):
  rr=[r for r in allrows if r['group']==group and r['variable']==variable];num=[r for r in rr if r['absolute_error'] is not None]
  by_output.append({'group':group,'output':variable,'checks':len(rr),'numeric_checks':len(num),'max_absolute_error':max([r['absolute_error'] for r in num],default=None),'failed':sum(not r['passed'] for r in rr)})
writecsv('Comparison_by_output.csv',by_output)
with gzip.open(out/'All_comparisons.csv.gz','wt',newline='') as f:
 w=csv.DictWriter(f,fieldnames=list(allrows[0]));w.writeheader();w.writerows(allrows)
result={'run_id':inp['protocol']['run_id'],'versions':json.loads((out/'application_versions.json').read_text()),'environment':{'python':platform.python_version(),'numpy':np.__version__,'scipy':scipy.__version__},'scenario_counts':{k:len(inp[k]) for k in ['histories','snapshots','forecasts','worked']},'groups':summary,'total_checks':len(allrows),'failed':sum(not r['passed'] for r in allrows),'criteria':inp['protocol']['numeric_criterion'],'scope':'Deterministic numerical and in-memory/export verification. No patient observations, clinical predictive validation, learning outcomes, hosted API/database or concurrent-user test.'}
(out/'Verification_summary.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
