"""Phase 1: build Maestro's sound library from VSCO 2 CE (CC0) and Salamander Grand Piano V3 (CC-BY 3.0).

usage: VSCO=<vsco-2-ce folder> SALAMANDER=<Salamander Samples folder> python3 tools/build_library.py [pack ...]
       (no pack names = every pack)
needs: numpy, soundfile, soxr, ffmpeg with libopus, and tools/sampler.py + tools/tuning.py data

For every recording it stores, next to the compressed audio:
  tune  - how many cents the player really plays off its written note (measured on several harmonics)
  gain  - a loudness correction so neighbouring notes in one loudness layer sound equally loud
  loop  - for sustained notes, a seamless loop inside the steady part (start, end, crossfade, quality)
Then it decodes the finished files and checks them again (pitch, loudness, loops) and writes a report.
"""
import json, os, re, subprocess, sys, tempfile, glob
from concurrent.futures import ProcessPoolExecutor
import numpy as np, soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import sampler as S          # noqa: E402  (file map, onset trim, loudness normalisation)

OUT = os.path.join(HERE, '..', 'resources', 'samples')
V, SAL = S.V, S.SAL
TUNE = S.TUNE
HMAX = {'glockenspiel': 1, 'marimba': 1, 'xylophone': 1}

# id, display name, family, kind, source pattern, options
PACKS = [
    # strings
    ('violin-solo', 'Solo violin', 'Strings', 'sus', V+'Strings/Solo Violin/Arco Vib/*.wav', dict(offset=0, release=.45, skip=.10)),
    ('violin-solo-trem', 'Solo violin · tremolo', 'Strings', 'sus', V+'Strings/Solo Violin/Trem/*.wav', dict(release=.3)),
    ('violin-solo-spic', 'Solo violin · short', 'Strings', 'shot', V+'Strings/Solo Violin/spic/*.wav', {}),
    ('violin-solo-pizz', 'Solo violin · pizzicato', 'Strings', 'shot', V+'Strings/Solo Violin/Pizz/*.wav', dict(offset=0)),
    ('violins', 'Violins', 'Strings', 'sus', V+'Strings/Violin Section/susVib/*.wav', dict(release=.5)),
    ('violins-trem', 'Violins · tremolo', 'Strings', 'sus', V+'Strings/Violin Section/Trem/*.wav', dict(release=.4)),
    ('violins-spic', 'Violins · short', 'Strings', 'shot', V+'Strings/Violin Section/Spic/*.wav', {}),
    ('violins-pizz', 'Violins · pizzicato', 'Strings', 'shot', V+'Strings/Violin Section/Pizz/*.wav', {}),
    ('violas', 'Violas', 'Strings', 'sus', V+'Strings/Viola Section/susvib/*.wav', dict(release=.5)),
    ('violas-trem', 'Violas · tremolo', 'Strings', 'sus', V+'Strings/Viola Section/trem/*.wav', dict(release=.4)),
    ('violas-spic', 'Violas · short', 'Strings', 'shot', V+'Strings/Viola Section/spic/*.wav', {}),
    ('violas-pizz', 'Violas · pizzicato', 'Strings', 'shot', V+'Strings/Viola Section/pizz/*.wav', {}),
    ('cellos', 'Cellos', 'Strings', 'sus', V+'Strings/Cello Section/susvib/*.wav', dict(release=.5)),
    ('cellos-trem', 'Cellos · tremolo', 'Strings', 'sus', V+'Strings/Cello Section/trem/*.wav', dict(release=.4)),
    ('cellos-spic', 'Cellos · short', 'Strings', 'shot', V+'Strings/Cello Section/spic/*.wav', {}),
    ('cellos-pizz', 'Cellos · pizzicato', 'Strings', 'shot', V+'Strings/Cello Section/pizzT/*.wav', {}),
    ('basses', 'Double bass', 'Strings', 'sus', V+'Strings/Solo Contrabass/SusVib/*.wav', dict(release=.5)),
    ('basses-spic', 'Double bass · short', 'Strings', 'shot', V+'Strings/Solo Contrabass/Spic/*.wav', {}),
    ('basses-pizz', 'Double bass · pizzicato', 'Strings', 'shot', V+'Strings/Solo Contrabass/Pizz/*.wav', {}),
    ('harp', 'Harp', 'Strings', 'shot', V+'Strings/Harp/*.wav', dict(offset=0)),
    # woodwinds
    ('flute', 'Flute', 'Woodwinds', 'sus', V+'Woodwinds/Flute/susvib/*.wav', dict(release=.35, skip=.08)),
    ('oboe', 'Oboe', 'Woodwinds', 'sus', V+'Woodwinds/Oboe/Vib/*.wav', dict(release=.35, skip=.08)),
    ('clarinet', 'Clarinet', 'Woodwinds', 'sus', V+'Woodwinds/Clarinet/susLong/*.wav', dict(release=.35, skip=.08)),
    ('bassoon', 'Bassoon', 'Woodwinds', 'sus', V+'Woodwinds/Bassoon/vib/*.wav', dict(release=.35, skip=.08)),
    # brass
    ('horn', 'French horn', 'Brass', 'sus', V+'Brass/F Horn/sus/*.wav', dict(release=.45)),
    ('trumpet', 'Trumpet', 'Brass', 'sus', V+'Brass/Trumpet/susvib/*.wav', dict(release=.35)),
    ('trombone', 'Trombone', 'Brass', 'sus', V+'Brass/Tenor Trombone/sus/*.wav', dict(release=.4)),
    ('tuba', 'Tuba', 'Brass', 'sus', V+'Brass/Tuba/sus/*.wav', dict(release=.4)),
    # keys and mallets
    ('piano', 'Grand piano', 'Keys', 'piano', SAL+'*.flac', dict(release=.35, use_layers=[2, 4, 6, 8, 10, 12, 14, 16])),
    ('glockenspiel', 'Glockenspiel', 'Keys', 'shot', V+'Percussion/Glock/*.wav', {}),
    ('marimba', 'Marimba', 'Keys', 'shot', V+'Percussion/Marimba/*.wav', {}),
    ('xylophone', 'Xylophone', 'Keys', 'shot', V+'Percussion/Xylo/*.wav', {}),
]
PERC = [  # id, name, layers soft -> loud
    ('timpani', 'Timpani', 'timp'), ('timpani-roll', 'Timpani roll', 'timp_roll'), ('bass-drum', 'Bass drum', 'bd'),
    ('snare', 'Snare drum', 'snare'), ('crash', 'Crash cymbals', 'crash'), ('cymbal', 'Suspended cymbal', 'suscym'),
    ('gong', 'Gong', 'gong'), ('conga', 'Conga', 'conga'), ('tumba', 'Tumba', 'tumba'), ('quinto', 'Quinto', 'quinto'),
    ('tambourine', 'Tambourine', 'tamb'), ('triangle', 'Triangle', 'tri'),
]

