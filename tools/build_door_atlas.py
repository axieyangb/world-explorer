#!/usr/bin/env python3
"""
Offline Door Texture Pipeline for World Explorer (12 AI-Generated Orthographic Entrances).
Reads 1024x1024 source JPGs from assets/doors_src/, crops tightly around each architectural
entrance so bottom (v=0) is exact threshold/ground level, computes a dual-range alpha mask:
  - alpha in [0.00, 0.32]: outer surround wall margin feather (blends into host facade color)
  - alpha == 0.40:         solid door structure (wood, bronze, pilasters, canopy, stoop)
  - alpha in [0.55, 1.00]: glass panes, transoms, sidelights, and canopy downlights (PBR glass + night glow)
Outputs:
  - assets/doors/door_strip.jpg       (512 x 6144 RGB)
  - assets/doors/door_mask_strip.jpg  (512 x 6144 Grayscale)
  - assets/doors/manifest.json
"""
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "assets" / "doors_src"
OUT_DIR = ROOT / "assets" / "doors"
TILE_SIZE = 512

# Ordered catalog of 12 architectural entrances
# crop: (x0, y0, x1, y1) in 1024x1024 source pixels (y=0 top, y=1024 bottom)
# glass_boxes: list of (u0, v0, u1, v1) in cropped tile coords where v=0 is bottom, v=1 is top
# frame_box: (u0, v0, u1, v1) of the core architectural door frame/pilasters/canopy (v=0 bottom, v=1 top)
DOOR_SPECS = [
    {
        "id": "door_office_lobby_glass",
        "index": 0,
        "crop": (84, 72, 940, 1004),
        "width": 4.2,
        "height": 4.0,
        "frame_box": (0.09, 0.0, 0.91, 0.92),
        "glass_boxes": [(0.11, 0.02, 0.89, 0.72)],
        "glow_intensity": 1.0,
        "has_canopy": True,
    },
    {
        "id": "door_hotel_canopy",
        "index": 1,
        "crop": (112, 96, 912, 995),
        "width": 4.2,
        "height": 4.0,
        "frame_box": (0.09, 0.0, 0.91, 0.91),
        "glass_boxes": [(0.17, 0.04, 0.83, 0.65), (0.20, 0.69, 0.80, 0.80)],
        "glow_intensity": 1.15,
        "has_canopy": True,
    },
    {
        "id": "door_apartment_modern",
        "index": 2,
        "crop": (152, 92, 872, 964),
        "width": 3.1,
        "height": 3.2,
        "frame_box": (0.10, 0.0, 0.90, 0.90),
        "glass_boxes": [(0.13, 0.03, 0.77, 0.80)],
        "glow_intensity": 0.75,
        "has_canopy": True,
    },
    {
        "id": "door_nyc_brownstone_stoop",
        "index": 3,
        "crop": (210, 12, 814, 722),
        "width": 2.9,
        "height": 3.2,
        "frame_box": (0.12, 0.0, 0.88, 0.94),
        "glass_boxes": [(0.27, 0.56, 0.73, 0.76)],
        "glow_intensity": 0.65,
        "has_stoop": True,
    },
    {
        "id": "door_paris_porte_cochere",
        "index": 4,
        "crop": (148, 20, 876, 932),
        "width": 3.5,
        "height": 4.0,
        "frame_box": (0.10, 0.0, 0.90, 0.94),
        "glass_boxes": [(0.24, 0.56, 0.76, 0.82), (0.84, 0.76, 0.95, 0.90)],
        "glow_intensity": 0.70,
        "has_canopy": False,
    },
    {
        "id": "door_london_georgian",
        "index": 5,
        "crop": (192, 32, 832, 976),
        "width": 2.8,
        "height": 3.5,
        "frame_box": (0.11, 0.0, 0.89, 0.94),
        "glass_boxes": [(0.27, 0.56, 0.73, 0.74)],
        "glow_intensity": 0.65,
        "has_canopy": False,
    },
    {
        "id": "door_tokyo_apartment",
        "index": 6,
        "crop": (116, 175, 908, 982),
        "width": 3.4,
        "height": 3.2,
        "frame_box": (0.09, 0.0, 0.91, 0.91),
        "glass_boxes": [(0.12, 0.03, 0.84, 0.78)],
        "glow_intensity": 0.85,
        "has_canopy": True,
    },
    {
        "id": "door_beijing_hutong_gate",
        "index": 7,
        "crop": (126, 48, 898, 988),
        "width": 3.2,
        "height": 3.4,
        "frame_box": (0.09, 0.0, 0.91, 0.93),
        "glass_boxes": [(0.24, 0.66, 0.76, 0.75)],
        "glow_intensity": 0.55,
        "has_canopy": True,
    },
    {
        "id": "door_soviet_block",
        "index": 8,
        "crop": (182, 255, 842, 955),
        "width": 2.6,
        "height": 2.9,
        "frame_box": (0.11, 0.0, 0.89, 0.91),
        "glass_boxes": [(0.26, 0.72, 0.74, 0.83)],
        "glow_intensity": 0.55,
        "has_canopy": True,
    },
    {
        "id": "door_shop_glass",
        "index": 9,
        "crop": (42, 42, 982, 982),
        "width": 4.0,
        "height": 3.8,
        "frame_box": (0.04, 0.0, 0.96, 0.95),
        "glass_boxes": [(0.06, 0.14, 0.94, 0.74)],
        "glow_intensity": 1.10,
        "has_canopy": True,
    },
    {
        "id": "door_garage_roller",
        "index": 10,
        "crop": (110, 145, 914, 945),
        "width": 3.8,
        "height": 3.3,
        "frame_box": (0.09, 0.0, 0.91, 0.92),
        "glass_boxes": [(0.22, 0.78, 0.78, 0.84)],
        "glow_intensity": 0.40,
        "has_canopy": False,
    },
    {
        "id": "door_us_suburban",
        "index": 11,
        "crop": (112, 48, 912, 985),
        "width": 2.8,
        "height": 3.0,
        "frame_box": (0.10, 0.0, 0.90, 0.93),
        "glass_boxes": [(0.16, 0.10, 0.30, 0.74), (0.70, 0.10, 0.84, 0.74)],
        "glow_intensity": 0.70,
        "has_canopy": True,
    },
]


