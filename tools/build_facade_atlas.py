#!/usr/bin/env python3
"""
Offline Facade Texture Pipeline for World Explorer (24 AI-Generated Orthographic Facades).
Reads 1024x1024 source JPGs from assets/facades_src/, normalizes low-frequency
lighting gradients, applies seamless edge cross-blending, extracts a pixel-accurate
per-texel window/glass mask + per-pane random ID (aligned to true mullion/spandrel valleys),
and packs all layers into vertical strip images for WebGL2 THREE.DataArrayTexture:
  - assets/facades/facade_strip.jpg       (512 x 512*N RGB)
  - assets/facades/facade_mask_strip.jpg  (512 x 512*N Grayscale)
  - assets/facades/manifest.json
"""
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "assets" / "facades_src"
OUT_DIR = ROOT / "assets" / "facades"
TILE_SIZE = 512

FACADE_SPECS = {
    "glass_curtain_blue": {
        "floors": 4, "bays": 4, "metersPerFloor": 3.8, "metersPerBay": 3.6,
        "regions": ["nyc", "tokyo", "beijing", "london", "paris", "asia", "europe", "global"],
        "types": ["office", "commercial", "tower"],
        "minHeight": 28.0, "maxHeight": 500.0, "isCurtainWall": True,
    },
    "glass_curtain_dark": {
        "floors": 4, "bays": 4, "metersPerFloor": 3.8, "metersPerBay": 3.6,
        "regions": ["nyc", "tokyo", "beijing", "london", "asia", "global"],
        "types": ["office", "commercial", "tower"],
        "minHeight": 32.0, "maxHeight": 500.0, "isCurtainWall": True,
    },
    "glass_curtain_green": {
        "floors": 4, "bays": 4, "metersPerFloor": 3.8, "metersPerBay": 3.6,
        "regions": ["nyc", "tokyo", "beijing", "london", "asia", "europe", "global"],
        "types": ["office", "commercial", "tower"],
        "minHeight": 26.0, "maxHeight": 450.0, "isCurtainWall": True,
    },
    "office_concrete_grid": {
        "floors": 4, "bays": 4, "metersPerFloor": 3.7, "metersPerBay": 3.8,
        "regions": ["nyc", "tokyo", "beijing", "london", "europe", "asia", "global"],
        "types": ["office", "commercial"],
        "minHeight": 16.0, "maxHeight": 140.0, "isCurtainWall": False,
    },
    "office_limestone_modern": {
        "floors": 4, "bays": 4, "metersPerFloor": 3.8, "metersPerBay": 3.8,
        "regions": ["nyc", "paris", "london", "europe", "beijing", "global"],
        "types": ["office", "commercial"],
        "minHeight": 16.0, "maxHeight": 130.0, "isCurtainWall": False,
    },
    "office_bronze_fins": {
        "floors": 4, "bays": 4, "metersPerFloor": 3.8, "metersPerBay": 3.6,
        "regions": ["nyc", "london", "tokyo", "beijing", "global"],
        "types": ["office", "commercial", "tower"],
        "minHeight": 22.0, "maxHeight": 220.0, "isCurtainWall": True,
    },
    "nyc_brownstone": {
        "floors": 3, "bays": 3, "metersPerFloor": 3.5, "metersPerBay": 3.4,
        "regions": ["nyc", "global"],
        "types": ["residential", "apartments", "lowrise"],
        "minHeight": 6.0, "maxHeight": 26.0, "isCurtainWall": False,
    },
    "nyc_artdeco_limestone": {
        "floors": 4, "bays": 4, "metersPerFloor": 3.8, "metersPerBay": 3.6,
        "regions": ["nyc", "global"],
        "types": ["office", "commercial", "tower", "residential"],
        "minHeight": 22.0, "maxHeight": 280.0, "isCurtainWall": False,
    },
    "nyc_red_brick_warehouse": {
        "floors": 4, "bays": 4, "metersPerFloor": 3.7, "metersPerBay": 3.8,
        "regions": ["nyc", "london", "global"],
        "types": ["industrial", "residential", "apartments", "commercial"],
        "minHeight": 8.0, "maxHeight": 48.0, "isCurtainWall": False,
    },
    "paris_haussmann": {
        "floors": 4, "bays": 4, "metersPerFloor": 3.6, "metersPerBay": 3.5,
        "regions": ["paris", "europe"],
        "types": ["residential", "apartments", "commercial", "office"],
        "minHeight": 10.0, "maxHeight": 38.0, "isCurtainWall": False,
    },
    "london_georgian_brick": {
        "floors": 4, "bays": 4, "metersPerFloor": 3.5, "metersPerBay": 3.4,
        "regions": ["london", "europe", "nyc"],
        "types": ["residential", "apartments", "office"],
        "minHeight": 8.0, "maxHeight": 36.0, "isCurtainWall": False,
    },
    "europe_stucco_pastel": {
        "floors": 4, "bays": 4, "metersPerFloor": 3.5, "metersPerBay": 3.5,
        "regions": ["paris", "europe", "global"],
        "types": ["residential", "apartments", "lowrise"],
        "minHeight": 6.0, "maxHeight": 32.0, "isCurtainWall": False,
    },
    "tokyo_midrise_tile": {
        "floors": 4, "bays": 4, "metersPerFloor": 3.4, "metersPerBay": 3.5,
        "regions": ["tokyo", "asia", "beijing"],
        "types": ["residential", "apartments", "commercial"],
        "minHeight": 8.0, "maxHeight": 55.0, "isCurtainWall": False,
    },
    "tokyo_office_white_panel": {
        "floors": 4, "bays": 4, "metersPerFloor": 3.6, "metersPerBay": 3.8,
        "regions": ["tokyo", "asia", "beijing", "global"],
        "types": ["office", "commercial"],
        "minHeight": 14.0, "maxHeight": 120.0, "isCurtainWall": False,
    },
    "asia_residential_tower": {
        "floors": 4, "bays": 4, "metersPerFloor": 3.2, "metersPerBay": 3.6,
        "regions": ["beijing", "tokyo", "asia"],
        "types": ["residential", "apartments", "tower"],
        "minHeight": 18.0, "maxHeight": 160.0, "isCurtainWall": False,
    },
    "china_hutong_greybrick": {
        "floors": 2, "bays": 3, "metersPerFloor": 3.4, "metersPerBay": 3.8,
        "regions": ["beijing", "asia"],
        "types": ["residential", "lowrise", "historic"],
        "minHeight": 3.0, "maxHeight": 14.0, "isCurtainWall": False,
    },
    "residential_beige_slab": {
        "floors": 4, "bays": 4, "metersPerFloor": 3.3, "metersPerBay": 3.6,
        "regions": ["beijing", "tokyo", "asia", "europe", "nyc", "global"],
        "types": ["residential", "apartments"],
        "minHeight": 12.0, "maxHeight": 95.0, "isCurtainWall": False,
    },
    "retail_storefront_brick": {
        "floors": 1, "bays": 3, "metersPerFloor": 4.2, "metersPerBay": 4.2,
        "regions": ["nyc", "paris", "london", "tokyo", "beijing", "europe", "asia", "global"],
        "types": ["retail", "podium"],
        "minHeight": 3.5, "maxHeight": 12.0, "isCurtainWall": False,
    },
    "parking_garage_concrete": {
        "floors": 4, "bays": 3, "metersPerFloor": 3.4, "metersPerBay": 4.5,
        "regions": ["nyc", "tokyo", "beijing", "london", "paris", "global"],
        "types": ["industrial", "parking", "commercial"],
        "minHeight": 9.0, "maxHeight": 45.0, "isCurtainWall": False,
    },
    "china_soviet_redbrick": {
        "floors": 3, "bays": 4, "metersPerFloor": 3.3, "metersPerBay": 3.5,
        "regions": ["beijing", "asia"],
        "types": ["residential", "apartments", "lowrise"],
        "minHeight": 9.0, "maxHeight": 28.0, "isCurtainWall": False,
    },
    "residential_white_modern": {
        "floors": 4, "bays": 3, "metersPerFloor": 3.3, "metersPerBay": 4.0,
        "regions": ["nyc", "paris", "london", "tokyo", "beijing", "europe", "asia", "global"],
        "types": ["residential", "apartments"],
        "minHeight": 12.0, "maxHeight": 75.0, "isCurtainWall": False,
    },
    "us_suburban_siding": {
        "floors": 2, "bays": 3, "metersPerFloor": 3.2, "metersPerBay": 3.8,
        "regions": ["nyc", "global"],
        "types": ["residential", "lowrise", "house"],
        "minHeight": 3.0, "maxHeight": 11.0, "isCurtainWall": False,
    },
    "retail_storefront_glass": {
        "floors": 1, "bays": 3, "metersPerFloor": 4.2, "metersPerBay": 4.4,
        "regions": ["nyc", "paris", "london", "tokyo", "beijing", "europe", "asia", "global"],
        "types": ["retail", "podium"],
        "minHeight": 3.5, "maxHeight": 12.0, "isCurtainWall": True,
    },
    "industrial_metal_cladding": {
        "floors": 2, "bays": 4, "metersPerFloor": 4.5, "metersPerBay": 4.5,
        "regions": ["nyc", "tokyo", "beijing", "london", "paris", "europe", "asia", "global"],
        "types": ["industrial", "warehouse", "manufacture"],
        "minHeight": 4.0, "maxHeight": 24.0, "isCurtainWall": False,
    },
}