# ---------------------------------------------------------------- analysis

def measure_cents(path, root, shot, hmax=6, x=None, sr=None):
    """How far a recording is from its labelled note, in cents (search +-130 c, so a sample labelled one
    semitone wrong is still caught). Uses up to hmax harmonics; mallets use only the fundamental."""
    if x is None:
        sr = sf.info(path).samplerate
        x, _ = sf.read(path, frames=int(2.5 * sr), dtype='float32', always_2d=True)
    x = x.mean(axis=1)
    e = np.abs(x)
    i0 = int(np.argmax(e > e.max() * .004))
    seg = x[i0 + int((.04 if shot else .35) * sr): i0 + int((.45 if shot else 1.85) * sr)]
    if len(seg) < 2048:
        return None
    N = 1 << 18
    X = np.abs(np.fft.rfft(seg * np.hanning(len(seg)), N))
    fr = np.fft.rfftfreq(N, 1 / sr)
    f0 = 440 * 2 ** ((root - 69) / 12)
    est, wts = [], []
    for h in range(1, hmax + 1):
        lo, hi = h * f0 * 2 ** (-130 / 1200), h * f0 * 2 ** (130 / 1200)
        if hi > sr / 2 - 500:
            break
        m = (fr >= lo) & (fr <= hi)
        idx = np.flatnonzero(m)[int(np.argmax(X[m]))]
        a, b, c = np.log(X[idx - 1:idx + 2] + 1e-12)
        d = .5 * (a - c) / (a - 2 * b + c + 1e-12)
        est.append(1200 * np.log2((idx + d) * sr / N / (h * f0)))
        wts.append(X[idx])
    est, w = np.array(est), np.array(wts)
    med = float(np.median(est))
    good = np.abs(est - med) < 15
    return float(np.sum(est[good] * w[good]) / w[good].sum()) if good.any() else med


