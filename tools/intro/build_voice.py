"""Narration stem: Kokoro TTS (af_nicole) or an external take split into the ten lines.

    python -I tools/intro/build_voice.py                    # Kokoro
    python -I tools/intro/build_voice.py --voice-file take.wav [--split-times 3.1,7.5,...]

Writes _review/work/stem_voice.wav (pre-mix level) and _review/work/voice_timeline.json.
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

sys.path.insert(0, str(Path(__file__).resolve().parent))  # -I drops the script dir
from common import (SR, WORK, add_at, biquad, butter, chain, compress, convolve, db, fit_length,
                    integrated_lufs, load_edl, read_audio, synth_ir, to_stereo, undb)

KOKORO_DIR = Path("C:/Users/Svyatoslav/tts-models/kokoro")
VOICE, SPEED = "af_nicole", 0.9
LINE_LUFS = -17.0      # per-line loudness (stem level before the final mix trim)
REVERB_WET = 0.11      # energy fraction of the plate return


# ------------------------------------------------------------------ sources
def synth_kokoro(edl):
    """Each number and phrase is a separate utterance joined with the EDL's pauses."""
    from kokoro_onnx import Kokoro
    cache = WORK / "voice_raw"
    cache.mkdir(parents=True, exist_ok=True)
    kokoro = None
    lines = []
    for beat in edl["beats"]:
        key = hashlib.sha1(json.dumps([beat["tts"], beat["tts_gaps"], VOICE, SPEED]).encode()).hexdigest()[:10]
        f = cache / f"line_{beat['n']:02d}_{key}.wav"
        if not f.exists():
            kokoro = kokoro or Kokoro(str(KOKORO_DIR / "kokoro-v1.0.onnx"), str(KOKORO_DIR / "voices-v1.0.bin"))
            parts = []
            for text, gap in zip(beat["tts"], beat["tts_gaps"]):
                a, sr = kokoro.create(text, voice=VOICE, speed=SPEED, lang="en-us")
                a = trim(a, -42)
                parts += [np.zeros(int(gap * sr), dtype=np.float32), a]
            sf.write(str(f), np.concatenate(parts), sr)
        x, sr = sf.read(str(f))
        lines.append(signal.resample_poly(x, SR, sr))
    return lines


def speech_envelope(x, win_ms=20):
    w = int(SR * win_ms / 1000)
    n = len(x) // w
    return db(np.sqrt((x[:n * w] ** 2).reshape(n, w).mean(axis=1))), w


def split_external(path, n_lines, split_times=None):
    """Split one narration file into n_lines by silence: cut at the n-1 longest pauses."""
    x = read_audio(path).mean(axis=1)
    x = x / max(np.abs(x).max(), 1e-9)
    if split_times:
        cuts = [int(t * SR) for t in split_times]
    else:
        env, w = speech_envelope(x)
        floor = np.percentile(env, 10)
        thr = max(env.max() - 45, floor + 8)
        speech = env > thr
        idx = np.flatnonzero(speech)
        first, last = idx[0], idx[-1]
        runs, i = [], first
        while i <= last:                       # silent runs between first and last speech
            if not speech[i]:
                j = i
                while not speech[j]:
                    j += 1
                runs.append((j - i, i, j))
                i = j
            else:
                i += 1
        if len(runs) < n_lines - 1:
            raise SystemExit(f"only {len(runs)} pauses found, need {n_lines - 1}; pass --split-times")
        best = sorted(sorted(runs, reverse=True)[:n_lines - 1], key=lambda r: r[1])
        cuts = [int((a + b) / 2 * w) for _, a, b in best]
        print("pauses used as line breaks (s):", [round(r[0] * w / SR, 2) for r in best])
    edges = [0] + cuts + [len(x)]
    return [x[a:b] for a, b in zip(edges[:-1], edges[1:])]


# ------------------------------------------------------------------ processing
def trim(x, thresh_db=-48):
    """Cut leading/trailing silence relative to the line's own peak."""
    a = np.flatnonzero(np.abs(x) > undb(thresh_db) * np.abs(x).max())
    return x[a[0]:a[-1] + 1]