def build_door_tile_and_mask(im: Image.Image, spec: dict, size: int = 512):
    crop_box = spec["crop"]
    cropped = im.convert("RGB").crop(crop_box).resize((size, size), Image.Resampling.LANCZOS)
    rgb = np.asarray(cropped, dtype=np.float32) / 255.0

    H, W, _ = rgb.shape
    # Note: in image space row 0 is top (v=1), row H-1 is bottom (v=0)
    u_grid = (np.arange(W, dtype=np.float32) + 0.5) / W
    v_grid = 1.0 - (np.arange(H, dtype=np.float32) + 0.5) / H
    uu, vv = np.meshgrid(u_grid, v_grid)

    fu0, fv0, fu1, fv1 = spec["frame_box"]
    # Distance inside frame_box (0 at outer edge of tile, 1 inside frame_box)
    fx_left = np.clip(uu / max(0.02, fu0), 0.0, 1.0)
    fx_right = np.clip((1.0 - uu) / max(0.02, 1.0 - fu1), 0.0, 1.0)
    fy_top = np.clip((1.0 - vv) / max(0.02, 1.0 - fv1), 0.0, 1.0)
    frame_weight = np.minimum(np.minimum(fx_left, fx_right), fy_top)
    # Smooth hermite curve
    frame_weight = frame_weight * frame_weight * (3.0 - 2.0 * frame_weight)

    # Base alpha: 0.02 at outer margin -> 0.40 inside solid door frame
    alpha = 0.02 + 0.38 * frame_weight

    # Luminance & local contrast for glass pane refinement
    lum = 0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]
    gx = np.abs(np.gradient(lum, axis=1))
    gy = np.abs(np.gradient(lum, axis=0))
    edge_grad = np.clip((gx + gy) * 5.0, 0.0, 1.0)

    glass_mask = np.zeros((H, W), dtype=np.float32)
    for (gu0, gv0, gu1, gv1) in spec["glass_boxes"]:
        in_x = np.clip((uu - gu0) / 0.02, 0.0, 1.0) * np.clip((gu1 - uu) / 0.02, 0.0, 1.0)
        in_y = np.clip((vv - gv0) / 0.02, 0.0, 1.0) * np.clip((gv1 - vv) / 0.02, 0.0, 1.0)
        box_w = in_x * in_y
        glass_mask = np.maximum(glass_mask, box_w)

    # Preserve dark mullions/bars inside glass boxes so door handles and muntin bars stay crisp at night
    mullion_suppress = np.clip(1.0 - 0.65 * edge_grad, 0.25, 1.0)
    glass_val = glass_mask * mullion_suppress

    # Where glass_val > 0.1, map alpha into [0.55, 0.98]
    alpha = np.where(glass_val > 0.08, np.maximum(alpha, 0.52 + 0.46 * glass_val), alpha)

    rgb_u8 = (np.clip(rgb, 0.0, 1.0) * 255.0).astype(np.uint8)
    mask_u8 = (np.clip(alpha, 0.0, 1.0) * 255.0).astype(np.uint8)
    return rgb_u8, mask_u8


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    N = len(DOOR_SPECS)
    strip_rgb = np.zeros((TILE_SIZE * N, TILE_SIZE, 3), dtype=np.uint8)
    strip_mask = np.zeros((TILE_SIZE * N, TILE_SIZE), dtype=np.uint8)
    manifest = []

    for idx, spec in enumerate(DOOR_SPECS):
        did = spec["id"]
        src_path = SRC_DIR / f"{did}.jpg"
        if not src_path.exists():
            raise FileNotFoundError(f"Missing door texture: {src_path}")

        with Image.open(src_path) as im:
            tile_rgb, tile_mask = build_door_tile_and_mask(im, spec, TILE_SIZE)

        y0 = idx * TILE_SIZE
        y1 = y0 + TILE_SIZE
        strip_rgb[y0:y1, :, :] = tile_rgb
        strip_mask[y0:y1, :] = tile_mask

        avg_color = [round(float(x) / 255.0, 4) for x in tile_rgb.mean(axis=(0, 1))]
        glass_cov = round(float((tile_mask > 135).mean()), 3)
        manifest.append({
            "id": did,
            "index": idx,
            "width": spec["width"],
            "height": spec["height"],
            "glowIntensity": spec["glow_intensity"],
            "hasCanopy": bool(spec.get("has_canopy", False)),
            "hasStoop": bool(spec.get("has_stoop", False)),
            "avgColor": avg_color,
            "glassCoverage": glass_cov,
        })
        print(f"[{idx:02d}] {did:28s} size={spec['width']}x{spec['height']}m avg={avg_color} glass={glass_cov:.1%}")

    strip_rgb_path = OUT_DIR / "door_strip.jpg"
    strip_mask_path = OUT_DIR / "door_mask_strip.jpg"
    manifest_path = OUT_DIR / "manifest.json"

    Image.fromarray(strip_rgb, mode="RGB").save(strip_rgb_path, quality=86, optimize=True)
    Image.fromarray(strip_mask, mode="L").save(strip_mask_path, quality=82, optimize=True)

    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump({"tileSize": TILE_SIZE, "count": N, "doors": manifest}, f, indent=2)

    print(f"\nWrote {strip_rgb_path} ({strip_rgb_path.stat().st_size / 1024:.1f} KB)")
    print(f"Wrote {strip_mask_path} ({strip_mask_path.stat().st_size / 1024:.1f} KB)")
    print(f"Wrote {manifest_path} ({N} doors)")


if __name__ == "__main__":
    main()
