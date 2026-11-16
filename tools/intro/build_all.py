"""Regenerate every intro-film asset: python -I tools/intro/build_all.py [--voice-file take.wav]"""
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def step(script, *args):
    print(f"\n=== {script} {' '.join(args)}", flush=True)
    subprocess.run([sys.executable, "-I", str(HERE / script), *args], check=True)


if __name__ == "__main__":
    extra = sys.argv[1:]            # e.g. --voice-file take.wav
    step("build_video.py", "--only", "1,2,3,4,5,6,7,8,9,10")
    step("build_voice.py", *extra)
    step("build_music.py")
    step("build_sfx.py")
    step("build_mix.py")
    step("build_review.py")
