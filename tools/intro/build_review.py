"""Review artefacts in _review/ (git-ignored): preview mp4, contact sheet, waveforms, spectrograms, ebur128."""
import io
import subprocess
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from PIL import Image, ImageDraw
from scipy import signal

sys.path.insert(0, str(Path(__file__).resolve().parent))  # -I drops the script dir
from common import REVIEW, ROOT, SR, load_edl, read_audio, run

V = ROOT / "assets" / "video" / "intro.mp4"
A = {s: ROOT / "assets" / "audio" / f"intro_{s}.mp3" for s in ("voice", "music", "sfx")}


def preview():
    run(["ffmpeg", "-v", "error", "-y", "-i", V, *sum((["-i", a] for a in A.values()), []),
         "-filter_complex", "[1:a][2:a][3:a]amix=inputs=3:normalize=0:duration=longest[a]",
         "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", REVIEW / "intro_preview.mp4"])
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", REVIEW / "intro_preview.mp4", "-af", "ebur128=peak=true",
                        "-f", "null", "-"], capture_output=True, text=True)
    tail = r.stderr[r.stderr.rfind("Summary:"):]
    (REVIEW / "ebur128_report.txt").write_text(tail, encoding="utf-8")
    print(tail)


def contact_sheet(edl):
    cols, tw = 6, 320
    th = tw * 9 // 16
    n = int(edl["duration"])
    cut = {round(b["cut"]): b["n"] for b in edl["beats"]}
    sheet = Image.new("RGB", (cols * tw, ((n + cols - 1) // cols) * th))
    for t in range(n):
        p = run(["ffmpeg", "-v", "error", "-ss", t + 0.5, "-i", V, "-frames:v", 1, "-vf", f"scale={tw}:{th}",
                 "-f", "image2pipe", "-vcodec", "bmp", "-"])
        im = Image.open(io.BytesIO(p.stdout)).convert("RGB")
        ImageDraw.Draw(im).text((4, 2), f"{t + 0.5:.1f}s", fill=(255, 255, 0))
        sheet.paste(im, ((t % cols) * tw, (t // cols) * th))
    sheet.save(REVIEW / "contact_sheet.png")


def stem_plots():
    for name, f in A.items():
        x = read_audio(f).mean(axis=1)
        t = np.arange(len(x)) / SR
        fig, ax = plt.subplots(2, 1, figsize=(14, 6), sharex=True)
        ax[0].plot(t, x, lw=0.4)
        ax[0].set_ylim(-1, 1)
        ax[0].set_title(f"{name}: waveform")
        f_, tt, S = signal.spectrogram(x, SR, nperseg=2048, noverlap=1536)
        ax[1].pcolormesh(tt, f_, 10 * np.log10(S + 1e-12), vmin=-110, vmax=-30, shading="auto")
        ax[1].set_ylim(0, 12000)
        ax[1].set_title("spectrogram (dB)")
        ax[1].set_xlabel("s")
        fig.tight_layout()
        fig.savefig(REVIEW / f"stem_{name}.png", dpi=80)
        plt.close(fig)


if __name__ == "__main__":
    REVIEW.mkdir(exist_ok=True)
    preview()
    contact_sheet(load_edl())
    stem_plots()
