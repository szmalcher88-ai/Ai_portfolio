"""Cut the HR System happy path (docs/media/happy-path.mp4, 4:36) into a ~1.5 min reel.

Usage (modern ffmpeg on PATH, see ../README):
    python media/make-hr-reel.py <path to happy-path.mp4> <output dir>

Each chapter keeps only the part where something happens (no title cards, no logo
transitions), plays at 2x and dissolves into the next one. The script prints the
chapter start times of the reel; they go into src/demos.js (HR_CHAPTERS).
"""
import json
import subprocess
import sys
from pathlib import Path

SPEED = 2.0
FADE = 0.35
FPS = 25

# (start, end) in seconds of the source recording, chapter titles as in docs/media/media.json
SEGMENTS = [
    (9.3, 25.0, "Pulpit i tablica pracowników"),
    (31.7, 49.6, "Synchronizacja z Dyskiem Google"),
    (65.2, 87.0, "Profil pracownika i PDF"),
    (96.5, 116.5, "Lista „Do sprawdzenia”"),
    (122.0, 146.0, "Zgłoszenia i ocena AI"),
    (162.2, 183.0, "Umawianie spotkania"),
    (188.3, 213.0, "Kandydat ręcznie i duplikaty"),
    (229.4, 240.3, "Tabela „Po spotkaniu”"),
    (245.6, 268.5, "Ustawienia i role"),
]


def main() -> None:
    src, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / "hr-happy-path.mp4"

    parts, durations = [], []
    for i, (a, b, _) in enumerate(SEGMENTS):
        parts.append(
            f"[0:v]trim=start={a}:end={b},setpts=(PTS-STARTPTS)/{SPEED},fps={FPS},"
            f"scale=1280:800:flags=lanczos,format=yuv420p,settb=AVTB[s{i}]"
        )
        durations.append((b - a) / SPEED)

    chain, prev, offset, starts = [], "s0", 0.0, [0.0]
    for i in range(1, len(SEGMENTS)):
        offset += durations[i - 1] - FADE
        starts.append(offset)
        label = f"x{i}"
        chain.append(f"[{prev}][s{i}]xfade=transition=fade:duration={FADE}:offset={offset:.3f}[{label}]")
        prev = label
    graph = ";".join(parts + chain)

    subprocess.run(
        [
            "ffmpeg", "-v", "error", "-y", "-i", str(src),
            "-filter_complex", graph, "-map", f"[{prev}]", "-an",
            "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-profile:v", "high",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out),
        ],
        check=True,
    )
    total = offset + durations[-1]
    chapters = [{"t": round(s + (FADE / 2 if i else 0), 2), "title": seg[2]} for i, (s, seg) in enumerate(zip(starts, SEGMENTS))]
    print(json.dumps({"duration": round(total, 2), "chapters": chapters}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
