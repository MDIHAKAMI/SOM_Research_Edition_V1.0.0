# Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
"""Structural sensitivity of a constructed score; ranges are not confidence intervals."""
from pathlib import Path
import sys,json,csv,copy,math
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import reference as R
out=Path(sys.argv[1]);fig=out/'figures';fig.mkdir(exist_ok=True)
inp=json.loads((out/'inputs.json').read_text())
rows=[json.loads(l) for l in (out/'application_worked.jsonl').read_text().splitlines()]
sens=[]
def add(case,t,scenario,h,n,base):
 sens.append({'case':case,'time_seconds':t,'scenario':scenario,'H':h,'N':n,'baseline_H':base['H'],'baseline_N':base['N'],'delta_H':h-base['H'],'delta_N':n-base['N']})
for row in rows:
 s=row['trace'];base=R.hn(s);t=s['t'];cid=row['id']
 for tail in ['hold','linear']:
  q=R.hn(s,tail=tail);add(cid,t,'tail_'+tail,q['H'],q['N'],base)
 for factor in [.8,1.2]:
  # Rescale only the direct H anchor contributions, not sparing terms.
  direct=sum(base['contributions']['H'][d] for d in ['propofol','sevoflurane','desflurane','ketamine'])
  h=base['H']-direct+direct/factor
  add(cid,t,f'H_direct_anchors_x{factor}',h,base['N'],base)
  # A ±20% stress perturbation of all N equivalence coefficients, with fixed F.
  O=sum(q*(1 if d=='fentanyl' else factor)*R.exposures(s,d,'N') for d,q in R.Q.items())
  oldop=sum(base['contributions']['N'][d] for d in R.Q)
  n=base['N']-oldop+R.sf(O)/.59
  add(cid,t,f'N_opioid_equivalence_x{factor}',base['H'],n,base)
  k=s['cp']['ketamine'];n=base['N']-base['contributions']['N']['ketamine']+R.sf(.013512413306556628*factor*k)/.59
  add(cid,t,f'N_ketamine_equivalence_x{factor}',base['H'],n,base)
  for domain in ['H','N']:
   v=base[domain]+(factor-1)*base['contributions'][domain]['dexmedetomidine']
   add(cid,t,f'{domain}_dex_credit_x{factor}',v if domain=='H' else base['H'],v if domain=='N' else base['N'],base)
  # Fixed Hill Emax is an assumption; vary its ceiling without refitting.
  h=base['H']+(factor-1)*base['contributions']['H']['midazolam']
  add(cid,t,f'H_midazolam_ceiling_x{factor}',h,base['N'],base)
 # Nonprimary alternative: independently saturating every opioid, versus pooling.
 n=base['N']-sum(base['contributions']['N'][d] for d in R.Q)+sum(R.sf(q*R.exposures(s,d,'N'))/.59 for d,q in R.Q.items())
 add(cid,t,'N_sum_separately_saturated_opioids',base['H'],n,base)

# Sensitivity of the named links to half/double ke0, without modifying dose inputs.
original_sites=dict(R.SITES)
for c in inp['worked']:
 rr=[r for r in rows if r['id']==c['id']];times=[r['trace']['t'] for r in rr]
 for factor in [.5,2.]:
  R.SITES={k:(d,ke*factor if k!='dexmedetomidineMoaas' else ke) for k,(d,ke) in original_sites.items()}
  predicted=R.replay(c['patient'],c['events'],c['choice'],times)
  for r in rr:
   s=predicted[r['trace']['t']];base=R.hn(r['trace']);changed=R.hn(s)
   add(c['id'],r['trace']['t'],f'named_ke0_x{factor}',changed['H'],changed['N'],base)
R.SITES=original_sites
def writecsv(name,rr):
 with (out/name).open('w',newline='') as f:
  w=csv.DictWriter(f,fieldnames=list(rr[0]));w.writeheader();w.writerows(rr)
writecsv('HN_sensitivity.csv',sens)
summary=[]
for cid in [c['id'] for c in inp['worked']]:
 for variant in sorted({r['scenario'] for r in sens}):
  rr=[r for r in sens if r['case']==cid and r['scenario']==variant]
  summary.append({'case':cid,'scenario':variant,'observations':len(rr),'max_absolute_H_change':max(abs(r['delta_H']) for r in rr),'max_absolute_N_change':max(abs(r['delta_N']) for r in rr)})
writecsv('HN_sensitivity_summary.csv',summary)

plt.rcParams.update({'font.family':'DejaVu Sans','font.size':9,'axes.spines.top':False,'axes.spines.right':False,'savefig.dpi':300})
captions={}
def save(figu,name,caption):
 for ext in ['pdf','png','tiff']:figu.savefig(fig/f'{name}.{ext}',bbox_inches='tight',dpi=300,**({'pil_kwargs':{'compression':'tiff_lzw'}} if ext=='tiff' else {}))
 captions[name]=caption;plt.close(figu)

