"""Launch sound design stem, aligned to the EDL cue times.

The NASA source clips carry no usable audio (their audio tracks are digital silence, checked with
ffmpeg volumedetect: -91 dB), so the ignition crackle, the roar that muffles with altitude, the
booster-separation burst and the transitions are all synthesised from shaped noise here.
Writes _review/work/stem_sfx.wav (pre-mix level).
"""
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

sys.path.insert(0, str(Path(__file__).resolve().parent))  # -I drops the script dir
from common import SR, WORK, add_at, biquad, butter, chain, convolve, load_edl, synth_ir


def env_curve(n, points):
    t = np.arange(n) / SR
    ts, vs = zip(*points)
    base = np.interp(t, ts, vs)
    k = int(0.15 * SR)
    return signal.fftconvolve(np.pad(base, k, mode="edge"), np.hanning(k) / np.hanning(k).sum(), mode="same")[k:-k]


def noise2(n, seed):
    return np.random.default_rng(seed).standard_normal((n, 2))


def brown(n, seed):
    x = np.cumsum(np.random.default_rng(seed).standard_normal(n))
    return signal.sosfilt(butter("highpass", 20, 2), x) / np.sqrt(n) * 120


def sweep_whoosh(dur, f0, f1, seed, peak=0.5, tail=0.35):
    """Band-passed noise with a gliding centre frequency and a swelling envelope that lands at its end."""
    n = int((dur + tail) * SR)
    t = np.arange(n) / SR
    out = np.zeros((n, 2))
    for ch in range(2):
        x = np.random.default_rng(seed + ch).standard_normal(n)
        # gliding resonant band-pass: sum of two overlapping fixed bands crossfaded along the glide
        fc = np.geomspace(f0, f1, 6)
        w = np.exp(-((np.arange(6)[None, :] - (np.clip(t / dur, 0, 1) * 5)[:, None]) ** 2) / 1.2)
        for k, f in enumerate(fc):
            band = signal.sosfilt(signal.butter(2, [f * 0.7, f * 1.4], btype="band", fs=SR, output="sos"), x)
            out[:, ch] += band * w[:, k]
    e = np.where(t < dur, (t / dur) ** 2.2, np.exp(-(t - dur) / (tail * 0.45)))
    return out * e[:, None] * peak / np.abs(out).max()


