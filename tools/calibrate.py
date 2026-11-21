"""Give every pack the same playing loudness: the loudest layer, played at full bow, sits at the same level
for every instrument (held notes measured in their sustain, struck notes in their first 0.3 s).
Writes 'level' (a linear gain) into each manifest. Run after build_library.py.

usage: python3 tools/calibrate.py
"""
import glob, json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from build_library import OUT, decode  # noqa: E402

TARGET = {'sus': -18.0, 'piano': -15.0, 'shot': -15.0, 'perc': -15.0}   # dBFS RMS

for path in sorted(glob.glob(os.path.join(OUT, '*', 'manifest.json'))):
    m = json.load(open(path))
    top = [r for r in m['regions'] if r['layer'] == m['layers']]
    vals, peaks = [], []
    for r in top:
        y, sr = decode(os.path.join(os.path.dirname(path), r['file']))
        mono = y.mean(axis=1)
        if m['kind'] == 'sus':
            lp = r.get('loop')
            a, b = (lp['start'], lp['end']) if lp else (.3, 1.5)
        else:
            a, b = .02, .32
        seg = mono[int(a * sr):int(b * sr)]
        if len(seg):
            vals.append(20 * np.log10(np.sqrt(np.mean(seg ** 2)) * r['gain'] + 1e-9))
        peaks.append(20 * np.log10(np.abs(y).max() * r['gain'] + 1e-9))
    med = float(np.median(vals))
    # never let a typical full-bow note peak above -4 dBFS (bright struck sounds have little RMS)
    gain_db = min(TARGET[m['kind']] - med, -4.0 - float(np.median(peaks)))
    m['level'] = round(10 ** (gain_db / 20), 4)
    json.dump(m, open(path, 'w'), separators=(',', ':'))
    print(f"{m['id']:20s} loudest layer {med:6.1f} dBFS -> level x{m['level']:.2f} ({20 * np.log10(m['level']):+.1f} dB)")