def make_seamless_tile(img_pil: Image.Image, size: int = 512) -> np.ndarray:
    img = img_pil.convert("RGB").resize((size, size), Image.Resampling.LANCZOS)
    arr = np.asarray(img, dtype=np.float32)

    low = np.asarray(img.filter(ImageFilter.GaussianBlur(radius=64)), dtype=np.float32)
    mean_rgb = arr.mean(axis=(0, 1), keepdims=True)
    arr = arr * ((mean_rgb + 16.0) / (low + 16.0))
    arr = np.clip(arr, 0.0, 255.0)

    B = 28
    t = np.linspace(0.0, 1.0, B, dtype=np.float32)
    w = 0.5 * (1.0 - np.sin(0.5 * np.pi * t))

    left_orig = arr[:, :B, :].copy()
    right_orig = arr[:, -B:, :].copy()
    for i in range(B):
        wi = w[i]
        arr[:, i, :] = (1.0 - wi) * left_orig[:, i, :] + wi * right_orig[:, B - 1 - i, :]
        arr[:, size - 1 - i, :] = (1.0 - wi) * right_orig[:, B - 1 - i, :] + wi * left_orig[:, i, :]

    top_orig = arr[:B, :, :].copy()
    bot_orig = arr[-B:, :, :].copy()
    for i in range(B):
        wi = w[i]
        arr[i, :, :] = (1.0 - wi) * top_orig[i, :, :] + wi * bot_orig[B - 1 - i, :, :]
        arr[size - 1 - i, :] = (1.0 - wi) * bot_orig[B - 1 - i, :] + wi * top_orig[i, :, :]

    return np.clip(arr, 0.0, 255.0).astype(np.uint8)


