# Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
"""Separate numerical reference for the declared SOM calculation specification.

This code imports no application functions or runtime coefficient registry.
PK coefficients are independently transcribed here. scipy.linalg.expm is used
over event-to-event intervals, versus the application's one-second Taylor
matrix-exponential steps. Endpoint-specific links are declared composites.
"""
import math
import numpy as np
from scipy.linalg import expm

DRUGS = ['propofol','sevoflurane','desflurane','ketamine','dexmedetomidine',
         'remifentanil','fentanyl','alfentanil','morphine','sufentanil','midazolam','hydromorphone','rocuronium']
IV = [d for d in DRUGS if d not in ['sevoflurane','desflurane']]
SITES = {'ketamineHypnosis':('ketamine',math.log(2)/(23/60)),
         'sufentanilHypnosis':('sufentanil',.11),
         'morphineThermal':('morphine',math.log(2)/42.6),
         'hydromorphoneThermal':('hydromorphone',math.log(2)/45),
         'dexmedetomidineMoaas':('dexmedetomidine',.0428)}
Q = {'fentanyl':1.,'remifentanil':1.218978102189781,'alfentanil':1/58,
     'sufentanil':11.517241379310345,'morphine':.040229885057471264,'hydromorphone':.4288140020898641}
KNOTS = {'fentanyl':[(0,0),(1,.095),(3,.205)],
         'remifentanil':[(0,0),(2,.272),(4,.38974)],
         'alfentanil':[(0,0),(500,.5718232044198895)],
         'sufentanil':[(0,0),(.3,.32)],
         'dexmedetomidine':[(0,0),(.4,.1711801407141909),(.6,.28664353037112894),(.8,.38721055925357)]}
N_DEX=[(0,0),(.39,.027322404371584723),(.7,.1748633879781421)]

def params(d,p,choice):
    a,w,h,s=p['age'],p['weight'],p['height'],p['sex']; r=w/70
    l=(1.1*w-128*(w/h)**2) if s=='male' else (1.07*w-148*(w/h)**2)
    def micro(v,k10,k12,k13,k21,k31,k):
        return [v,v*k12/k21 if k12 else 1,v*k13/k31 if k13 else 1,v*k10,v*k12,v*k13,k]
    if d=='propofol':
        if choice['propofol']=='marsh':return micro(.228*w,.119,.114,.0419,.055,.0033,.26)
        return [4.27,18.9-.391*(a-53),238,1.89+.0456*(w-77)-.0681*(l-59)+.0264*(h-177),1.29-.024*(a-53),.836,.456]
    if d=='fentanyl':return micro(6.09,.0827,.471,.225,.102,.006,None)
    if d=='alfentanil':
        v=.111*w*(1.15 if s=='female' else 1); aa=max(0,a-40)
        return micro(v,(.356-.00269*aa)/v,.104,.017,.0673,.0126-.000113*aa,None)
    if d=='sufentanil':return [14.3,63.1,261.6,.92,1.55,.33,None]
    if d=='remifentanil':return [5.1-.0201*(a-40)+.072*(l-55),9.82-.0811*(a-40)+.108*(l-55),5.42,2.6-.0162*(a-40)+.0191*(l-55),2.05-.0301*(a-40),.076-.00113*(a-40),.595-.007*(a-40)]
    if d=='dexmedetomidine':return [1.78*r,30.3*r,52*r,.686*r**.75,2.98*r**.75,.602*r**.75,.12]
    if d=='morphine':return [9.41*r,108*r,50.7*r,(44.1+6.32)*r**.75/60,67.1*r**.75/60,83.4*r**.75/60,None]
    if d=='hydromorphone':return [3.35*r*(1-.028*(a-67)),13.9*r,145*r,1.01*r*(1-.015*(a-67)),1.47*r,1.41*r,None]
    if d=='midazolam':return [32.2,53,245,.43,.56,.39,math.log(2)/4.8]
    if d=='ketamine':
        return micro(.063*w,.4381,.5921,.59,.247,.0146,None) if choice['ketamine']=='domino' else micro(1.7522*w,.0109,.0186,0,.0137,0,None)
    if d=='rocuronium':
        c=p.get('clinical',{}); n=c.get('nmb',{}); crcl=c.get('crcl'); crcl=183-1.34*a if crcl is None else crcl
        return [4.73*math.exp(-.00143*(crcl-119))*r,6.76*math.exp(.00613*(a-43))*r,1,.269*(1-.00678*(a-43))*r**.75,.279*(.788 if n.get('race')=='asian' else 1)*r**.75,0,.134*r**-.25*(.433 if n.get('sevo')=='sevo' else 1)]
    raise ValueError(d)