def rr_index(path):
    m = re.search(r'_rr?(\d+)', os.path.basename(path), re.I)
    return int(m.group(1)) if m else 1


def trim_tail(x, sr, floor_db=-66):
    env = np.abs(x).max(axis=1)
    thr = env.max() * 10 ** (floor_db / 20)
    idx = np.flatnonzero(env > thr)
    end = min(len(x), (idx[-1] if len(idx) else len(x)) + int(.05 * sr))
    y = x[:end].copy()
    k = min(len(y) // 4, int(.04 * sr))
    if k > 0:
        y[-k:] *= np.linspace(1, 0, k)[:, None]
    return y


def find_loop(x, sr):
    """A loop inside the sustain. Strings and winds have vibrato and bow changes, so the loop is long
    (>= 2 s), its two ends match in level, brightness and waveform, and the engine crossfades them."""
    m = x.mean(axis=1)
    hop = int(.1 * sr)
    n = len(m) // hop
    if n < 30:
        return None
    db = 20 * np.log10(np.sqrt(np.array([np.mean(m[i * hop:(i + 1) * hop] ** 2) for i in range(n)])) + 1e-9)
    db = np.convolve(db, np.ones(3) / 3, mode='same')
    ref = np.median(db[int(n * .25):int(n * .75)])
    near = np.flatnonzero(db > ref - 4)
    if len(near) < 20:
        return None
    att, sus_end = near[0] * hop, near[-1] * hop
    span = sus_end - att
    if span < 3 * sr:
        return None
    ls = att + max(int(.5 * sr), int(.15 * span))
    w = int(.05 * sr)

    def feats(i):
        seg = m[i:i + int(.12 * sr)]
        spec = np.abs(np.fft.rfft(seg * np.hanning(len(seg))))
        cen = float((spec * np.arange(len(spec))).sum() / (spec.sum() + 1e-12))
        return float(np.sqrt(np.mean(seg ** 2)) + 1e-9), cen

    rs, cs = feats(ls)
    a = m[ls:ls + w]
    lo, hi = ls + max(int(2 * sr), int(.4 * (sus_end - ls))), sus_end - int(.2 * sr)
    if hi <= lo:
        return None
    best = (-9.0, lo)
    for e in range(lo, hi, int(.02 * sr)):          # coarse: level and brightness
        r, c = feats(e)
        pen = abs(20 * np.log10(r / rs)) * .15 + abs(c / cs - 1) * 2
        if -pen > best[0] - 0 or best[0] == -9.0:
            if -pen > best[0]:
                best = (-pen, e)
    e0 = best[1]
    bestq, beste = -9.0, e0
    for e in range(max(lo, e0 - int(.01 * sr)), min(hi, e0 + int(.01 * sr))):   # fine: waveform, sample by sample
        b = m[e:e + w]
        q = float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-12))
        if q > bestq:
            bestq, beste = q, e
    r, c = feats(beste)
    quality = bestq - abs(20 * np.log10(r / rs)) * .05 - abs(c / cs - 1)
    xf = min(.4, (beste - ls) / sr / 4)
    return {'start': round(ls / sr, 5), 'end': round(beste / sr, 5), 'xfade': round(xf, 3), 'quality': round(quality, 3)}


def flatten(x, sr, lp):
    """Hold the level steady inside the loop (slow gain only, so vibrato and bow texture stay):
    a player's natural swell or fade would otherwise pulse at every loop seam."""
    m = x.mean(axis=1)
    win = int(.3 * sr)
    p2 = np.convolve(m ** 2, np.ones(win) / win, mode='same')
    env = np.sqrt(p2 + 1e-12)
    a, b = int(lp['start'] * sr), min(len(x), int((lp['end'] + .05) * sr))
    ref = float(np.median(env[max(0, a - int(.15 * sr)):a + int(.15 * sr)]))
    g = np.ones(len(x))
    g[a:b] = np.clip(ref / env[a:b], .25, 4.0)
    ramp = int(.25 * sr)
    lo = max(0, a - ramp)
    g[lo:a] = 1 + (g[a] - 1) * np.linspace(0, 1, a - lo)
    k = int(.2 * sr)                            # smooth the gain itself
    g = np.convolve(np.pad(g, (k, k), mode='edge'), np.ones(k) / k, mode='same')[k:-k]
    g[b:] = g[b - 1] if b > 0 else 1.0          # past the loop end is never heard while looping
    return x * g[:, None].astype(np.float32)


