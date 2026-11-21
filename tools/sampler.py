"""A small multi-sample player for VSCO 2 CE (CC0) and Salamander Grand Piano (CC-BY).
Real recordings, dynamic-layer crossfades over each note, legato joins, round robins."""
import os, re, glob
import numpy as np, soundfile as sf, soxr

SR = 44100
import json as _json
import os as _os
try: TUNE = _json.load(open(_os.path.join(_os.path.dirname(__file__), 'tuning.json')))
except Exception: TUNE = {}
def tfix(f): return 2**(-TUNE.get(f, 0.0)/1200)       # measured cents off -> correction ratio
V = os.environ.get('VSCO', '/home/claude/sgossner/vsco-2-ce').rstrip('/') + '/'
SAL = os.environ.get('SALAMANDER', '/home/claude/sfzinstruments/salamandergrandpiano/Samples').rstrip('/') + '/'
NOTE = {'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}
def nm2midi(s):
    m = re.fullmatch(r'([A-G])([#b]?)(-?\d)', s); return 12*(int(m.group(3))+1)+NOTE[m.group(1)]+{'':0,'#':1,'b':-1}[m.group(2)]
DYN = {'pp':1,'p':2,'mp':3,'mf':4,'f':5,'ff':6,'fff':7}
MICPREF = ['Sum','sum','Main','Mid','Close','']
def mic(b):
    for m in MICPREF[:-1]:
        if b.endswith('_'+m): return m
    return ''

_cache = {}
def load(path):
    if path in _cache: return _cache[path]
    x, sr = sf.read(path, dtype='float32', always_2d=True)
    if x.shape[1] == 1: x = np.repeat(x, 2, axis=1)
    x = x[:, :2]
    env = np.abs(x).max(axis=1); i0 = int(np.argmax(env > env.max()*.004)); i0 = max(0, i0-int(.003*sr))
    x = np.ascontiguousarray(x[i0:])
    if sum(v[0].nbytes for v in _cache.values()) > 2.5e9: _cache.clear()
    _cache[path] = (x, sr); return x, sr

def pshift(x, sr, ratio):
    """pitch by resampling (high quality); ratio > 1 raises the pitch"""
    if abs(ratio-1) < 1e-4 and sr == SR: return x
    return soxr.resample(x, sr*ratio, SR, 'HQ').astype(np.float32)

def extend(y, need):
    """lengthen a sustained sample by equal-power crossfaded loops of its steady part"""
    if len(y) >= need: return y[:need]
    a, b = int(len(y)*.40), int(len(y)*.92); seg = y[a:b]; xf = min(int(.25*SR), len(seg)//3)
    fi = np.sqrt(np.linspace(0, 1, xf))[:, None]; fo = np.sqrt(1-np.linspace(0, 1, xf))[:, None]
    out = y[:b].copy()
    while len(out) < need:
        tail = out[-xf:]*fo + seg[:xf]*fi
        out = np.concatenate([out[:-xf], tail, seg[xf:]])
    return out[:need]

class Inst:
    """kind: 'sus' (dynamic crossfade over the note, loops) | 'shot' (one layer, rings naturally) | 'piano'"""
    def __init__(s, name, pattern, offset=12, release=.35, skip=.09, kind='sus', dyn_db=10.0, parser=None, exclude=None):
        s.name, s.release, s.skip, s.kind, s.dyn_db = name, release, skip, kind, dyn_db
        groups = {}
        for f in sorted(glob.glob(pattern)):
            if exclude and re.search(exclude, os.path.basename(f)): continue
            r = (parser or Inst.parse)(f, offset)
            if r is None: continue
            root, layer, mc = r
            groups.setdefault((root, layer), {}).setdefault(mc, []).append(f)
        s.map = {k: mics[sorted(mics, key=lambda m: MICPREF.index(m))[0]] for k, mics in groups.items()}
        assert s.map, (name, pattern)
        s.roots = sorted({r for r, _ in s.map}); s.rr = {}
        s.L = {r: sorted(l for rr, l in s.map if rr == r) for r in s.roots}
        s.norm = {}
        if kind != 'piano':                           # even out sample-to-sample loudness within each dynamic layer
            lv, by_layer = {}, {}
            for (r, l), fs in s.map.items():
                for f in fs:
                    sr = sf.info(f).samplerate; x, _ = sf.read(f, frames=int(2.0*sr), dtype='float32', always_2d=True)
                    e = np.abs(x).max(axis=1); i0 = int(np.argmax(e > e.max()*.004))
                    seg = x[i0+int(.03*sr): i0+int((.35 if kind == 'shot' else 1.3)*sr)]
                    lv[f] = (l, float(np.sqrt((seg**2).mean()))+1e-9); by_layer.setdefault(l, []).append(lv[f][1])
            med = {l: float(np.median(v)) for l, v in by_layer.items()}
            s.norm = {f: float(np.clip((med[l]/v)**.75, 10**(-8/20), 10**(8/20))) for f, (l, v) in lv.items()}
    @staticmethod
    def parse(f, offset):
        b = os.path.basename(f).rsplit('.', 1)[0]
        m = re.search(r'_([A-G][#b]?-?\d)(?=_|$)', b)
        if not m: return None
        lv = re.search(r'_v(\d+)', b)
        if lv: layer = int(lv.group(1))
        else:
            d = re.search(r'_(pp|p|mp|mf|f|ff|fff)(?=_|$)', b); layer = DYN[d.group(1)] if d else 1
        return nm2midi(m.group(1))+offset, layer, mic(b)
    def root(s, p): return min(s.roots, key=lambda r: (abs(r-p), -r))
    def pick(s, root, layer):
        fs = s.map[(root, layer)]; k = (root, layer); i = s.rr.get(k, 0); s.rr[k] = i+1; return fs[i % len(fs)]

    def note(s, p, dur, dyn0, dyn1=None, curve=1.0, legato_in=False, legato_out=False):
        dyn1 = dyn0 if dyn1 is None else dyn1
        r = s.root(p); L = s.L[r]; ratio = 2**((p-r)/12)
        if s.kind == 'shot' or s.kind == 'piano':
            j = int(round(np.clip(dyn0, 0, 1)*(len(L)-1)))
            f_ = s.pick(r, L[j]); x, sr = load(f_); y = pshift(x, sr, ratio*tfix(f_))*s.norm.get(f_, 1.0)
            ring = len(y) if s.kind == 'shot' else min(len(y), int((dur+s.release)*SR))
            y = y[:ring].copy()
            if s.kind == 'piano' and ring < len(x):           # damper
                k = min(len(y), int(s.release*SR)); y[-k:] *= np.cos(np.linspace(0, np.pi/2, k))[:, None]**2
            g = 10**((dyn0-1)*s.dyn_db/20)
            return y*g
        rel = .08 if legato_out else s.release
        n = int((dur+rel)*SR)+1
        t = np.arange(n)/SR; x01 = np.clip(t/max(dur, 1e-3), 0, 1)**curve
        dyn = np.clip(dyn0+(dyn1-dyn0)*x01, 0, 1)
        li = dyn*(len(L)-1); out = np.zeros((n, 2), np.float32)
        for j in range(int(np.floor(li.min())), int(np.ceil(li.max()))+1):
            w = np.clip(1-np.abs(li-j), 0, 1)
            if w.max() < 1e-3: continue
            f_ = s.pick(r, L[j]); x, sr = load(f_)
            st = int(s.skip*sr) if legato_in else 0
            rt = ratio*tfix(f_); need = int((n+256)*rt*sr/SR)+256
            y = extend(pshift(x[st:st+need], sr, rt), n)
            out += y*(np.sqrt(w)*s.norm.get(f_, 1.0)).astype(np.float32)[:, None]
        out *= (10**((dyn-1)*s.dyn_db/20)).astype(np.float32)[:, None]
        fi = int((.045 if legato_in else .003)*SR); out[:fi] *= np.linspace(0, 1, fi)[:, None]
        k = int(rel*SR); out[n-k:] *= np.cos(np.linspace(0, np.pi/2, k))[:, None]**1.5
        return out

class Perc:
    """one-shots: layers = list (soft -> loud) of lists of round-robin files; optional pitch"""
    def __init__(s, name, layers, root=None, dyn_db=20.0):
        s.name, s.layers, s.root0, s.dyn_db, s.rr = name, [sorted(l) for l in layers if l], root, dyn_db, {}
        assert s.layers, name
    def note(s, p, dur, dyn0, *a, **k):
        j = int(round(np.clip(dyn0, 0, 1)*(len(s.layers)-1))); fs = s.layers[j]; i = s.rr.get(j, 0); s.rr[j] = i+1
        x, sr = load(fs[i % len(fs)])
        ratio = 2**((p-s.root0)/12) if (s.root0 is not None and p) else 1.0
        y = pshift(x, sr, ratio).copy()
        if dur and dur > 0 and len(y) > int(dur*SR):                       # choke (e.g. cymbal grab)
            k0 = int(dur*SR); k = min(len(y)-k0, int(.25*SR)); y = y[:k0+k]; y[k0:] *= np.cos(np.linspace(0, np.pi/2, k))[:, None]**2
        return y*10**((dyn0-1)*s.dyn_db/20)

def g(p): return sorted(glob.glob(V+p))
def salamander(f, offset):
    b = os.path.basename(f).rsplit('.', 1)[0]; m = re.fullmatch(r'([A-G]#?)(\d)v(\d+)', b)
    return (nm2midi(m.group(1)+m.group(2)), int(m.group(3)), '') if m else None

def library():
    I = {}
    I['piano'] = Inst('piano', SAL+'*.flac', parser=salamander, kind='piano', release=.35, dyn_db=12)
    I['vln_solo'] = Inst('vln_solo', V+'Strings/Solo Violin/Arco Vib/*.wav', offset=0, release=.45, skip=.10, dyn_db=8)
    I['vln_solo_trem'] = Inst('vln_solo_trem', V+'Strings/Solo Violin/Trem/*.wav', release=.3)
    I['vln_solo_spic'] = Inst('vln_solo_spic', V+'Strings/Solo Violin/spic/*.wav', kind='shot', dyn_db=15)
    I['vln'] = Inst('vln', V+'Strings/Violin Section/susVib/*.wav', release=.5, dyn_db=10)
    I['vln_spic'] = Inst('vln_spic', V+'Strings/Violin Section/Spic/*.wav', kind='shot', dyn_db=15)
    I['vln_trem'] = Inst('vln_trem', V+'Strings/Violin Section/Trem/*.wav', release=.4, dyn_db=12)
    I['vla'] = Inst('vla', V+'Strings/Viola Section/susvib/*.wav', release=.5, dyn_db=10)
    I['vla_spic'] = Inst('vla_spic', V+'Strings/Viola Section/spic/*.wav', kind='shot', dyn_db=15)
    I['vla_trem'] = Inst('vla_trem', V+'Strings/Viola Section/trem/*.wav', release=.4, dyn_db=12)
    I['vc'] = Inst('vc', V+'Strings/Cello Section/susvib/*.wav', release=.5, dyn_db=10)
    I['vc_spic'] = Inst('vc_spic', V+'Strings/Cello Section/spic/*.wav', kind='shot', dyn_db=15)
    I['vc_trem'] = Inst('vc_trem', V+'Strings/Cello Section/trem/*.wav', release=.4, dyn_db=12)
    I['cb'] = Inst('cb', V+'Strings/Solo Contrabass/SusVib/*.wav', release=.5, dyn_db=10)
    I['cb_spic'] = Inst('cb_spic', V+'Strings/Solo Contrabass/Spic/*.wav', kind='shot', dyn_db=15)
    I['harp'] = Inst('harp', V+'Strings/Harp/*.wav', offset=0, kind='shot', dyn_db=14)
    I['horn'] = Inst('horn', V+'Brass/F Horn/sus/*.wav', release=.45, dyn_db=10)
    I['tpt'] = Inst('tpt', V+'Brass/Trumpet/susvib/*.wav', release=.35, dyn_db=10)
    I['tbn'] = Inst('tbn', V+'Brass/Tenor Trombone/sus/*.wav', release=.4, dyn_db=10)
    I['tuba'] = Inst('tuba', V+'Brass/Tuba/sus/*.wav', release=.4, dyn_db=10)
    I['flute'] = Inst('flute', V+'Woodwinds/Flute/susvib/*.wav', release=.35, skip=.08, dyn_db=10)
    I['oboe'] = Inst('oboe', V+'Woodwinds/Oboe/Vib/*.wav', release=.35, skip=.08, dyn_db=8)
    I['clar'] = Inst('clar', V+'Woodwinds/Clarinet/susLong/*.wav', release=.35, skip=.08, dyn_db=10)
    I['glock'] = Inst('glock', V+'Percussion/Glock/*.wav', kind='shot', dyn_db=10)
    # percussion
    I['timp'] = Perc('timp', [g('Percussion/Timpani/Timpani1_Hit_v1_*'), g('Percussion/Timpani/Timpani1_Hit_v3_*'), g('Percussion/Timpani/Timpani1_Hit_v4_*') or g('Percussion/Timpani/Timpani1_Hit_v3_*')], root=41.5, dyn_db=22)
    I['timp_roll'] = Perc('timp_roll', [g('Percussion/Timpani/Rolls/Timpani1_Roll_v3_*'), g('Percussion/Timpani/Rolls/Timpani1_Roll_v5_*')], root=41.5, dyn_db=6)
    I['bd'] = Perc('bd', [g(f'Percussion/BDrumNewhit_v{k}_*') for k in (1,3,5,7)], dyn_db=22)
    I['crash'] = Perc('crash', [g('Percussion/cymbal-crash1_pp_*'), g('Percussion/cymbal-crash1_mp_*'), g('Percussion/cymbal-crash1_mf_*'), g('Percussion/cymbal-crash1_ff_*')], dyn_db=22)
    I['suscym'] = Perc('suscym', [g('Percussion/susCymb1-hit_pp_*'), g('Percussion/susCymb1-hit_mp_*'), g('Percussion/susCymb1-hit_f_*'), g('Percussion/susCymb1-hit_fff_*')], dyn_db=22)
    I['gong'] = Perc('gong', [g('Percussion/gongHit_p*'), g('Percussion/gongHit_mf*'), g('Percussion/gongHit_f.*'), g('Percussion/gongHit_fff*')], dyn_db=22)
    I['snare'] = Perc('snare', [g(f'Percussion/Snare2-HitSN_v{k}_*') for k in (1,3,5,7,9)], dyn_db=22)
    I['tamb'] = Perc('tamb', [g('Percussion/Tamb1-Hit_v1_*'), g('Percussion/Tamb1-Hit_v2_*')], dyn_db=22)
    I['tri'] = Perc('tri', [g('Percussion/Triangle3-Hit_v1_*'), g('Percussion/Triangle3-Hit_v2_*')], dyn_db=22)
    I['conga'] = Perc('conga', [g(f'Percussion/Conga-HitN_v{k}_*') for k in (1,2,3)], dyn_db=22)
    I['tumba'] = Perc('tumba', [g(f'Percussion/Tumba-HitN_v{k}_*') for k in (1,2,3)], dyn_db=22)
    I['quinto'] = Perc('quinto', [g(f'Percussion/Quinto-HitN_v{k}_*') for k in (1,2,3)], dyn_db=22)
    return I
# sustained-cymbal swells: name -> (file, seconds from the start of the file to its loudest point)
SWELLS = {'long': V+'Percussion/susCymb1-cresc-Long_v1.wav', 'med': V+'Percussion/susCymb1-cresc-Median_v1.wav', 'short': V+'Percussion/susCymb1-cresc-Short_v1.wav'}
SNROLLS = g('Percussion/Snare2-rollSN_v*')
