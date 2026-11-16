"""Finalise the three stems, subtitles and the cue sheet.

Reads the float stems from _review/work, ducks the sfx lightly under the voice, applies ONE common
gain so that voice + music + sfx summed at unity reach -16 LUFS integrated, verifies the true peak,
and writes assets/audio/intro_{voice,music,sfx}.mp3, assets/subtitles/intro.en.vtt and
tools/intro/cues.json. Loudness is reported from the decoded MP3s (what the game will play).
"""
import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

sys.path.insert(0, str(Path(__file__).resolve().parent))  # -I drops the script dir
from common import (ROOT, SR, TOOLS, WORK, fit_length, integrated_lufs, load_edl, read_audio, run,
                    sample_peak_db, true_peak_db, undb, write_mp3)

TARGET_LUFS = -16.0
TP_LIMIT = -1.0
SFX_VOICE_DUCK_DB = -3.0
STEMS = ("voice", "music", "sfx")


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


def write_cues(edl, timeline):
    cues = {
        "duration": edl["duration"],
        "audioEnd": edl["audio_duration"],
        "title_card_start": edl["title_card_start"],
        "fps": edl["fps"],
        "video": "assets/video/intro.mp4",
        "audio": {s: f"assets/audio/intro_{s}.mp3" for s in STEMS},
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


def main():
    edl = load_edl()
    n = int(round(edl["audio_duration"] * SR))
    stems = {s: fit_length(read_audio(WORK / f"stem_{s}.wav"), n) for s in STEMS}
    timeline = json.loads((WORK / "voice_timeline.json").read_text(encoding="utf-8"))["lines"]

    duck = np.zeros(n)
    for ln in timeline:
        duck[int(max(0, ln["start"] - 0.1) * SR):int((ln["end"] + 0.25) * SR)] = 1.0
    k = int(0.3 * SR)
    duck = signal.fftconvolve(duck, np.hanning(k) / np.hanning(k).sum(), mode="same")
    stems["sfx"] = stems["sfx"] * (1 - duck * (1 - undb(SFX_VOICE_DUCK_DB)))[:, None]

    total = sum(stems.values())
    gain = undb(TARGET_LUFS - integrated_lufs(total))
    for _ in range(6):                       # refine on the decoded MP3 sum
        for s in STEMS:
            write_mp3(ROOT / "assets" / "audio" / f"intro_{s}.mp3", soft_limit(stems[s] * gain))
        dec = sum(fit_length(read_audio(ROOT / "assets" / "audio" / f"intro_{s}.mp3"), n) for s in STEMS)
        lufs, tp = integrated_lufs(dec), true_peak_db(dec)
        if abs(lufs - TARGET_LUFS) < 0.15 and tp <= TP_LIMIT - 0.2:
            break
        gain *= undb(min(TARGET_LUFS - lufs, TP_LIMIT - 0.3 - tp))
    print(f"mix: {lufs:.2f} LUFS integrated, true peak {tp:.2f} dBTP (gain {20 * np.log10(gain):+.2f} dB)")
    report = {"integrated_lufs": round(lufs, 2), "true_peak_dbtp": round(tp, 2), "stems": {}}
    for s in STEMS:
        d = fit_length(read_audio(ROOT / "assets" / "audio" / f"intro_{s}.mp3"), n)
        report["stems"][s] = {"lufs": round(integrated_lufs(d), 2), "sample_peak_db": round(sample_peak_db(d), 2),
                              "true_peak_db": round(true_peak_db(d), 2),
                              "kb": round((ROOT / "assets" / "audio" / f"intro_{s}.mp3").stat().st_size / 1024)}
        print(f"  {s:6s} {report['stems'][s]}")
    (WORK / "mix_report.json").write_text(json.dumps(report, indent=1), encoding="utf-8")
    write_subtitles(edl, timeline)
    write_cues(edl, timeline)


if __name__ == "__main__":
    main()
