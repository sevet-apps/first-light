"""Cut the intro film from the real NASA/ESA footage according to edl.json.

    python -I tools/intro/build_video.py [--only 3,4] [--out assets/video/intro.mp4]

Pass 1 renders every shot (trim, speed, animated 2.39:1 reframe, per-shot correction) to a
lossless 10-bit intermediate in _review/work/shots/. Pass 2 composites them on black with
dissolves and dips, applies ONE common grade + grain, letterboxes and encodes H.264.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # -I drops the script dir
from common import ROOT, WORK, load_edl, run

SHOTS = WORK / "shots"
SS = 2  # reframe at 2x the scope size, then downsample (hides sub-pixel crop jitter)


def probe_size(path):
    r = run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
             "-of", "csv=p=0", path])
    w, h = r.stdout.decode().strip().split(",")
    return int(w), int(h)


def plan(edl):
    """Resolve absolute shot timing: output start, duration and dissolve overlaps."""
    fps = edl["fps"]
    q = lambda t: round(t * fps) / fps
    shots = []
    for bi, beat in enumerate(edl["beats"]):
        nxt = edl["beats"][bi + 1] if bi + 1 < len(edl["beats"]) else None
        end = q(nxt["cut"]) if nxt else q(edl["duration"])
        for si, s in enumerate(beat["shots"]):
            start = q(beat["cut"]) if si == 0 else q(s["at"])
            if bi == 0 and si == 0:
                start = 0.0
            dis_in = s.get("dissolve", 0.0)
            dis_out = nxt["shots"][0].get("dissolve", 0.0) if nxt and si == len(beat["shots"]) - 1 else 0.0
            shots.append({"beat": beat["n"], "idx": si, "spec": s, "start": start - dis_in / 2,
                          "dur": end - start + dis_in / 2 + dis_out / 2})
    return shots


def ease(expr_t, d):
    u = f"clip({expr_t}/{d:.4f},0,1)"
    return f"({u}*{u}*(3-2*{u}))"


def reframe_filter(spec, dur, src_wh, scope):
    """Animated crop (centre + width as fractions of the source) at SS x scope size."""
    sw, sh = src_wh
    ow, oh = scope[0] * SS, scope[1] * SS
    c = spec["crop"]
    f, t = c["from"], c.get("to", c["from"])
    p = ease("t", dur)
    lerp = lambda a, b: f"({a}+({b}-{a})*{p})"
    cx, cy, cw = (lerp(f[i], t[i]) for i in range(3))
    shake = spec.get("shake", 0)
    dx = f"+{shake}*(sin(t*31.7)+0.6*sin(t*17.3+1))" if shake else ""
    dy = f"+{shake}*0.7*(sin(t*27.1+2)+0.5*sin(t*13.9))" if shake else ""
    return (f"scale=w='2*trunc({ow}/{cw}/2)':h='2*trunc({ow}*{sh}/{sw}/{cw}/2)':eval=frame:flags=lanczos,"
            f"crop=w={ow}:h={oh}:x='clip({cx}*iw-{ow / 2}{dx},0,iw-{ow})':y='clip({cy}*ih-{oh / 2}{dy},0,ih-{oh})'")


def render_shot(edl, sh):
    spec = sh["spec"]
    src = edl["sources"][spec["src"]]
    speed = spec.get("speed", 1.0)
    fps = edl["fps"]
    scope = edl["scope"]
    out = SHOTS / f"b{sh['beat']:02d}_{sh['idx']}.mkv"
    src_dur = sh["dur"] * speed + 0.25
    chain = [f"setpts=PTS/{speed}"]
    chain.append(f"framerate=fps={fps}" if speed < 0.97 else f"fps={fps}")
    if spec.get("pre"):
        chain.append(spec["pre"])
    chain.append("format=yuv444p10le")
    chain.append(reframe_filter(spec, sh["dur"], probe_size(src), scope))
    chain.append(f"scale={scope[0]}:{scope[1]}:flags=lanczos+accurate_rnd")
    g = spec.get("grade", {})
    eq = []
    if "gamma" in g:
        eq.append(f"gamma={g['gamma']}")
    if "brightness" in g:
        eq.append(f"brightness={g['brightness']}")
    if "contrast" in g:
        eq.append(f"contrast={g['contrast']}")
    if "sat" in g:
        eq.append(f"saturation={g['sat']}")
    if eq:
        chain.append("eq=" + ":".join(eq))
    if g.get("curves"):
        chain.append(f"curves=all='{g['curves']}'")
    if spec.get("denoise"):
        chain.append(f"hqdn3d={spec['denoise']}")
    if spec.get("sharpen"):
        chain.append(f"unsharp=5:5:{spec['sharpen']}:5:5:0")
    chain.append(f"trim=duration={sh['dur']:.4f},setpts=PTS-STARTPTS")
    SHOTS.mkdir(parents=True, exist_ok=True)
    run(["ffmpeg", "-v", "error", "-y", "-ss", spec["in"], "-t", f"{src_dur:.3f}", "-i", src, "-an",
         "-vf", ",".join(chain), "-r", fps, "-c:v", "ffv1", "-pix_fmt", "yuv444p10le", out])
    return out


def grade_chain(edl):
    gr = edl["grade"]
    return [
        # gentle S-curve, warm highlights / cool shadows, one look for every camera
        f"curves=all='{gr['curve']}'",
        f"colorbalance=rs={gr['shadows'][0]}:gs={gr['shadows'][1]}:bs={gr['shadows'][2]}"
        f":rm=0:gm=0:bm=0:rh={gr['highlights'][0]}:gh={gr['highlights'][1]}:bh={gr['highlights'][2]}",
        f"eq=saturation={gr['saturation']}",
        f"vignette=angle={gr['vignette']}:mode=backward:eval=init",
    ]


def composite(edl, shots, out):
    fps, dur = edl["fps"], edl["duration"]
    scope = edl["scope"]
    inputs, graph, last = [], [], "base"
    graph.append(f"color=c=black:s={scope[0]}x{scope[1]}:r={fps}:d={dur},format=yuva444p10le[base]")
    for i, sh in enumerate(shots):
        f = SHOTS / f"b{sh['beat']:02d}_{sh['idx']}.mkv"
        inputs += ["-i", f]
        s = sh["spec"]
        chain = f"[{i}:v]format=yuva444p10le,setpts=PTS-STARTPTS+{sh['start']:.4f}/TB"
        fade_in = s.get("fade_in", s.get("dissolve", 0))
        if fade_in:
            chain += f",fade=t=in:st={sh['start']:.4f}:d={fade_in}:alpha=1"
        chain += f"[s{i}]"
        graph.append(chain)
        graph.append(f"[{last}][s{i}]overlay=eof_action=pass:format=auto,format=yuva444p10le[o{i}]")
        last = f"o{i}"
    # black overlays: dip before the title and the slow final fade
    for j, fd in enumerate(edl["fades_to_black"]):
        t0, d, peak = fd["start"], fd["dur"], fd.get("peak", 1.0)
        end = t0 + d
        enable = f":enable='gte(t,{t0})'" if fd.get("hold") else f":enable='between(t,{t0},{end + 0.02})'"
        graph.append(f"color=c=black:s={scope[0]}x{scope[1]}:r={fps}:d={dur},format=yuva444p10le,"
                     f"fade=t=in:st={t0}:d={d}:alpha=1,colorchannelmixer=aa={peak}[k{j}]")
        graph.append(f"[{last}][k{j}]overlay=format=auto{enable},format=yuva444p10le[ok{j}]")
        last = f"ok{j}"
    gr = edl["grade"]
    tail = ",".join(["format=yuv444p10le"] + grade_chain(edl) +
                    [f"format=yuv420p,noise=alls={gr['grain']}:allf=t+u:all_seed=7",
                     f"pad={edl['size'][0]}:{edl['size'][1]}:0:{(edl['size'][1] - scope[1]) // 2}:black"])
    graph.append(f"[{last}]{tail}[v]")
    run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(graph), "-map", "[v]", "-an",
         "-t", dur, "-r", fps, "-c:v", "libx264", "-profile:v", "high", "-preset", "slow", "-crf", edl["crf"],
         "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-g", "60", out])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="re-render only these beats' shots (comma list); composite always runs")
    ap.add_argument("--out", default=str(ROOT / "assets" / "video" / "intro.mp4"))
    args = ap.parse_args()
    edl = load_edl()
    shots = plan(edl)
    only = {int(x) for x in args.only.split(",")} if args.only else None
    for sh in shots:
        f = SHOTS / f"b{sh['beat']:02d}_{sh['idx']}.mkv"
        if only is None or sh["beat"] in only or not f.exists():
            print(f"shot b{sh['beat']:02d}_{sh['idx']}: {sh['spec']['src']} @{sh['spec']['in']}s x{sh['spec'].get('speed', 1)}"
                  f"  out {sh['start']:.2f}+{sh['dur']:.2f}s", flush=True)
            render_shot(edl, sh)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    composite(edl, shots, args.out)
    print("video:", args.out, round(Path(args.out).stat().st_size / 1e6, 2), "MB")


if __name__ == "__main__":
    main()
