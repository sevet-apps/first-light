"""Regenerate the intro film (picture + narration).

    python -I tools/intro/build_all.py [--voice-file take.wav] [--music-file track.wav [--music-offset S]]

Without --music-file there is no music stem.
"""
import argparse
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def step(script, *args):
    print(f"\n=== {script} {' '.join(args)}", flush=True)
    subprocess.run([sys.executable, "-I", str(HERE / script), *args], check=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice-file")
    ap.add_argument("--split-times")
    ap.add_argument("--music-file")
    ap.add_argument("--music-offset", default="0")
    a = ap.parse_args()
    voice_args = (["--voice-file", a.voice_file] if a.voice_file else []) + (["--split-times", a.split_times] if a.split_times else [])
    music_args = ["--music-file", a.music_file, "--music-offset", a.music_offset] if a.music_file else []
    step("build_video.py")
    step("build_voice.py", *voice_args)
    step("build_mix.py", *music_args)
    step("build_review.py")