def input_factor(d):return 1000/609.7 if d=='rocuronium' else 1000 if d in ['ketamine','morphine','midazolam','hydromorphone'] else 1

def matrix(par,k_override=None):
    v1,v2,v3,cl,q2,q3,k=par;k=k_override if k_override is not None else k or 0
    # A1,A2,A3,Ce,eliminated,input. Input is constant within each segment.
    A=np.zeros((6,6)); A[0]=[-(cl+q2+q3)/v1,q2/v2,q3/v3,0,0,1]
    A[1,0]=q2/v1;A[1,1]=-q2/v2;A[2,0]=q3/v1;A[2,2]=-q3/v3
    A[3,0]=k/v1;A[3,3]=-k;A[4,0]=cl/v1
    return A

def replay(p,events,choice,times):
    pars={d:params(d,p,choice) for d in IV}
    keys=IV+list(SITES); states={d:np.zeros(6) for d in keys}; rates={d:0. for d in IV}; load={d:0. for d in IV}; cumulative={d:0. for d in IV}
    matrices={d:matrix(pars[d]) for d in IV}; matrices.update({k:matrix(pars[d],ke) for k,(d,ke) in SITES.items()})
    et={'sevoflurane':0.,'desflurane':0.}; start={};ends={}
    for e in events:
        start.setdefault(e['t'],[]).append(e)
        if e.get('durationSeconds'):ends.setdefault(e['t']+e['durationSeconds'],[]).append(e)
    grid=sorted(set([0]+times+[t for t in start if t<=max(times)]+[t for t in ends if t<=max(times)]));out={};last=0;cache={}
    for t in grid:
        dt=(t-last)/60
        if dt:
            for key in keys:
                d=SITES[key][0] if key in SITES else key
                states[key][5]=rates[d]+load[d]
                cache.setdefault((key,dt),expm(matrices[key]*dt)) if (key,dt) not in cache else None
                states[key]=cache[key,dt]@states[key]
            for d in IV:cumulative[d]+=(rates[d]+load[d])*dt
        for e in ends.get(t,[]):load[e['drug']]-=e['value']*input_factor(e['drug'])*60/e['durationSeconds']
        for e in start.get(t,[]):
            d=e['drug'];v=e['value'];f=input_factor(d)
            if e['kind']=='et':et[d]=v
            elif e['kind']=='infusion':rates[d]=v*f/60
            elif e.get('durationSeconds'):load[d]+=v*f*60/e['durationSeconds']
            else:
                states[d][0]+=v*f;cumulative[d]+=v*f
                for key,(sd,ke) in SITES.items():
                    if sd==d:states[key][0]+=v*f
        if t in times:
            cp={d:states[d][0]/pars[d][0] if d in IV else et[d] for d in DRUGS}
            ce={d:float(states[d][3]) if d in IV and pars[d][6] else None for d in DRUGS}
            out[t]={'cp':cp,'ce':ce,'endpointCe':{k:float(states[k][3]) for k in SITES},'mass':{d:float(sum(states[d][:3])+states[d][4]-cumulative[d]) for d in IV}}
        last=t
    return out

def sparse(x,knots,tail='exponential'):
    for (x0,y0),(x1,y1) in zip(knots,knots[1:]):
        if x<=x1:return y0+(y1-y0)*(x-x0)/(x1-x0)
    (x0,y0),(xm,ym)=knots[-2:];s=(ym-y0)/(xm-x0)
    if tail=='hold':return ym
    if tail=='linear':return ym+s*(x-xm)
    return 1-(1-ym)*math.exp(-s*(x-xm)/(1-ym))

