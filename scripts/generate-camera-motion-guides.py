#!/usr/bin/env python3
"""Generate the small, bundled motion-reference clips used by Camera Motion.

These are build-time assets, not a runtime dependency. The procedural scene
keeps each clip deterministic and makes optical flow/parallax easy for an
IC-LoRA to read while also giving the picker lightweight branded previews.
"""

from __future__ import annotations

import argparse
import math
import subprocess
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw


WIDTH = 960
HEIGHT = 512
FPS = 25
FRAMES = 377  # Covers the longest 15-second LTX sequence (8n+1).
BG = (3, 5, 8)
INK = (224, 229, 238)
MUTED = (72, 82, 101)
FAINT = (27, 33, 44)
RED = (239, 75, 83)


MOTIONS = (
    "pan-left", "pan-right", "tilt-up", "tilt-down",
    "dolly-in", "dolly-out", "truck-left", "truck-right",
    "pedestal-up", "pedestal-down", "roll-cw", "roll-ccw",
    "zoom-in", "zoom-out",
)


@dataclass(frozen=True)
class Camera:
    x: float = 0.0
    y: float = 3.0
    z: float = -3.0
    yaw: float = 0.0
    pitch: float = -0.025
    roll: float = 0.0
    fov: float = 58.0


def camera_for(motion: str, t: float) -> Camera:
    # Constant velocity makes the first few seconds useful when several clips
    # are concatenated into one shorter generation.
    u = max(0.0, min(1.0, t))
    if motion == "pan-left":
        return Camera(yaw=0.52 - 1.04 * u)
    if motion == "pan-right":
        return Camera(yaw=-0.52 + 1.04 * u)
    if motion == "tilt-up":
        return Camera(pitch=-0.30 + 0.54 * u)
    if motion == "tilt-down":
        return Camera(pitch=0.24 - 0.54 * u)
    if motion == "dolly-in":
        return Camera(z=-6.0 + 9.0 * u)
    if motion == "dolly-out":
        return Camera(z=3.0 - 9.0 * u)
    if motion == "truck-left":
        return Camera(x=4.5 - 9.0 * u)
    if motion == "truck-right":
        return Camera(x=-4.5 + 9.0 * u)
    if motion == "pedestal-up":
        return Camera(y=1.4 + 4.3 * u)
    if motion == "pedestal-down":
        return Camera(y=5.7 - 4.3 * u)
    if motion == "roll-cw":
        return Camera(roll=-0.56 + 1.12 * u)
    if motion == "roll-ccw":
        return Camera(roll=0.56 - 1.12 * u)
    if motion == "zoom-in":
        return Camera(fov=78.0 - 48.0 * u)
    if motion == "zoom-out":
        return Camera(fov=30.0 + 48.0 * u)
    return Camera()


def project(point: tuple[float, float, float], camera: Camera):
    rx = point[0] - camera.x
    ry = point[1] - camera.y
    rz = point[2] - camera.z

    cy = math.cos(camera.yaw)
    sy = math.sin(camera.yaw)
    x1 = cy * rx - sy * rz
    z1 = sy * rx + cy * rz

    cp = math.cos(camera.pitch)
    sp = math.sin(camera.pitch)
    y2 = cp * ry - sp * z1
    z2 = sp * ry + cp * z1

    cr = math.cos(camera.roll)
    sr = math.sin(camera.roll)
    x3 = cr * x1 + sr * y2
    y3 = -sr * x1 + cr * y2
    if z2 <= 0.32:
        return None

    focal = (WIDTH * 0.5) / math.tan(math.radians(camera.fov) * 0.5)
    return (WIDTH * 0.5 + x3 * focal / z2, HEIGHT * 0.49 - y3 * focal / z2, z2)


def line(draw: ImageDraw.ImageDraw, camera: Camera, a, b, color, width=1):
    pa = project(a, camera)
    pb = project(b, camera)
    if not pa or not pb:
        return
    margin = 1200
    if all((p[0] < -margin or p[0] > WIDTH + margin or p[1] < -margin or p[1] > HEIGHT + margin) for p in (pa, pb)):
        return
    draw.line((pa[0], pa[1], pb[0], pb[1]), fill=color, width=width)


