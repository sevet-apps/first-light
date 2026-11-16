"""Original score synthesised with numpy/scipy, aligned to the EDL cue times.

Warm detuned additive pad, sub swell under ignition, rising plucked motif through the ascent,
near-silence and a breath at beat 5, swelling resolve with a deep impact on the title, long
synthetic-IR reverb, ducked -6 dB under every voice-over line.
Writes _review/work/stem_music.wav (pre-mix level). Run build_voice.py first (ducking).
"""
import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

sys.path.insert(0, str(Path(__file__).resolve().parent))  # -I drops the script dir
from common import SR, WORK, add_at, biquad, butter, chain, convolve, integrated_lufs, load_edl, synth_ir, undb

MUSIC_LUFS = -17.0   # stem level before ducking; the final mix trim is applied in build_mix.py


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def smooth_env(n, points):
    """Piecewise-linear envelope from [(t, value), ...] with rounded corners."""
    t = np.arange(n) / SR
    ts, vs = zip(*points)
    base = np.interp(t, ts, vs)
    k = int(0.25 * SR)
    return signal.fftconvolve(np.pad(base, k, mode="edge"), np.hanning(k) / np.hanning(k).sum(), mode="same")[k:-k]


def pad(n, notes, env, bright, rng, span):
    """Detuned additive voices (L and R get different detunes), rendered only over span=(i0, i1)."""
    i0, i1 = span
    t = np.arange(i0, i1) / SR
    out = np.zeros((n, 2))
    harm = [(1, 1.0), (2, 0.38), (3, 0.2), (4, 0.1)]
    for m in notes:
        f = hz(m)
        for ch, dets in enumerate(((-7, 0.5, 6), (-5.5, -0.5, 7))):
            for d in dets:
                lfo = 1 + 0.0007 * np.sin(2 * np.pi * rng.uniform(0.05, 0.2) * t + rng.uniform(0, 6.28))
                ph = np.cumsum(2 * np.pi * f * 2 ** (d / 1200) * lfo / SR) + rng.uniform(0, 6.28)
                for h, a in harm:
                    amp = a * (bright[i0:i1] if h >= 3 else 1.0)
                    out[i0:i1, ch] += np.sin(h * ph) * amp / (m / 40.0 + 6)
    return out * env[:, None]


def pluck(f, dur=2.2):
    t = np.arange(int(dur * SR)) / SR
    x = (np.exp(-t / 0.9) * np.sin(2 * np.pi * f * t)
         + 0.32 * np.exp(-t / 0.45) * np.sin(2 * np.pi * 2.0 * f * t + 0.4)
         + 0.12 * np.exp(-t / 0.22) * np.sin(2 * np.pi * 3.01 * f * t)
         + 0.05 * np.exp(-t / 0.12) * np.sin(2 * np.pi * 5.4 * f * t))   # slightly inharmonic bell shimmer
    return x * np.minimum(1, t / 0.004) * np.minimum(1, (dur - t) / 0.3)


def noise_band(n, lo, hi, seed):
    x = np.random.default_rng(seed).standard_normal(n)
    return signal.sosfilt(signal.butter(2, [lo, hi], btype="band", fs=SR, output="sos"), x)


def stereo_pan(v, p):
    return np.stack([v * (1 - p), v * p], axis=1)