def sf(x):return .8670718232044199*x/(1.4088397790055254+x)
def finite(x):return isinstance(x,(int,float)) and not isinstance(x,bool) and math.isfinite(x) and x>=0
def exposures(s,d,domain):
    if domain=='H':
        if d=='ketamine':return s.get('endpointCe',{}).get('ketamineHypnosis')
        if d=='sufentanil':return s.get('endpointCe',{}).get('sufentanilHypnosis')
        if d in ['midazolam','remifentanil']:return s['ce'].get(d)
    else:
        if d=='morphine':return s.get('endpointCe',{}).get('morphineThermal')
        if d=='hydromorphone':return s.get('endpointCe',{}).get('hydromorphoneThermal')
        if d=='remifentanil':return s['ce'].get(d)
    return s['cp'].get(d)

def hn(s,age=40,tail='exponential'):
    contrib={'H':{},'N':{}};active={}
    for d in DRUGS:
        cp=s['cp'].get(d);ce=s['ce'].get(d);endpoint=s.get('endpointCe',{})
        keys=[k for k,(sd,_) in SITES.items() if sd==d]
        vals=[cp,ce]+[endpoint.get(k) for k in keys]
        # Missing plasma is unknown. Null/missing generic Ce is permitted,
        # but an explicitly invalid generic Ce or named endpoint is not absence.
        invalid_ce=ce is not None and not finite(ce)
        invalid_endpoint=any(k in endpoint and not finite(endpoint[k]) for k in keys)
        active[d]=not finite(cp) or invalid_ce or invalid_endpoint or any(finite(x) and x>0 for x in vals)
    for d in DRUGS:
        x=exposures(s,d,'H')
        if d in ['morphine','hydromorphone','rocuronium'] or not active[d]:v=0.
        elif not finite(x):v=None
        elif d=='propofol':v=x/1.85
        elif d=='sevoflurane':v=x/.9
        elif d=='desflurane':v=x*.5592515592515591
        elif d=='ketamine':v=x/1640
        elif d=='midazolam':v=x**1.255413410942482/(17.343849309184137**1.255413410942482+x**1.255413410942482)
        else:v=sparse(x,KNOTS[d],tail)
        contrib['H'][d]=v
    pool={d:exposures(s,d,'N')*q if active[d] and finite(exposures(s,d,'N')) else (None if active[d] else 0.) for d,q in Q.items()}
    O=sum(pool.values()) if all(v is not None for v in pool.values()) else None
    for d in DRUGS:
        x=exposures(s,d,'N')
        if d in ['midazolam','rocuronium'] or not active[d]:v=0.
        elif d in Q:v=None if O is None else (sf(O)/.59*pool[d]/O if O else 0.)
        elif not finite(x):v=None
        elif d=='propofol':v=.0462297698971892*x/.59
        elif d in ['sevoflurane','desflurane']:v=x/((1.8 if d=='sevoflurane' else 6.6)*10**(-.00269*(age-40)))/.59
        elif d=='ketamine':v=sf(.013512413306556628*x)/.59
        elif d=='dexmedetomidine':v=sparse(x,N_DEX,tail)/.59
        contrib['N'][d]=v
    ret={d:sum(vals.values()) if all(v is not None for v in vals.values()) else None for d,vals in contrib.items()}
    ret.update(contributions=contrib,knownSubtotal={d:sum(v for v in vals.values() if v is not None) for d,vals in contrib.items()},opioidCoordinate=O)
    return ret

def pair(model,p,r):
    coef={'prop-remi-h':(2.2,33.1,5,3.6),'prop-remi-airway':(5.6,48.9,2.2,33.2),'sevo-remi-h':(.78,50.2,4.4,12.4)}
    if model in coef:
        p50,r50,n,a=coef[model];u=p/p50+r/r50+a*p/p50*r/r50
    else:
        p50,r50=(1.73,2.07) if model=='sevo-fent-movement' else (4.6,.43);n=6.4;u=p/p50*(1+(r/r50)**.931)
    return u**n/(1+u**n)
