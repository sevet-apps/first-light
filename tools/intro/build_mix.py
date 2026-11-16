"""Finalise the narration stem (and the optional music stem), subtitles and the cue sheet.

    python -I tools/intro/build_mix.py [--music-file track.wav [--music-offset S]]

The voice stem is levelled to -16 LUFS integrated with a true peak under -1 dBTP and written to
assets/audio/intro_voice.mp3. A music track is only produced when --music-file is given: it is
aligned to t = 0 (shifted by --music-offset), trimmed/faded to the audio length and ducked -6 dB
under each voice-over line with 150 ms ramps. Writes assets/subtitles/intro.en.vtt and
tools/intro/cues.json.
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

sys.path.insert(0, str(Path(__file__).resolve().parent))  # -I drops the script dir
from common import (ROOT, SR, TOOLS, WORK, fit_length, integrated_lufs, load_edl, read_audio, run, to_stereo,
                    sample_peak_db, true_peak_db, undb, write_mp3)

TARGET_LUFS = -16.0
TP_LIMIT = -1.0
MUSIC_LUFS = -23.0     # music level before ducking (voice stays the lead)
MUSIC_DUCK_DB = -6.0
AUDIO_DIR = ROOT / "assets" / "audio"


def vtt_time(t):
    ms = int(round(t * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d}.{ms % 1000:03d}"


def write_subtitles(edl, timeline):
    """One cue per line, timed to the spoken audio; text is the script verbatim."""
    out = ["WEBVTT", ""]
    for ln in timeline:
        out += [str(ln["n"]), f"{vtt_time(ln['start'])} --> {vtt_time(ln['end'])}", ln["text"], ""]
    path = ROOT / "assets" / "subtitles" / "intro.en.vtt"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(out), encoding="utf-8")


def write_cues(edl, timeline, stems):
    cues = {
        "duration": edl["duration"],
        "audioEnd": edl["audio_duration"],
        "title_card_start": edl["title_card_start"],
        "fps": edl["fps"],
        "video": "assets/video/intro.mp4",
        "stems": {s: f"assets/audio/intro_{s}.mp3" for s in stems},
        "subtitles": "assets/subtitles/intro.en.vtt",
        "voice_source": json.loads((WORK / "voice_timeline.json").read_text(encoding="utf-8"))["source"],
        "beats": [{"beat": b["n"], "name": b["name"], "cut": b["cut"], "vo_start": ln["start"], "vo_end": ln["end"],
                   "subtitle": ln["text"]} for b, ln in zip(edl["beats"], timeline)],
    }
    (TOOLS / "cues.json").write_text(json.dumps(cues, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def soft_limit(x, thr=0.45, ceil=0.8):
    """Smooth peak shaper: untouched below thr, asymptotically approaches ceil (no clipping edges)."""
    a = np.abs(x)
    shaped = thr + (ceil - thr) * np.tanh((a - thr) / (ceil - thr))
    return np.sign(x) * np.where(a > thr, shaped, a)


def prepare_music(path, offset, n, timeline):
    """Align the owner's track to t = 0, fit to n samples with fades, level it and duck under the VO."""
    x = to_stereo(read_audio(path)[:, :2] if read_audio(path).shape[1] > 1 else read_audio(path)[:, 0])
    i = int(round(offset * SR))
    x = np.concatenate([np.zeros((i, 2)), x]) if i > 0 else x[-i:]
    x = fit_length(x, n)
    x *= undb(MUSIC_LUFS - integrated_lufs(x[: int(len(x))]))
    fi, fo = int(0.05 * SR), int(2.5 * SR)
    x[:fi] *= np.linspace(0, 1, fi)[:, None]
    x[-fo:] *= np.cos(np.linspace(0, np.pi / 2, fo))[:, None] ** 2
    duck = np.zeros(n)
    for ln in timeline:
        duck[int(max(0, ln["start"] - 0.15) * SR):int((ln["end"] + 0.25) * SR)] = 1.0
    k = int(0.15 * SR)                         # 150 ms ramps
    duck = np.clip(signal.fftconvolve(duck, np.ones(k) / k, mode="same"), 0, 1)
    return x * (1 - duck * (1 - undb(MUSIC_DUCK_DB)))[:, None]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--music-file")
    ap.add_argument("--music-offset", type=float, default=0.0, help="seconds the track starts after t = 0")
    args = ap.parse_args()
    edl = load_edl()
    n = int(round(edl["audio_duration"] * SR))
    timeline = json.loads((WORK / "voice_timeline.json").read_text(encoding="utf-8"))["lines"]
    stems = {"voice": fit_length(read_audio(WORK / "stem_voice.wav"), n)}
    if args.music_file:
        stems["music"] = prepare_music(args.music_file, args.music_offset, n, timeline)

    gain = undb(TARGET_LUFS - integrated_lufs(stems["voice"]))
    for _ in range(6):                       # refine on the decoded voice MP3
        write_mp3(AUDIO_DIR / "intro_voice.mp3", soft_limit(stems["voice"] * gain))
        dec = fit_length(read_audio(AUDIO_DIR / "intro_voice.mp3"), n)
        lufs, tp = integrated_lufs(dec), true_peak_db(dec)
        if abs(lufs - TARGET_LUFS) < 0.15 and tp <= TP_LIMIT - 0.2:
            break
        gain *= undb(min(TARGET_LUFS - lufs, TP_LIMIT - 0.3 - tp))
    print(f"voice: {lufs:.2f} LUFS integrated, true peak {tp:.2f} dBTP (gain {20 * np.log10(gain):+.2f} dB)")
    report = {"voice": {"lufs": round(lufs, 2), "true_peak_db": round(tp, 2), "sample_peak_db": round(sample_peak_db(dec), 2)}}
    if "music" in stems:
        write_mp3(AUDIO_DIR / "intro_music.mp3", soft_limit(stems["music"]))
        m = fit_length(read_audio(AUDIO_DIR / "intro_music.mp3"), n)
        report["music"] = {"lufs": round(integrated_lufs(m), 2), "true_peak_db": round(true_peak_db(m), 2)}
        print("music:", report["music"])
    (WORK / "mix_report.json").write_text(json.dumps(report, indent=1), encoding="utf-8")
    write_subtitles(edl, timeline)
    write_cues(edl, timeline, stems)


if __name__ == "__main__":
    main()