def main():
    edl = load_edl()
    n = int(round(edl["audio_duration"] * SR))
    rng = np.random.default_rng(11)
    cut = {b["n"]: b["cut"] for b in edl["beats"]}
    title = edl["title_card_start"]
    t = np.arange(n) / SR

    # ---- chord bed: (start, end, midi notes, level)
    chords = [
        (0.0, 6.0, [38, 45, 52, 57, 62], 0.45),                          # Dsus2 - the silence
        (6.0, 10.7, [35, 42, 45, 50, 54], 0.6),                          # Bm7 - liftoff
        (10.4, cut[5] + 0.2, [31, 38, 47, 50, 54], 0.65),                # Gmaj7 - letting go
        (cut[5], cut[6], [38, 45], 0.10),                                # near silence - the sky turns black
        (cut[6] - 0.3, cut[7] + 1.0, [38, 45, 52, 54, 57, 61], 0.75),    # Dmaj9 - the Earth turns blue
        (cut[7], cut[8] + 0.8, [35, 42, 49, 50, 54, 57], 0.85),          # Bm9 - wings
        (cut[8] - 0.4, cut[9] + 0.2, [31, 38, 47, 50, 55, 59], 0.95),    # G - a new eye
        (cut[9] - 0.2, title, [33, 40, 45, 50, 52, 57], 1.0),            # Asus - built by your hands
        (title - 0.05, 35.2, [38, 45, 50, 54, 57, 62, 64], 0.6),   # D add9 - resolve
    ]
    bed = np.zeros((n, 2))
    bright = smooth_env(n, [(0, 0.15), (6, 0.35), (cut[5], 0.05), (cut[6] + 1, 0.5), (title, 1.0), (35.2, 0.5)])
    for s, e, notes, lvl in chords:
        a = r = max(1.6, (e - s) * 0.3)
        if s >= title - 0.1:                      # the resolve blooms with the impact, then rings out
            a, r = 0.7, 3.0
        env = np.clip((t - s) / a, 0, 1) * np.clip((e - t) / r, 0, 1)
        i0, i1 = int(max(0, s) * SR), min(n, int((e + 0.05) * SR))
        bed += pad(n, notes, np.sin(env * np.pi / 2) ** 2 * lvl, bright, rng, (i0, i1))

    # ---- sub swell under ignition (dry, kept out of the reverb)
    sub_env = smooth_env(n, [(2.4, 0), (4.9, 1.0), (7.0, 0.55), (9.5, 0)]) * np.clip((t - 2.4) / 0.5, 0, 1)
    sub = np.sin(2 * np.pi * np.cumsum(36.7 + 4 * sub_env) / SR) * sub_env * 0.9
    sub += 0.25 * np.sin(2 * np.pi * np.cumsum(73.4 + 8 * sub_env) / SR) * sub_env
    sub = np.stack([sub, sub], axis=1)

    # ---- rising motif through the ascent, then a sparser high echo of it
    wet = np.zeros((n, 2))
    scale = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86, 88]
    tt, i = cut[3] + 0.5, 0
    while tt < cut[5] - 0.4:
        v = pluck(hz(scale[min(i, len(scale) - 1)])) * (0.16 + 0.05 * min(i, 6) / 6)
        add_at(wet, stereo_pan(v, 0.35 + 0.3 * np.sin(i * 1.7)), tt)
        tt += 0.4
        i += 1
    arp = [74, 78, 81, 86, 85, 81, 78, 74]
    tt, i = cut[6] + 0.6, 0
    while tt < title - 0.5:
        v = pluck(hz(arp[i % len(arp)] + (2 if (tt > cut[8] and i % 2 == 0) else 0)), 2.6) * 0.15
        add_at(wet, stereo_pan(v, 0.5 + 0.35 * np.sin(i * 2.1)), tt)
        tt += 0.5
        i += 1

    # ---- the breath at beat 5, a distant shimmer, and the riser into the title
    breath = noise_band(n, 500, 2600, 3) * smooth_env(n, [(cut[5] - 0.3, 0), (cut[5] + 1.0, 0.05), (cut[5] + 2.1, 0)])
    wet += np.stack([breath, np.roll(breath, 900)], axis=1) * 0.6
    for k, m in enumerate((86, 93)):
        v = pluck(hz(m), 3.5) * 0.08
        add_at(wet, stereo_pan(v, 0.5), cut[5] + 1.5 + 0.35 * k)
    riser = noise_band(n, 2500, 9000, 5) * smooth_env(n, [(title - 2.2, 0), (title - 0.05, 0.06), (title, 0)])
    wet += np.stack([riser, np.roll(riser, 700)], axis=1)

    # ---- deep impact on the title (sub drop + low thud)
    ti = np.arange(int(3.5 * SR)) / SR
    drop = np.sin(2 * np.pi * np.cumsum(32 + 38 * np.exp(-ti / 0.12)) / SR) * np.exp(-ti / 1.3) * np.minimum(1, ti / 0.006)
    thud = signal.sosfilt(butter("lowpass", 160, 2), np.random.default_rng(9).standard_normal(len(ti)))
    thud *= np.exp(-ti / 0.35) * np.minimum(1, ti / 0.004)
    hit = drop * 2.4 + thud * 1.1
    impact = np.zeros((n, 2))
    add_at(impact, stereo_pan(hit, 0.5), title)   # kept out of the VO duck so it lands at full weight
    add_at(wet, stereo_pan(drop * 0.25, 0.5), title)

    # ---- long convolution reverb on the bed and motif; sub stays dry
    ir = synth_ir(4.5, rt60=3.8, seed=21, predelay_ms=25, damping_hz=5000)
    src = bed + wet
    rev = convolve(src, ir)[:n]
    mid, side = (rev[:, 0] + rev[:, 1]) / 2, (rev[:, 0] - rev[:, 1]) / 2
    rev = np.stack([mid + 1.25 * side, mid - 1.25 * side], axis=1)   # tasteful extra width on the tail
    mix = 0.62 * src + 0.9 * rev + sub

    mix = chain(mix, butter("highpass", 28, 2), biquad("lowshelf", 120, 1.5, 0.7), biquad("highshelf", 6500, -3.0, 0.7))
    k = int(0.02 * SR)
    mix[:k] *= np.linspace(0, 1, k)[:, None]
    k = int(1.5 * SR)                            # reverb tail has decayed; fade the last bit to true silence
    mix[-k:] *= np.cos(np.linspace(0, np.pi / 2, k))[:, None] ** 2
    g = undb(MUSIC_LUFS - integrated_lufs(mix))
    mix *= g

    # ---- duck -6 dB under each voice-over line (smooth, no pumping clicks)
    tl = json.loads((WORK / "voice_timeline.json").read_text(encoding="utf-8"))["lines"]
    duck = np.zeros(n)
    for ln in tl:
        duck[int(max(0, ln["start"] - 0.1) * SR):int((ln["end"] + 0.25) * SR)] = 1.0
    k = int(0.35 * SR)
    duck = signal.fftconvolve(duck, np.hanning(k) / np.hanning(k).sum(), mode="same")
    mix *= (1 - duck * (1 - undb(-6)))[:, None]

    mix += chain(impact, butter("highpass", 28, 2)) * g * 2.2
    sf.write(str(WORK / "stem_music.wav"), mix, SR, subtype="FLOAT")
    print(f"music stem: {integrated_lufs(mix):.1f} LUFS, peak {20 * np.log10(np.abs(mix).max()):.1f} dBFS")


if __name__ == "__main__":
    main()
