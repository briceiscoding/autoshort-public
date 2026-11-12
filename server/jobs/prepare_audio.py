"""Exact export audio, ported from montage_shorts_claude/engine/scripts/prepare_render.py.

- Voice: kept segments of the rush, contiguous ones merged, 5 ms edge fades, two-pass loudnorm to the theme target.
- Music: looped/trimmed, levelled under the voice, sidechain ducked on the voice, faded out.
- SFX: gain per file so the loudest 100 ms sits `sfxUnderVoiceDb` under the voice.
Writes data/render/{voice.wav, music.wav, audio.json}.
Usage: python prepare_audio.py <video_dir> <edl_json> <library_dir> <theme_json>
"""
import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np

from common import app_dir, guard_write, progress, run_ffmpeg, write_json

SAMPLE_RATE = 48000
SFX_MAX_GAIN_DB = 12.0
EDGE_FADE_S = 0.005
MUSIC_FADE_OUT_S = 0.5


def build_voice(rush: Path, segments: list[dict], work: Path, output: Path, lufs: float, tp: float, lra: float) -> dict:
    spans: list[dict] = []
    for s in segments:
        if spans and abs(spans[-1]["srcEnd"] - s["srcStart"]) < 0.001:
            spans[-1]["srcEnd"] = s["srcEnd"]
        else:
            spans.append({"srcStart": s["srcStart"], "srcEnd": s["srcEnd"]})
    chains, labels = [], []
    for i, s in enumerate(spans):
        duration = s["srcEnd"] - s["srcStart"]
        chains.append(
            f"[0:a:0]atrim=start={s['srcStart']}:end={s['srcEnd']},asetpts=PTS-STARTPTS,"
            f"afade=t=in:d={EDGE_FADE_S},afade=t=out:st={duration - EDGE_FADE_S}:d={EDGE_FADE_S}[s{i}]")
        labels.append(f"[s{i}]")
    graph = ";".join(chains) + ";" + "".join(labels) + f"concat=n={len(spans)}:v=0:a=1[out]"
    raw = work / "voice_raw.wav"
    run_ffmpeg(["-i", str(rush), "-filter_complex", graph, "-map", "[out]", "-ar", str(SAMPLE_RATE), str(raw)])
    target = f"I={lufs}:TP={tp}:LRA={lra}"
    log = run_ffmpeg(["-i", str(raw), "-af", f"loudnorm={target}:print_format=json", "-f", "null", "-"])
    measured = json.loads(re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", log, re.S).group(0))
    second = (f"loudnorm={target}:linear=true:print_format=json:measured_I={measured['input_i']}"
              f":measured_TP={measured['input_tp']}:measured_LRA={measured['input_lra']}"
              f":measured_thresh={measured['input_thresh']}:offset={measured['target_offset']}")
    log = run_ffmpeg(["-i", str(raw), "-af", second, "-ar", str(SAMPLE_RATE), "-ac", "2", str(output)])
    return json.loads(re.search(r"\{[^{}]*\"output_i\"[^{}]*\}", log, re.S).group(0))


def sfx_gain(path: Path, voice_lufs: float, under_db: float) -> float:
    pcm = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path), "-ac", "1", "-ar", str(SAMPLE_RATE),
                          "-f", "s16le", "-"], check=True, capture_output=True).stdout
    samples = np.frombuffer(pcm, np.int16).astype(np.float32) / 32768.0
    window = max(1, int(0.1 * SAMPLE_RATE))
    power = np.convolve(samples ** 2, np.ones(window) / window, mode="valid") if len(samples) > window else samples ** 2
    level_db = 10 * np.log10(float(power.max()) + 1e-12)
    return round(float(10 ** (min(voice_lufs - under_db - level_db, SFX_MAX_GAIN_DB) / 20)), 3)


def build_music(source: Path, voice: Path, duration: float, under_db: float, voice_lufs: float, output: Path) -> float:
    target = voice_lufs - under_db
    log = run_ffmpeg(["-stream_loop", "-1", "-i", str(source), "-t", str(duration), "-af", "loudnorm=print_format=json", "-f", "null", "-"])
    measured = float(json.loads(log[log.rindex("{"):log.rindex("}") + 1])["input_i"])
    gain = target - measured
    fade_start = max(0.0, duration - MUSIC_FADE_OUT_S)
    run_ffmpeg([
        "-stream_loop", "-1", "-i", str(source), "-i", str(voice), "-filter_complex",
        f"[0:a]atrim=0:{duration},asetpts=N/SR/TB,aresample={SAMPLE_RATE},aformat=channel_layouts=stereo,volume={gain:.2f}dB[m];"
        f"[1:a]aresample={SAMPLE_RATE},aformat=channel_layouts=stereo,asplit=1[sc];"
        f"[m][sc]sidechaincompress=threshold=0.1:ratio=2:attack=30:release=500:makeup=1[d];"
        f"[d]afade=t=in:d=0.05,afade=t=out:st={fade_start:.3f}:d={MUSIC_FADE_OUT_S}[out]",
        "-map", "[out]", "-c:a", "pcm_s16le", str(output)])
    return target


def main() -> None:
    video, edl_file, library, theme_file = (Path(a) for a in sys.argv[1:5])
    edl = json.loads(edl_file.read_text(encoding="utf-8"))
    theme = json.loads(theme_file.read_text(encoding="utf-8"))
    audio = theme["audio"]
    render = app_dir(video) / "render"
    render.mkdir(exist_ok=True)
    for name in ("voice.wav", "music.wav", "audio.json"):
        guard_write(video, render / name)

    progress(0.05, "voice")
    report = build_voice(video / edl["source"], edl["segments"], render, render / "voice.wav",
                         audio["voiceLufs"], audio["truePeak"], audio["lra"])
    print("voice:", {k: report[k] for k in ("input_i", "input_tp", "output_i", "output_tp", "normalization_type")})

    progress(0.6, "sfx gains")
    gains = {name: sfx_gain(library / "sfx" / name, audio["voiceLufs"], audio["sfxUnderVoiceDb"])
             for name in sorted({s["file"] for s in edl["sfx"]})}
    print("sfx gains:", gains)

    music = None
    if edl.get("music"):
        progress(0.75, "music")
        level = build_music(video / edl["music"]["file"], render / "voice.wav", edl["durationAfter"],
                            edl["music"].get("underVoiceDb", audio["musicUnderVoiceDb"]), audio["voiceLufs"], render / "music.wav")
        print("music level before ducking (LUFS):", level)
        music = "data/render/music.wav"
    write_json(render / "audio.json", {"voice": "data/render/voice.wav", "music": music, "sfxGains": gains,
                                       "voiceReport": {k: report[k] for k in ("output_i", "output_tp")}})
    progress(1, "audio ready")


if __name__ == "__main__":
    main()