def encode(x, sr, path):
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as t:
        sf.write(t.name, x, sr, subtype='FLOAT')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', t.name, '-af', 'aresample=48000:resampler=soxr:precision=28',
                        '-c:a', 'libopus', '-b:a', '160k', '-vbr', 'on', '-compression_level', '10', path], check=True)
    os.unlink(t.name)


def decode(path):
    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', '48000', '-'],
                       check=True, capture_output=True)
    return np.frombuffer(r.stdout, np.float32).reshape(-1, 2), 48000

# ---------------------------------------------------------------- one recording

def build_region(args):
    pack, kind, f, root, layer, gain, tune, rr = args
    x, sr = S.load(f)                       # onset-trimmed stereo
    x = trim_tail(x, sr)
    if kind == 'piano':   # the damper ends most piano notes long before; keeps memory sane
        cap = int((14 - 10 * (root - 21) / 87) * sr)
        if len(x) > cap:
            x = x[:cap].copy()
            k = int(1.5 * sr)
            x[-k:] *= (np.cos(np.linspace(0, np.pi / 2, k)) ** 2)[:, None]
    if kind in ('sus', 'shot'):
        t = measure_cents(f, root, kind != 'sus', hmax=HMAX.get(pack, 6))
        tune = t if t is not None and abs(t) < 125 else 0.0
    lp0 = find_loop(x, sr) if kind == 'sus' else None
    if lp0:
        x = flatten(x, sr, lp0)
    name = f'{root}_l{layer}_r{rr}.ogg'
    dst = os.path.join(OUT, pack, name)
    encode(x, sr, dst)
    reg = {'root': root, 'layer': layer, 'rr': rr, 'file': name, 'tune': round(tune, 2),
           'gain': round(gain, 4), 'length': round(len(x) / sr, 3)}
    # ---- checks on the decoded file: what the player will hear
    y, ysr = decode(dst)
    chk = {}
    if kind in ('sus', 'shot', 'piano'):
        c = measure_cents(None, root, kind != 'sus', hmax=HMAX.get(pack, 6) if kind != 'piano' else 1, x=y, sr=ysr)
        chk['cents_after_fix'] = None if c is None else round(c - tune, 2)
    if kind == 'sus':
        lp = lp0
        if lp:
            reg['loop'] = lp
            # level step at the seam, measured on the decoded file
            m = y.mean(axis=1)
            w = int(.15 * ysr)
            a, b = int(lp['start'] * ysr), int(lp['end'] * ysr)
            r1 = np.sqrt(np.mean(m[a:a + w] ** 2)) + 1e-9
            r2 = np.sqrt(np.mean(m[b - w:b] ** 2)) + 1e-9
            chk['seam_db'] = round(float(abs(20 * np.log10(r2 / r1))), 2)
        chk['loop'] = lp['quality'] if lp else None
    if kind == 'sus':   # steady loudness, used by the engine to keep the level when it settles on one layer
        a = int((lp0['start'] if lp0 else .3) * ysr)
        b = int((lp0['end'] if lp0 else 1.5) * ysr)
        reg['rms'] = round(float(np.sqrt(np.mean(y[a:b] ** 2))), 6)
    seg = y[int(.03 * ysr):int((.35 if kind != 'sus' else 1.3) * ysr)]
    chk['level_db'] = round(20 * np.log10(np.sqrt(np.mean(seg ** 2)) * gain + 1e-9), 2)
    return reg, chk, f

# ---------------------------------------------------------------- packs

def pitched(pid, name, family, kind, pattern, opt):
    parser = S.salamander if kind == 'piano' else None
    inst = S.Inst(pid, pattern, offset=opt.get('offset', 12), kind=kind, parser=parser)
    if 'use_layers' in opt:
        inst.map = {k: v for k, v in inst.map.items() if k[1] in opt['use_layers']}
    layers = sorted({l for _, l in inst.map})
    lidx = {l: i + 1 for i, l in enumerate(layers)}   # sparse v1,v3,v5 -> 1,2,3
    jobs = []
    for (root, l), fs in inst.map.items():
        for k, f in enumerate(sorted(fs, key=rr_index)):
            jobs.append((pid, kind, f, root, lidx[l], inst.norm.get(f, 1.0), 0.0, k + 1))
    return jobs, len(layers), {'release': opt.get('release', .3), 'legatoSkip': opt.get('skip', 0)}


