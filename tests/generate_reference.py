# Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
"""Independent SciPy reference; does not import the TypeScript engine.
Run from project root with numpy/scipy installed. Fixtures are committed.
Published parameter inputs are transcribed independently; numerical validation
does not imply clinical validation of the source models.
"""
import json
from pathlib import Path
import numpy as np
from scipy.linalg import expm
age, weight, height = 29, 100, 190
lean = 1.1*weight - 128*(weight/height)**2
w = weight/70
models = {
 'propofol': [4.27, 18.9-.391*(age-53), 238, 1.89+.0456*(weight-77)-.0681*(lean-59)+.0264*(height-177), 1.29-.024*(age-53), .836, .456],
 'fentanyl': [6.09,28.1,228,.504,2.87,1.37,.147],
 'dexmedetomidine': [1.78*w,30.3*w,52*w,.686*w**.75,2.98*w**.75,.602*w**.75,0],
}
fixtures=[]
for drug,(v1,v2,v3,cl,q2,q3,k) in models.items():
 a=np.array([[-(cl+q2+q3)/v1,q2/v2,q3/v3,0,1],[q2/v1,-q2/v2,0,0,0],[q3/v1,0,-q3/v3,0,0],[k/v1,0,0,-k,0],[0,0,0,0,0]],dtype=float)
 for seconds in [1,60,600,3600,10800]:
  initial=np.array([100,0,0,0,2.0])
  result=expm(a*seconds/60)@initial
  fixtures.append({'drug':drug,'seconds':seconds,'dose':100,'rate':2,'state':result[:4].tolist()})
 # independent piecewise input schedule: two boluses and three rate changes.
 state=np.zeros(5);state[0]=100;state[4]=2
 for dt,new_rate,bolus in [(600,4,50),(1200,0,0),(1800,0,0)]:
  state=expm(a*dt/60)@state;state[0]+=bolus;state[4]=new_rate
 fixtures.append({'drug':drug,'seconds':3600,'piecewise':True,'state':state[:4].tolist()})
Path('tests/reference.json').write_text(json.dumps({'method':'SciPy scipy.linalg.expm; independently transcribed published coefficients','patient':{'age':age,'sex':'male','weight':weight,'height':height},'fixtures':fixtures},indent=2))
print('Wrote',len(fixtures),'independent numerical reference fixtures')