def box_edges(center_x, base_y, center_z, sx, sy, sz):
    x0, x1 = center_x - sx / 2, center_x + sx / 2
    y0, y1 = base_y, base_y + sy
    z0, z1 = center_z - sz / 2, center_z + sz / 2
    p = [
        (x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
        (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1),
    ]
    edges = ((0, 1), (1, 2), (2, 3), (3, 0), (4, 5), (5, 6), (6, 7), (7, 4), (0, 4), (1, 5), (2, 6), (3, 7))
    return p, edges


TOWERS = (
    (-8.5, 0.0, 10.0, 2.3, 4.8, 2.4, MUTED),
    (-4.3, 0.0, 18.0, 3.3, 8.4, 3.6, INK),
    (-1.2, 0.0, 9.0, 2.2, 3.7, 2.0, MUTED),
    (2.5, 0.0, 13.5, 3.0, 6.3, 3.2, INK),
    (7.1, 0.0, 9.5, 2.4, 5.1, 2.4, MUTED),
    (9.8, 0.0, 20.0, 4.0, 10.0, 4.4, INK),
    (0.0, 0.0, 7.3, 1.8, 2.2, 1.8, RED),
)


def render_frame(motion: str, index: int) -> Image.Image:
    camera = camera_for(motion, index / max(1, FRAMES - 1))
    image = Image.new("RGB", (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(image)

    # Floor grid with near/far density gives pan, truck, pedestal, and dolly
    # references strong, unambiguous parallax.
    for x in range(-20, 21, 2):
        line(draw, camera, (x, 0, 2), (x, 0, 42), FAINT if x % 4 else MUTED)
    for z in range(4, 43, 2):
        line(draw, camera, (-22, 0, z), (22, 0, z), FAINT if z % 4 else MUTED)

    # A few elevated rails keep tilt/roll motion readable above the horizon.
    for y in (2.5, 6.5):
        line(draw, camera, (-18, y, 26), (18, y, 26), FAINT)
    for x in (-12, -6, 0, 6, 12):
        line(draw, camera, (x, 0, 26), (x, 8, 26), FAINT)

    for cx, by, cz, sx, sy, sz, color in sorted(TOWERS, key=lambda entry: entry[2], reverse=True):
        points, edges = box_edges(cx, by, cz, sx, sy, sz)
        projected = [project(p, camera) for p in points]
        # A restrained face fill creates stable regions for optical flow.
        face = [projected[i] for i in (3, 2, 6, 7)]
        if all(face):
            fill = (37, 17, 20) if color == RED else (11, 15, 22)
            draw.polygon([(p[0], p[1]) for p in face], fill=fill)
        for a, b in edges:
            line(draw, camera, points[a], points[b], color, 3 if color == RED else 2)

    # Subtle viewfinder marks are fixed to the image, making the moving world
    # feel like camera movement instead of object animation.
    corner = 18
    inset = 20
    for x, y, sx, sy in ((inset, inset, 1, 1), (WIDTH-inset, inset, -1, 1), (inset, HEIGHT-inset, 1, -1), (WIDTH-inset, HEIGHT-inset, -1, -1)):
        draw.line((x, y, x + sx * corner, y), fill=(93, 101, 117), width=2)
        draw.line((x, y, x, y + sy * corner), fill=(93, 101, 117), width=2)
    draw.ellipse((WIDTH/2-3, HEIGHT/2-3, WIDTH/2+3, HEIGHT/2+3), outline=RED, width=1)
    return image


def encode_motion(motion: str, output: Path, ffmpeg: str):
    output.parent.mkdir(parents=True, exist_ok=True)
    command = [
        ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{WIDTH}x{HEIGHT}",
        "-r", str(FPS), "-i", "-", "-an", "-c:v", "libx264",
        "-preset", "veryfast", "-crf", "29", "-pix_fmt", "yuv420p",
        "-movflags", "+faststart", str(output),
    ]
    process = subprocess.Popen(command, stdin=subprocess.PIPE)
    assert process.stdin is not None
    try:
        for frame in range(FRAMES):
            process.stdin.write(render_frame(motion, frame).tobytes())
    finally:
        process.stdin.close()
    if process.wait() != 0:
        raise RuntimeError(f"ffmpeg failed while encoding {motion}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="public/camera-motions")
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--only", choices=MOTIONS, action="append")
    args = parser.parse_args()
    output = Path(args.output)
    for motion in args.only or MOTIONS:
        target = output / f"{motion}.mp4"
        print(f"Generating {target}", flush=True)
        encode_motion(motion, target, args.ffmpeg)


if __name__ == "__main__":
    main()