def percussion(pid, lib_key):
    p = LIB[lib_key]
    jobs = []
    for li, files in enumerate(p.layers):
        for k, f in enumerate(files):
            jobs.append((pid, 'perc', f, -1 if p.root0 is None else int(round(p.root0)), li + 1, 1.0, 0.0, k + 1))
    extra = {'pitchRoot': p.root0}
    return jobs, len(p.layers), extra


def run(pid, name, family, kind, jobs, layers, extra):
    os.makedirs(os.path.join(OUT, pid), exist_ok=True)
    for old in glob.glob(os.path.join(OUT, pid, '*.ogg')):
        os.remove(old)
    with ProcessPoolExecutor(os.cpu_count()) as ex:
        res = list(ex.map(build_region, jobs))
    regions = sorted((r for r, _, _ in res), key=lambda r: (r['root'], r['layer'], r['rr']))
    if kind == 'shot':   # short notes are hard to measure: trust the other recordings of the same note
        by_root = {}
        for r in regions:
            by_root.setdefault(r['root'], []).append(r)
        for group in by_root.values():
            if len(group) >= 3:
                med = float(np.median([r['tune'] for r in group]))
                for r in group:
                    if abs(r['tune'] - med) > 12:
                        r['tune'] = round(med, 2)
    credit = ('Salamander Grand Piano V3 by Alexander Holm, CC-BY 3.0' if kind == 'piano'
              else 'VSCO 2 Community Edition by Versilian Studios, CC0')
    man = {'id': pid, 'name': name, 'family': family, 'kind': kind, 'layers': layers, 'credit': credit,
           **extra, 'regions': regions}
    json.dump(man, open(os.path.join(OUT, pid, 'manifest.json'), 'w'), separators=(',', ':'))
    # ---- report
    cents = [c['cents_after_fix'] for _, c, _ in res if c.get('cents_after_fix') is not None]
    unmeasured = [os.path.basename(f) for _, c, f in res if 'cents_after_fix' in c and c['cents_after_fix'] is None]
    loops = [c['loop'] for _, c, _ in res if 'loop' in c]
    lv = {}
    for r, c, _ in res:
        lv.setdefault(r['layer'], []).append(c['level_db'])
    spread = max((np.percentile(v, 90) - np.percentile(v, 10)) for v in lv.values() if len(v) > 2) if any(len(v) > 2 for v in lv.values()) else 0
    rep = {'id': pid, 'files': len(regions), 'layers': layers,
           'mb': round(sum(os.path.getsize(os.path.join(OUT, pid, r['file'])) for r in regions) / 1e6, 1)}
    if cents:
        a = np.abs(cents)
        rep.update(tune_median_abs=round(float(np.median(a)), 1), tune_worst=round(float(a.max()), 1),
                   tune_over_5c=int((a > 5).sum()))
    if unmeasured:
        rep['tune_unmeasured'] = unmeasured
    if loops:
        seams = [c['seam_db'] for _, c, _ in res if 'seam_db' in c]
        rep.update(loops_found=sum(q is not None for q in loops), loops_total=len(loops),
                   loop_worst=min((q for q in loops if q is not None), default=None),
                   seam_worst_db=max(seams, default=None))
    rep['level_spread_db'] = round(float(spread), 1)
    print(json.dumps(rep), flush=True)
    return {'id': pid, 'name': name, 'family': family, 'kind': kind}, rep


LIB = None
if __name__ == '__main__':
    LIB = S.library()
    want = set(sys.argv[1:])
    index, reports = [], []
    for pid, name, family, kind, pattern, opt in PACKS:
        if want and pid not in want:
            continue
        jobs, layers, extra = pitched(pid, name, family, kind, pattern, opt)
        e, r = run(pid, name, family, kind, jobs, layers, extra)
        index.append(e); reports.append(r)
    for pid, name, key in PERC:
        if want and pid not in want:
            continue
        jobs, layers, extra = percussion(pid, key)
        e, r = run(pid, name, 'Percussion', 'perc', jobs, layers, extra)
        index.append(e); reports.append(r)
    if not want:
        json.dump({'packs': index}, open(os.path.join(OUT, 'library.json'), 'w'), indent=1)
    json.dump(reports, open(os.path.join(HERE, 'library_report.json' if not want else 'library_report_partial.json'), 'w'), indent=1)