def deess(x, centre=7000, thr_over_rms=-2.0, ratio=4.0, max_red=8.0):
    """Split-band de-esser: attenuate the 5-9 kHz band only when it spikes."""
    band = signal.sosfilt(signal.butter(2, [5000, 9000], btype="band", fs=SR, output="sos"), x)
    w = int(SR * 0.004)
    n = len(x) // w
    env = db(np.sqrt((band[:n * w] ** 2).reshape(n, w).mean(axis=1)))
    thr = db(np.sqrt(np.mean(x ** 2))) + thr_over_rms - 14
    red = np.clip((env - thr) * (1 - 1 / ratio), 0, max_red)
    red = np.convolve(red, np.ones(3) / 3, mode="same")
    g = undb(-np.interp(np.arange(len(x)), (np.arange(n) + 0.5) * w, red))
    return x - band * (1 - g)


def process_line(x, index):
    """Dry chain -> loudness match -> plate reverb. Returns (stereo, speech_len_samples)."""
    x = trim(x)
    x = chain(x, butter("highpass", 70, 2), biquad("lowshelf", 180, 2.0, 0.7), biquad("peak", 4000, 1.5, 0.8))
    x = deess(x)
    st = to_stereo(x)
    st = compress(st, thresh_db=db(np.sqrt(np.mean(x ** 2))) + 3, ratio=3.0, attack_ms=8, release_ms=120)
    # short fades so no edge can click
    fade = int(0.006 * SR)
    st[:fade] *= np.linspace(0, 1, fade)[:, None]
    st[-fade:] *= np.linspace(1, 0, fade)[:, None]
    st *= undb(LINE_LUFS - integrated_lufs(st))
    speech_len = len(st)
    ir = synth_ir(1.1, rt60=0.9, seed=100 + index, predelay_ms=14, damping_hz=6000)
    wet = convolve(st, ir)
    dry = np.concatenate([st, np.zeros((len(wet) - len(st), 2))])
    out = np.sqrt(1 - REVERB_WET) * dry + np.sqrt(REVERB_WET) * wet
    return out, speech_len


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice-file", help="external narration (WAV/MP3...) to split into the ten lines")
    ap.add_argument("--split-times", help="comma-separated cut times (s) in the external file, overrides detection")
    ap.add_argument("--out", default=str(WORK / "stem_voice.wav"))
    args = ap.parse_args()

    edl = load_edl()
    n = len(edl["beats"])
    if args.voice_file:
        st = [float(t) for t in args.split_times.split(",")] if args.split_times else None
        raw = split_external(args.voice_file, n, st)
        source = f"external:{args.voice_file}"
    else:
        raw = synth_kokoro(edl)
        source = f"kokoro:{VOICE}@{SPEED}"

    total = int(round(edl["duration"] * SR))
    stem = np.zeros((total, 2))
    timeline = []
    for i, (beat, x) in enumerate(zip(edl["beats"], raw)):
        line, speech_len = process_line(x, i)
        start = beat["cut"] + edl["vo_offset"]
        end = start + speech_len / SR
        slot_end = edl["beats"][i + 1]["cut"] if i + 1 < n else edl["duration"]
        if end > slot_end - 0.1:
            print(f"WARNING line {beat['n']} ends {end:.2f}s, next cut at {slot_end:.2f}s")
        add_at(stem, line, start)
        timeline.append({"n": beat["n"], "start": round(start, 3), "end": round(end, 3), "text": beat["text"]})
        print(f"line {beat['n']:2d}: {start:6.2f} - {end:6.2f}s  ({end - start:.2f}s)  {beat['text']}")
    sf.write(args.out, stem, SR, subtype="FLOAT")
    (WORK / "voice_timeline.json").write_text(json.dumps({"source": source, "lines": timeline}, indent=1), encoding="utf-8")
    print("voice stem:", args.out, f"integrated {integrated_lufs(stem):.1f} LUFS ({source})")


if __name__ == "__main__":
    main()
