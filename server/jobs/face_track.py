"""Face bounding box track of a rush, sampled every 0.5 s (OpenCV Haar cascade, CPU, no download).

Boxes are in source pixels [x, y, w, h]; the largest face of each sample is kept, then smoothed.
Usage: python face_track.py <rush> <output_json> [--interval 0.5]
"""
import argparse
import json
from pathlib import Path

import cv2

from common import progress


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("rush", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--interval", type=float, default=0.5)
    args = parser.parse_args()

    detector = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    capture = cv2.VideoCapture(str(args.rush))
    fps = capture.get(cv2.CAP_PROP_FPS) or 30
    frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    step = max(1, round(fps * args.interval))
    samples = []
    index = 0
    while index < frames:
        # Sequential grab is much faster than seeking on long GOP H.264.
        ok, frame = capture.read()
        if not ok:
            break
        if index % step == 0:
            scale = 480 / frame.shape[0]
            small = cv2.resize(frame, None, fx=scale, fy=scale)
            gray = cv2.equalizeHist(cv2.cvtColor(small, cv2.COLOR_BGR2GRAY))
            faces = detector.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=6, minSize=(40, 40))
            box = None
            if len(faces):
                x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
                box = [round(float(v) / scale, 1) for v in (x, y, w, h)]
            samples.append({"t": round(index / fps, 3), "box": box})
            progress(index / max(frames, 1), "face track")
        index += 1
    capture.release()

    # Fill short detection holes with the previous box, then smooth with a 3-tap median.
    last = None
    for s in samples:
        if s["box"] is None and last is not None:
            s["box"] = last
        last = s["box"] or last
    for i in range(1, len(samples) - 1):
        boxes = [samples[j]["box"] for j in (i - 1, i, i + 1)]
        if all(boxes):
            samples[i]["box"] = [sorted(b[k] for b in boxes)[1] for k in range(4)]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({"interval": args.interval, "samples": samples}), encoding="utf-8")
    found = sum(1 for s in samples if s["box"])
    print(f"{found}/{len(samples)} samples with a face -> {args.output}")


if __name__ == "__main__":
    main()
