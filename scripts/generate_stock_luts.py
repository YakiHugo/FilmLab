#!/usr/bin/env python3
"""
Generate built-in stock-style HaldCLUT PNG files (level 8) for FilmLab.

Output: public/luts/stocks/*.png
"""

from __future__ import annotations

import math
import pathlib
import struct
import zlib
from typing import Callable, Dict, Tuple

Rgb = Tuple[float, float, float]


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def srgb_to_linear(channel: float) -> float:
    c = clamp(channel)
    if c <= 0.04045:
        return c / 12.92
    return ((c + 0.055) / 1.055) ** 2.4


def linear_to_srgb(channel: float) -> float:
    c = clamp(channel)
    if c <= 0.0031308:
        return c * 12.92
    return 1.055 * (c ** (1.0 / 2.4)) - 0.055


def rgb_to_luma(linear_rgb: Rgb) -> float:
    r, g, b = linear_rgb
    return r * 0.2126 + g * 0.7152 + b * 0.0722


def grade_color(
    rgb: Rgb,
    *,
    saturation: float = 1.0,
    contrast: float = 1.0,
    gamma: float = 1.0,
    lift: float = 0.0,
    gain: float = 1.0,
    warmth: float = 0.0,
    cool: float = 0.0,
    shadow_teal: float = 0.0,
) -> Rgb:
    lr, lg, lb = (srgb_to_linear(rgb[0]), srgb_to_linear(rgb[1]), srgb_to_linear(rgb[2]))
    lum = rgb_to_luma((lr, lg, lb))

    # White-balance style shifts.
    lr *= 1.0 + warmth * 0.12 - cool * 0.05
    lg *= 1.0 + warmth * 0.02 - cool * 0.01
    lb *= 1.0 - warmth * 0.10 + cool * 0.12

    # Add cyan/teal bias in shadows for tungsten-style stocks.
    shadow_weight = clamp(1.0 - lum * 1.8)
    lr -= shadow_teal * 0.03 * shadow_weight
    lg += shadow_teal * 0.01 * shadow_weight
    lb += shadow_teal * 0.04 * shadow_weight

    lum2 = rgb_to_luma((lr, lg, lb))
    lr = lum2 + (lr - lum2) * saturation
    lg = lum2 + (lg - lum2) * saturation
    lb = lum2 + (lb - lum2) * saturation

    pivot = 0.18
    lr = (lr - pivot) * contrast + pivot
    lg = (lg - pivot) * contrast + pivot
    lb = (lb - pivot) * contrast + pivot

    lr = (lr + lift) * gain
    lg = (lg + lift) * gain
    lb = (lb + lift) * gain

    if abs(gamma - 1.0) > 1e-6:
        lr = pow(max(lr, 0.0), gamma)
        lg = pow(max(lg, 0.0), gamma)
        lb = pow(max(lb, 0.0), gamma)

    return (
        clamp(linear_to_srgb(clamp(lr))),
        clamp(linear_to_srgb(clamp(lg))),
        clamp(linear_to_srgb(clamp(lb))),
    )


def grade_bw(
    rgb: Rgb,
    *,
    weights: Rgb,
    contrast: float,
    gamma: float,
    warm_tone: float = 0.0,
) -> Rgb:
    lr, lg, lb = (srgb_to_linear(rgb[0]), srgb_to_linear(rgb[1]), srgb_to_linear(rgb[2]))
    lum = clamp(lr * weights[0] + lg * weights[1] + lb * weights[2])
    lum = clamp((lum - 0.18) * contrast + 0.18)
    lum = pow(max(lum, 0.0), gamma)

    # Optional mild selenium/warm paper tone.
    r = clamp(linear_to_srgb(clamp(lum * (1.0 + warm_tone * 0.025))))
    g = clamp(linear_to_srgb(clamp(lum * (1.0 + warm_tone * 0.008))))
    b = clamp(linear_to_srgb(clamp(lum * (1.0 - warm_tone * 0.02))))
    return (r, g, b)


def transform_portra_400(rgb: Rgb) -> Rgb:
    return grade_color(
        rgb,
        saturation=0.93,
        contrast=0.95,
        gamma=0.98,
        lift=0.010,
        gain=1.0,
        warmth=0.22,
    )


def transform_ektar_100(rgb: Rgb) -> Rgb:
    return grade_color(
        rgb,
        saturation=1.26,
        contrast=1.12,
        gamma=1.02,
        lift=0.0,
        gain=1.01,
        warmth=0.10,
    )


