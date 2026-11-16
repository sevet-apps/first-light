"""Shared helpers for the intro-film build scripts (paths, EDL, DSP, loudness, mp3)."""
import json
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

ROOT = Path(__file__).resolve().parents[2]
TOOLS = ROOT / "tools" / "intro"
WORK = ROOT / "_review" / "work"
REVIEW = ROOT / "_review"
SR = 48000


def load_edl():
    return json.loads((TOOLS / "edl.json").read_text(encoding="utf-8"))


def beat_cut_times(edl):
    return [b["cut"] for b in edl["beats"]]


def run(cmd, **kw):
    """Run a subprocess, raising with captured stderr on failure."""
    r = subprocess.run([str(c) for c in cmd], capture_output=True, **kw)
    if r.returncode:
        raise RuntimeError(f"{cmd[0]} failed:\n{r.stderr.decode(errors='replace')[-3000:]}")
    return r


# ---------------------------------------------------------------- audio I/O
def to_stereo(x):
    x = np.asarray(x, dtype=np.float64)
    return np.stack([x, x], axis=1) if x.ndim == 1 else x


def fit_length(x, n):
    """Pad with silence or trim a (n, 2) array to exactly n samples."""
    if len(x) >= n:
        return x[:n]
    return np.concatenate([x, np.zeros((n - len(x), x.shape[1]))])


def add_at(dst, src, t, gain=1.0):
    """Mix src into dst starting at time t (seconds), clipped to dst length."""
    i = int(round(t * SR))
    if i >= len(dst):
        return
    if i < 0:
        src, i = src[-i:], 0
    n = min(len(src), len(dst) - i)
    dst[i:i + n] += src[:n] * gain