colors={'propofol':'#1b9e77','sevoflurane':'#377eb8','dexmedetomidine':'#984ea3','ketamine':'#e69f00','fentanyl':'#d95f02','remifentanil':'#1f78b4','hydromorphone':'#e7298a','midazolam':'#666666','rocuronium':'#6a8f30'}
for case in inp['worked']:
 rr=[r for r in rows if r['id']==case['id']];ts=np.array([r['trace']['t']/60 for r in rr]);f,ax=plt.subplots(3,1,figsize=(7.2,7.2),sharex=True,gridspec_kw={'height_ratios':[1.1,1,1]})
 ax[0].plot(ts,[r['hn']['H']['value'] for r in rr],color='#243c68',label='H');ax[0].plot(ts,[r['hn']['N']['value'] for r in rr],color='#c45a22',label='N');ax[0].set_ylabel('Constructed index units');ax[0].legend(ncol=2,frameon=False);ax[0].set_title(case['title'],loc='left',weight='bold')
 for i,domain in enumerate(['H','N'],1):
  for d in R.DRUGS:
   vv=[next(c['value'] for c in r['hn']['contributions'] if c['drug']==d and c['domain']==domain) for r in rr]
   if max(vv or [0])>0:ax[i].plot(ts,vv,label=d.capitalize(),color=colors.get(d))
  ax[i].set_ylabel(f'{domain} contribution');ax[i].legend(ncol=3,frameon=False,fontsize=8)
 for a in ax:a.grid(axis='y',alpha=.2);a.set_ylim(bottom=0)
 ax[-1].set_xlabel('Time since case start (min)');f.tight_layout()
 save(f,'Worked_case_'+case['id'][-1],f"{case['title']}. Scripted administration history and current H/N calculations, with individual drug credits below. The schedules are synthetic calculation demonstrations, not treatment recommendations or patient outcomes. Opioid N credits allocate a shared pooled value; they do not identify causal drug effects. Inputs and full-precision observations are retained in inputs.json and Worked_cases.csv.")

f,axs=plt.subplots(1,2,figsize=(9.2,5.8),sharey=True)
variants=sorted({r['scenario'] for r in summary});ys=np.arange(len(variants))
def label(v):
 v=v.replace('N_sum_separately_saturated_opioids','Separate opioid saturation').replace('H_direct_anchors','H anchors').replace('N_opioid_equivalence','Opioid equivalence').replace('N_ketamine_equivalence','Ketamine equivalence').replace('H_midazolam_ceiling','Midazolam H ceiling').replace('H_dex_credit','Dexmedetomidine H').replace('N_dex_credit','Dexmedetomidine N').replace('named_ke0','Effect-site rate').replace('tail_hold','Hold tail').replace('tail_linear','Linear tail')
 return v.replace('_x',' × ')
for j,domain in enumerate(['H','N']):
 for i,c in enumerate(inp['worked']):
  vals=[next(r[f'max_absolute_{domain}_change'] for r in summary if r['case']==c['id'] and r['scenario']==v) for v in variants]
  axs[j].scatter(vals,ys+(i-1)*.18,label=c['id'],s=20)
 axs[j].set_xlabel(f'Maximum absolute {domain} change');axs[j].grid(axis='x',alpha=.2);axs[j].set_yticks(ys,[label(v) for v in variants]);axs[j].legend(frameon=False,fontsize=7)
f.tight_layout();save(f,'HN_sensitivity','Maximum absolute change from the primary H/N trajectory for each worked case under prespecified structural perturbations. Anchor, conversion-weight and Hill-ceiling changes are hypothetical ±20% stress tests; effect-site ke0 is halved or doubled. Hold and linear tails replace the primary exponential continuation. These are engineering sensitivity ranges, not confidence intervals or evidence of clinical equivalence.')

forecast=list(csv.DictReader((out/'Dose_forecast.csv').open()))
f,axs=plt.subplots(1,2,figsize=(7.2,3.3))
for a,d in zip(axs,['midazolam','hydromorphone']):
 rr=[r for r in forecast if r['drug']==d and r['mode']=='push'];x=[float(r['minutes_ahead']) for r in rr]
 a.plot(x,[float(r['baseline_Cp']) for r in rr],'o-',label='Recorded history');a.plot(x,[float(r['hypothetical_Cp']) for r in rr],'o-',label='With simulated dose');a.set_title(d.capitalize(),loc='left');a.set_xlabel('Minutes after preview');a.set_ylabel('Predicted Cp (ng/mL)');a.grid(axis='y',alpha=.2);a.legend(frameon=False,fontsize=8)
f.tight_layout();save(f,'Simulated_dose','Counterfactual plasma concentration forecasts for midazolam and hydromorphone at 5, 15, 30 and 60 minutes after a simulated additional bolus. The branch replays recorded history through the preview time and excludes future scheduled changes. No administration or research record is changed. Scenarios and comparisons against the independent PK reference are retained in inputs.json and Dose_forecast.csv.')

# Same H with two mechanistically distinct mixtures, determined algebraically.
fent_h=R.sparse(3,R.KNOTS['fentanyl']);prop_equivalent=1.85*(1-fent_h)
equal={'description':'Equal constructed H does not establish clinical equivalence','A':{'propofol_Cp_ug_mL':1.85,'H':1.},'B':{'propofol_Cp_ug_mL':prop_equivalent,'fentanyl_Cp_ng_mL':3,'H':prop_equivalent/1.85+fent_h},'not_a_dosing_target':True}
(out/'Equal_H_example.json').write_text(json.dumps(equal,indent=2));(fig/'captions.json').write_text(json.dumps(captions,indent=2));print('Sensitivity rows',len(sens),'figures',len(captions))