def main():
    edl = load_edl()
    n = int(round(edl["audio_duration"] * SR))
    cut = {b["n"]: b["cut"] for b in edl["beats"]}
    title = edl["title_card_start"]
    out = np.zeros((n, 2))
    t = np.arange(n) / SR

    # ---- night stillness: a barely audible, cool air bed
    air = chain(noise2(n, 1), butter("highpass", 1800, 2), butter("lowpass", 7000, 2))
    out += air * env_curve(n, [(0, 0), (1.0, 0.004), (cut[2] - 0.3, 0.004), (cut[2], 0)])[:, None]

    # ---- ignition: sub thump, crackle, then the roar that thins out with altitude
    ti = np.arange(int(1.6 * SR)) / SR
    thump = np.sin(2 * np.pi * np.cumsum(34 + 70 * np.exp(-ti / 0.07)) / SR) * np.exp(-ti / 0.55) * np.minimum(1, ti / 0.004)
    add_at(out, np.stack([thump, thump], axis=1) * 0.9, cut[2] - 0.02)

    rng = np.random.default_rng(4)
    crackle = np.zeros(n)
    gate = env_curve(n, [(cut[2] - 0.1, 0), (cut[2] + 0.6, 1), (cut[3] + 1.5, 1), (cut[4] + 1.0, 0)])
    pulses = rng.random(n) < (900 / SR) * gate
    crackle[pulses] = rng.standard_normal(pulses.sum()) * (rng.random(pulses.sum()) ** 2)
    crackle = signal.sosfilt(signal.butter(2, [1500, 9000], btype="band", fs=SR, output="sos"), crackle)
    crackle = signal.lfilter([1], [1, -0.55], crackle)           # a little body so it reads as fire, not clicks
    out += np.stack([crackle, np.roll(crackle, 53)], axis=1) * 0.35

    rumble = chain(np.stack([brown(n, 7), brown(n, 8)], axis=1), butter("lowpass", 260, 2), biquad("peak", 70, 4, 0.8))
    roar_lo = chain(noise2(n, 9), butter("lowpass", 900, 2), butter("highpass", 90, 2))
    roar_hi = chain(noise2(n, 10), butter("highpass", 900, 2), butter("lowpass", 5500, 2))
    ramp = env_curve(n, [(cut[2] - 0.1, 0), (cut[2] + 1.8, 0.7), (cut[3] + 0.8, 1.0), (cut[4] - 0.3, 0.85), (cut[4] + 1.0, 0.3), (cut[5] - 0.2, 0)])
    bright = env_curve(n, [(cut[2], 0.3), (cut[3] + 0.5, 0.7), (cut[4], 0.2), (cut[5], 0.0)])     # highs fade first: muffled by altitude
    out += (rumble * 0.55 + roar_lo * 0.12 + roar_hi * 0.05 * bright[:, None] * 2) * ramp[:, None]

    # ---- booster separation: motor burst, metallic clunk, debris hiss
    nb = int(2.2 * SR)
    tb = np.arange(nb) / SR
    burst = chain(noise2(nb, 12), butter("highpass", 250, 2), butter("lowpass", 4500, 2)) * (np.exp(-tb / 0.55) * np.minimum(1, tb / 0.005))[:, None]
    clunk = sum(a * np.exp(-tb / d) * np.sin(2 * np.pi * f * tb) for f, a, d in ((181, 0.6, 0.18), (437, 0.35, 0.12), (1210, 0.18, 0.07), (2330, 0.08, 0.04)))
    clunk = np.stack([clunk, clunk], axis=1) * np.minimum(1, tb / 0.002)[:, None]
    add_at(out, burst * 0.22 + clunk * 0.5, cut[4])
    add_at(out, burst * 0.1 + clunk * 0.2, cut[4] + 0.55)

    # ---- designed whooshes into cuts (low, soft) and a falling dip before the title
    for k, (c, f0, f1, pk) in enumerate([(cut[2], 120, 900, 0.45), (cut[3], 150, 1200, 0.4), (cut[4], 200, 1600, 0.3),
                                         (cut[6], 300, 2400, 0.22), (cut[7], 300, 2800, 0.22), (cut[8], 260, 2200, 0.22),
                                         (cut[9], 200, 1500, 0.28)]):
        w = sweep_whoosh(0.7, f0, f1, 30 + 7 * k, pk)
        add_at(out, w, c - 0.7)
    fall = sweep_whoosh(0.6, 2600, 180, 90, 0.3)
    add_at(out, fall, 29.2)

    # ---- space: a very soft airy texture under the orbital shots, gone near the title
    space = chain(noise2(n, 20), butter("highpass", 2500, 2), butter("lowpass", 9000, 2))
    out += space * env_curve(n, [(cut[5] + 0.5, 0), (cut[6] + 0.5, 0.0035), (cut[9], 0.0045), (29.2, 0.0), (title - 0.5, 0.0), (title + 0.8, 0.0045), (36.0, 0.003), (37.6, 0)])[:, None]
    hum = np.sin(2 * np.pi * 55 * t) * env_curve(n, [(cut[6], 0), (cut[6] + 1.5, 0.012), (29.2, 0.012), (30.0, 0)])
    out += np.stack([hum, hum], axis=1)

    # ---- a short room-ish tail so the hits do not sound pasted on, then the safety fade edges
    ir = synth_ir(1.6, rt60=1.2, seed=41, predelay_ms=8, damping_hz=4000)
    out = 0.8 * out + 0.35 * convolve(out, ir)[:n]
    out = chain(out, butter("highpass", 24, 2))
    k = int(0.02 * SR)
    out[:k] *= np.linspace(0, 1, k)[:, None]
    out[-k:] *= np.linspace(1, 0, k)[:, None]
    out *= 0.17   # stem level before the final mix trim

    sf.write(str(WORK / "stem_sfx.wav"), out, SR, subtype="FLOAT")
    print(f"sfx stem: peak {20 * np.log10(np.abs(out).max()):.1f} dBFS")


if __name__ == "__main__":
    main()