def write_mp3(path, x, bitrate="192k"):
    """Encode a (n, 2) float array at 48 kHz to MP3 via ffmpeg (LAME)."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = np.clip(x, -1, 1).astype("<f4").tobytes()
    r = subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-",
                        "-c:a", "libmp3lame", "-b:a", bitrate, "-ar", str(SR), str(path)],
                       input=raw, capture_output=True)
    if r.returncode:
        raise RuntimeError(r.stderr.decode(errors="replace"))


def read_audio(path):
    x, sr = sf.read(str(path), always_2d=True)
    if sr != SR:
        x = signal.resample_poly(x, SR, sr, axis=0)
    return x


# ---------------------------------------------------------------- filters
def _sos(b, a):
    return signal.tf2sos(b, a)


def biquad(kind, f0, gain_db=0.0, q=0.707):
    """RBJ cookbook biquad as second-order sections at SR."""
    A = 10 ** (gain_db / 40)
    w0 = 2 * np.pi * f0 / SR
    cw, sw = np.cos(w0), np.sin(w0)
    al = sw / (2 * q)
    if kind == "highpass":
        b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]
        a = [1 + al, -2 * cw, 1 - al]
    elif kind == "lowpass":
        b = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2]
        a = [1 + al, -2 * cw, 1 - al]
    elif kind == "peak":
        b = [1 + al * A, -2 * cw, 1 - al * A]
        a = [1 + al / A, -2 * cw, 1 - al / A]
    elif kind == "lowshelf":
        s = 2 * np.sqrt(A) * al
        b = [A * ((A + 1) - (A - 1) * cw + s), 2 * A * ((A - 1) - (A + 1) * cw), A * ((A + 1) - (A - 1) * cw - s)]
        a = [(A + 1) + (A - 1) * cw + s, -2 * ((A - 1) + (A + 1) * cw), (A + 1) + (A - 1) * cw - s]
    elif kind == "highshelf":
        s = 2 * np.sqrt(A) * al
        b = [A * ((A + 1) + (A - 1) * cw + s), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - s)]
        a = [(A + 1) - (A - 1) * cw + s, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - s]
    else:
        raise ValueError(kind)
    return _sos(np.array(b) / a[0], np.array(a) / a[0])


def chain(x, *filters):
    for f in filters:
        x = signal.sosfilt(f, x, axis=0)
    return x


def butter(kind, fc, order=2):
    return signal.butter(order, fc, btype=kind, fs=SR, output="sos")


def db(x):
    return 20 * np.log10(np.maximum(x, 1e-9))


def undb(d):
    return 10 ** (d / 20)


def compress(x, thresh_db, ratio, attack_ms, release_ms, knee_db=6.0):
    """Feed-forward soft-knee compressor with a 1 kHz control rate. x is (n, 2)."""
    hop = SR // 1000
    n = len(x) // hop * hop
    lvl = np.abs(x[:n]).max(axis=1).reshape(-1, hop).max(axis=1)
    lvl_db = db(lvl)
    over = lvl_db - thresh_db
    red = np.where(over <= -knee_db / 2, 0.0,
                   np.where(over >= knee_db / 2, over * (1 - 1 / ratio),
                            (1 - 1 / ratio) * (over + knee_db / 2) ** 2 / (2 * knee_db)))
    ca, cr = np.exp(-1 / attack_ms), np.exp(-1 / release_ms)
    g = np.zeros_like(red)
    cur = 0.0
    for i, r in enumerate(red):
        c = ca if r > cur else cr
        cur = c * cur + (1 - c) * r
        g[i] = cur
    gain = undb(-np.interp(np.arange(len(x)), (np.arange(len(g)) + 0.5) * hop, g))
    return x * gain[:, None]


def synth_ir(length_s, rt60, seed, predelay_ms=12.0, damping_hz=7000, stereo=True):
    """Diffuse exponentially decaying noise IR whose highs decay faster than lows."""
    rng = np.random.default_rng(seed)
    n = int(length_s * SR)
    t = np.arange(n) / SR
    out = []
    for ch in range(2 if stereo else 1):
        noise = rng.standard_normal(n)
        dark = signal.sosfilt(butter("lowpass", 1800), noise)
        bright = signal.sosfilt(butter("lowpass", damping_hz), noise)
        env_b = np.exp(-t * 6.91 / (rt60 * 0.55))
        env_d = np.exp(-t * 6.91 / rt60)
        ir = bright * env_b + dark * env_d * 1.4
        ir *= np.minimum(1, t / 0.004)  # soft onset, no click
        pd = int(predelay_ms / 1000 * SR)
        ir = np.concatenate([np.zeros(pd), ir])[:n]
        out.append(ir / np.sqrt(np.sum(ir ** 2)))
    return np.stack(out, axis=1)


def convolve(x, ir):
    """Stereo FFT convolution (x: (n,2) or (n,), ir: (m,2)); returns (n+m-1, 2)."""
    x = to_stereo(x)
    return np.stack([signal.fftconvolve(x[:, c], ir[:, c]) for c in range(2)], axis=1)


# ---------------------------------------------------------------- loudness (BS.1770-4)
_KW = None


def _kweight(x):
    global _KW
    if _KW is None:
        hs = biquad("highshelf", 1681.97, 3.9997, 0.7072)
        hp = signal.butter(2, 38.1355, btype="high", fs=SR, output="sos")
        _KW = np.vstack([hs, hp])
    return signal.sosfilt(_KW, x, axis=0)


def integrated_lufs(x):
    """Gated integrated loudness of a (n, 2) array at 48 kHz."""
    x = to_stereo(x)
    k = _kweight(x)
    blk, step = int(0.4 * SR), int(0.1 * SR)
    if len(k) < blk:
        return -70.0
    ms = np.array([np.mean(k[i:i + blk] ** 2, axis=0).sum() for i in range(0, len(k) - blk + 1, step)])
    lk = -0.691 + 10 * np.log10(np.maximum(ms, 1e-12))
    keep = lk > -70
    if not keep.any():
        return -70.0
    rel = -0.691 + 10 * np.log10(ms[keep].mean()) - 10
    keep &= lk > rel
    if not keep.any():
        return -70.0
    return -0.691 + 10 * np.log10(ms[keep].mean())


def true_peak_db(x):
    x = to_stereo(x)
    return float(db(np.abs(signal.resample_poly(x, 4, 1, axis=0)).max()))


def sample_peak_db(x):
    return float(db(np.abs(x).max()))