def transform_gold_200(rgb: Rgb) -> Rgb:
    return grade_color(
        rgb,
        saturation=1.05,
        contrast=0.98,
        gamma=0.99,
        lift=0.014,
        gain=1.0,
        warmth=0.28,
    )


def transform_cinestill_800t(rgb: Rgb) -> Rgb:
    # Cyan shadows + warm highlights.
    r, g, b = grade_color(
        rgb,
        saturation=1.08,
        contrast=1.05,
        gamma=1.01,
        lift=0.006,
        gain=1.0,
        cool=0.24,
        shadow_teal=0.55,
    )
    y = (r + g + b) / 3.0
    highlight = clamp((y - 0.55) * 2.0)
    r = clamp(r + highlight * 0.020)
    g = clamp(g + highlight * 0.004)
    b = clamp(b - highlight * 0.016)
    return (r, g, b)


def transform_provia_100f(rgb: Rgb) -> Rgb:
    return grade_color(
        rgb,
        saturation=1.05,
        contrast=1.08,
        gamma=1.01,
        lift=0.0,
        gain=1.0,
        cool=0.05,
    )


def transform_velvia_50(rgb: Rgb) -> Rgb:
    return grade_color(
        rgb,
        saturation=1.36,
        contrast=1.18,
        gamma=1.04,
        lift=-0.004,
        gain=1.02,
        cool=0.02,
    )


def transform_trix_400(rgb: Rgb) -> Rgb:
    return grade_bw(
        rgb,
        weights=(0.32, 0.56, 0.12),
        contrast=1.20,
        gamma=1.02,
        warm_tone=0.06,
    )


def transform_hp5_plus(rgb: Rgb) -> Rgb:
    return grade_bw(
        rgb,
        weights=(0.28, 0.62, 0.10),
        contrast=1.08,
        gamma=0.99,
        warm_tone=0.02,
    )


TRANSFORMS: Dict[str, Callable[[Rgb], Rgb]] = {
    "portra400.png": transform_portra_400,
    "ektar100.png": transform_ektar_100,
    "gold200.png": transform_gold_200,
    "cinestill800t.png": transform_cinestill_800t,
    "provia100f.png": transform_provia_100f,
    "velvia50.png": transform_velvia_50,
    "trix400.png": transform_trix_400,
    "hp5plus.png": transform_hp5_plus,
}


def write_png_rgba(path: pathlib.Path, width: int, height: int, rgba: bytes) -> None:
    if len(rgba) != width * height * 4:
        raise ValueError("Invalid RGBA buffer size.")

    def chunk(tag: bytes, payload: bytes) -> bytes:
        crc = zlib.crc32(tag + payload) & 0xFFFFFFFF
        return struct.pack(">I", len(payload)) + tag + payload + struct.pack(">I", crc)

    scanlines = bytearray()
    stride = width * 4
    for y in range(height):
        scanlines.append(0)  # filter type 0
        start = y * stride
        scanlines.extend(rgba[start : start + stride])

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(scanlines), level=9)

    png = bytearray()
    png.extend(b"\x89PNG\r\n\x1a\n")
    png.extend(chunk(b"IHDR", ihdr))
    png.extend(chunk(b"IDAT", idat))
    png.extend(chunk(b"IEND", b""))
    path.write_bytes(bytes(png))


def generate_hald_lut(transform: Callable[[Rgb], Rgb], level: int = 8) -> bytes:
    size = level * level
    width = level * size
    height = width
    total_pixels = size * size * size
    out = bytearray(width * height * 4)
    denom = float(size - 1)

    for index in range(total_pixels):
        r_index = index % size
        g_index = (index // size) % size
        b_index = index // (size * size)

        source = (r_index / denom, g_index / denom, b_index / denom)
        r, g, b = transform(source)

        x = index % width
        y = index // width
        offset = (y * width + x) * 4
        out[offset + 0] = int(round(clamp(r) * 255))
        out[offset + 1] = int(round(clamp(g) * 255))
        out[offset + 2] = int(round(clamp(b) * 255))
        out[offset + 3] = 255

    return bytes(out)


def main() -> None:
    out_dir = pathlib.Path("public/luts/stocks")
    out_dir.mkdir(parents=True, exist_ok=True)
    for filename, transform in TRANSFORMS.items():
        rgba = generate_hald_lut(transform, level=8)
        write_png_rgba(out_dir / filename, 512, 512, rgba)
        print(f"Generated {out_dir / filename}")


if __name__ == "__main__":
    main()