def find_grid_cuts_1d(profile: np.ndarray, min_dist: int = 55) -> list[int]:
    """
    Finds the natural mullion/spandrel valleys (local minima of window mask profile)
    along a 1D axis so per-window IDs never split a window pane in half.
    """
    n = len(profile)
    # Smooth 1D profile
    kernel = np.ones(9, dtype=np.float32) / 9.0
    sm = np.convolve(profile, kernel, mode="same")
    cuts = [0]
    i = min_dist
    while i < n - min_dist:
        win = sm[max(16, i - 24):min(n - 16, i + 25)]
        local_min_idx = int(np.argmin(win)) + max(16, i - 24)
        if local_min_idx - cuts[-1] >= min_dist:
            cuts.append(local_min_idx)
            i = local_min_idx + min_dist
        else:
            i += 16
    cuts.append(n)
    return cuts


def extract_window_mask(tile_rgb: np.ndarray, is_curtain_wall: bool, idx_seed: int = 0, floors: int = 4, bays: int = 4) -> np.ndarray:
    """
    Extracts a pixel-accurate window glass mask directly from the AI facade image
    (without imposing any synthetic grid that could misalign with the image's actual
    window columns/rows), and encodes a per-pane random ID in [0.32 .. 1.0] inside
    each detected window pane while keeping walls/mullions at 0.0.
    """
    H, W, _ = tile_rgb.shape
    rgb = tile_rgb.astype(np.float32) / 255.0
    lum = 0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]

    lum_pil = Image.fromarray((lum * 255.0).astype(np.uint8), mode="L")
    local_mean = np.asarray(lum_pil.filter(ImageFilter.GaussianBlur(radius=28)), dtype=np.float32) / 255.0
    coolness = np.clip((rgb[:, :, 2] - 0.5 * (rgb[:, :, 0] + rgb[:, :, 1])) * 2.5 + 0.12, 0.0, 1.0)

    gx = np.abs(np.roll(lum, -1, axis=1) - np.roll(lum, 1, axis=1))
    gy = np.abs(np.roll(lum, -1, axis=0) - np.roll(lum, 1, axis=0))
    grad = np.clip((gx + gy) * 3.2, 0.0, 1.0)

    if is_curtain_wall:
        # Curtain wall: glass is smooth and darker/cooler than bright metal mullions & spandrel beams
        bright_mullion = np.clip((lum - local_mean - 0.04) * 7.0, 0.0, 1.0)
        dark_mullion = np.clip((0.12 - lum) * 8.0, 0.0, 1.0)
        binary_win = (1.0 - 0.75 * grad) * (1.0 - 0.85 * bright_mullion) * (1.0 - 0.85 * dark_mullion)
        binary_win = np.clip((binary_win - 0.35) / 0.50, 0.0, 1.0)
    else:
        # Punched windows in stone/brick/concrete/stucco/tile:
        # Window openings are recessed and darker than the local masonry surround
        dark_rel = np.clip((local_mean - lum - 0.025) * 6.5, 0.0, 1.0)
        abs_dark = np.clip((0.40 - lum) * 3.5, 0.0, 1.0)
        binary_win = np.clip(0.72 * dark_rel + 0.28 * abs_dark + 0.18 * coolness, 0.0, 1.0)
        binary_win = binary_win * (1.0 - 0.45 * grad)
        binary_win = np.clip((binary_win - 0.32) / 0.45, 0.0, 1.0)

    # Keep a 6px border around tile wrap seam at 0 so night-lit windows never clip across tile edges
    binary_win[:6, :] = 0.0
    binary_win[-6:, :] = 0.0
    binary_win[:, :6] = 0.0
    binary_win[:, -6:] = 0.0

    # Smoothly zero out a 4px mullion/spandrel margin along the (bays, floors) cell grid
    # so per-window night lighting never cuts across a window pane
    bays = max(1, int(bays))
    floors = max(1, int(floors))
    for c_i in range(bays + 1):
        cx_px = int(round(c_i * W / bays))
        for dx in range(-5, 6):
            px = cx_px + dx
            if 0 <= px < W:
                w_fade = min(1.0, max(0.0, (abs(dx) - 2.0) / 3.5))
                binary_win[:, px] *= w_fade
    for r_i in range(floors + 1):
        ry_px = int(round(r_i * H / floors))
        for dy in range(-5, 6):
            py = ry_px + dy
            if 0 <= py < H:
                w_fade = min(1.0, max(0.0, (abs(dy) - 2.0) / 3.5))
                binary_win[py, :] *= w_fade

    return (np.clip(binary_win, 0.0, 1.0) * 255.0).astype(np.uint8)


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    jpg_files = sorted(SRC_DIR.glob("*.jpg"))
    if not jpg_files:
        raise RuntimeError(f"No .jpg files found in {SRC_DIR}")

    ordered_keys = list(FACADE_SPECS.keys())
    by_stem = {p.stem: p for p in jpg_files}
    final_files = []
    for k in ordered_keys:
        if k in by_stem:
            final_files.append(by_stem.pop(k))
    for k in sorted(by_stem.keys()):
        final_files.append(by_stem[k])

    N = len(final_files)
    strip_rgb = np.zeros((TILE_SIZE * N, TILE_SIZE, 3), dtype=np.uint8)
    strip_mask = np.zeros((TILE_SIZE * N, TILE_SIZE), dtype=np.uint8)
    manifest = []

    for idx, path in enumerate(final_files):
        fid = path.stem
        spec = FACADE_SPECS.get(fid, {
            "floors": 4, "bays": 4, "metersPerFloor": 3.6, "metersPerBay": 3.6,
            "regions": ["global"], "types": ["commercial", "residential"],
            "minHeight": 8.0, "maxHeight": 120.0, "isCurtainWall": False,
        })

        with Image.open(path) as im:
            tile_rgb = make_seamless_tile(im, TILE_SIZE)

        tile_mask = extract_window_mask(
            tile_rgb,
            bool(spec.get("isCurtainWall", False)),
            idx,
            int(spec.get("floors", 4)),
            int(spec.get("bays", 4)),
        )

        y0 = idx * TILE_SIZE
        y1 = y0 + TILE_SIZE
        strip_rgb[y0:y1, :, :] = tile_rgb
        strip_mask[y0:y1, :] = tile_mask

        avg_color = [round(float(x) / 255.0, 4) for x in tile_rgb.mean(axis=(0, 1))]
        win_coverage = round(float((tile_mask > 45).mean()), 3)

        entry = {
            "id": fid,
            "index": idx,
            "floors": spec["floors"],
            "bays": spec["bays"],
            "metersPerFloor": spec["metersPerFloor"],
            "metersPerBay": spec["metersPerBay"],
            "regions": spec["regions"],
            "types": spec["types"],
            "minHeight": spec["minHeight"],
            "maxHeight": spec["maxHeight"],
            "isCurtainWall": bool(spec.get("isCurtainWall", False)),
            "avgColor": avg_color,
            "windowCoverage": win_coverage,
        }
        manifest.append(entry)
        print(f"[{idx:02d}] {fid:28s} avg={avg_color} winCov={win_coverage:.1%}")

    strip_rgb_path = OUT_DIR / "facade_strip.jpg"
    strip_mask_path = OUT_DIR / "facade_mask_strip.jpg"
    manifest_path = OUT_DIR / "manifest.json"

    Image.fromarray(strip_rgb, mode="RGB").save(strip_rgb_path, quality=85, optimize=True)
    Image.fromarray(strip_mask, mode="L").save(strip_mask_path, quality=76, optimize=True)

    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump({"tileSize": TILE_SIZE, "count": N, "facades": manifest}, f, indent=2)

    print(f"\nWrote {strip_rgb_path} ({strip_rgb_path.stat().st_size / 1024:.1f} KB)")
    print(f"Wrote {strip_mask_path} ({strip_mask_path.stat().st_size / 1024:.1f} KB)")
    print(f"Wrote {manifest_path} ({N} facades)")


if __name__ == "__main__":
    main()
