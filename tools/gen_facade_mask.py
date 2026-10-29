#!/usr/bin/env python3
"""[night] Regenerates assets/facades/facade_mask_strip.png: a crisp, lossless 0/1 window-glass mask for the 24
facade tiles in facade_strip.jpg (one 512x512 tile per layer, stacked vertically, image y down).

The old mask (facade_mask_strip.jpg) was a lossy luminance threshold of the photo: grey JPEG blocks, sky
reflections and cloud blotches inside the panes, speckle in the brick, frames instead of panes. That gave
dithered window edges by day and ragged tan/black blotches when windows lit up at night.

Here every window is an axis-aligned rectangle measured off the photo tile. A layer is a list of blocks; each
block is (column intervals) x (row intervals), in tile pixels (layers 0 and 5, curtain walls with irregular
mullion spacing, list their panes one by one).
The per-layer room grid the night shader uses (FACADE_UNITS in src/chunk_builder.js) is laid out so that every
cell boundary falls on wall between these rectangles.

Usage: python3 tools/gen_facade_mask.py   (needs numpy + Pillow)
"""
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
S = 512


def per(start, w, pitch, n):
    return [[start + k * pitch, start + k * pitch + w] for k in range(n)]


def layers():
    R5 = [[22, 120], [150, 248], [278, 376], [406, 504]]
    g2 = []
    for p in range(4):
        g2 += [[p * 128 + 80, p * 128 + 126], [p * 128 + 130, p * 128 + 174]]
    r14 = [[16, 56], [85, 126], [155, 196], [232, 275], [308, 350], [384, 423], [456, 494]]
    return {
        0: [([[6, 49], [55, 100], [106, 125], [132, 152], [155, 203], [207, 252], [260, 305], [309, 357], [360, 381],
              [388, 406], [412, 457], [463, 506]],
             [[6, 25], [31, 125], [133, 153], [159, 253], [261, 281], [287, 381], [388, 409], [415, 506]])],
        1: [(per(2, 60, 64, 8), per(10, 115, 128, 4))],
        2: [(g2, per(16, 96, 128, 4))],
        3: [(per(33, 62, 128, 4), [[42, 128], [212, 300], [384, 470]])],
        4: [([[44, 113], [170, 240], [296, 367], [422, 494]], [[30, 156], [188, 328], [358, 493]])],
        5: [([[21, 31], [39, 49], [56, 67], [72, 84], [140, 150], [157, 169], [174, 187], [224, 237], [242, 252],
              [260, 271], [275, 288], [325, 339], [342, 354], [360, 372], [377, 381], [427, 439], [445, 457],
              [463, 473], [480, 491]], R5)],
        6: [([[46, 114], [228, 285], [396, 466]], [[37, 128], [205, 300], [375, 470]])],
        7: [(per(32, 64, 128, 4), [[27, 104], [155, 233], [284, 361], [413, 490]])],
        8: [(per(33, 63, 128, 4), [[34, 150], [200, 317], [367, 488]])],
        9: [([[64, 116], [230, 282], [397, 448]], [[38, 150], [200, 325], [370, 500]])],
        10: [([[40, 100], [226, 286], [410, 470]], [[48, 148], [208, 318], [384, 500]])],
        11: [(per(40, 56, 128, 4), [[30, 128], [220, 312], [390, 490]])],
        12: [([[33, 103], [408, 478]], per(37, 59, 128, 4)), ([[148, 246], [266, 362]], per(12, 100, 128, 4))],
        13: [([[k * 64 + 2, k * 64 + 62] for k in range(8)], [[32, 82], [130, 180], [226, 276], [322, 373], [418, 468]])],
        14: [([[18, 50], [206, 238], [274, 306], [462, 494]], r14), ([[68, 126], [130, 186], [324, 382], [386, 444]], r14)],
        15: [([[34, 137], [204, 307], [374, 478]], [[30, 133], [198, 305], [362, 470]])],
        16: [(per(25, 77, 128, 4), per(22, 66, 128, 4))],
        17: [([[64, 166], [198, 316], [348, 452]], [[120, 245], [312, 470]])],
        18: [([[11, 120], [137, 248], [265, 375], [393, 501]], [[40, 107], [153, 225], [280, 346], [407, 469]])],
        19: [(per(34, 62, 128, 4), [[36, 128], [200, 294], [372, 466]])],
        20: [([[38, 139], [205, 306], [372, 471]], [[38, 120], [158, 244], [280, 368], [400, 493]])],
        21: [([[58, 122], [225, 290], [390, 455]], [[60, 185], [318, 445]])],
        22: [([[24, 142], [372, 490]], [[130, 500]]), ([[184, 336]], [[160, 500]])],
        23: [(per(10, 108, 128, 4), [[114, 150], [370, 406]])],
    }


def main():
    n = Image.open(ROOT / 'assets/facades/facade_strip.jpg').height // S
    out = np.zeros((S * n, S), np.uint8)
    for layer, blocks in layers().items():
        if layer >= n:
            continue
        t = out[layer * S:(layer + 1) * S]
        for cols, rows in blocks:
            for y0, y1 in rows:
                for x0, x1 in cols:
                    # columns may wrap past the right edge of the seamless tile
                    for a, b in ((x0, min(x1, S)), (0, x1 - S)) if x1 > S else ((x0, x1),):
                        if b > a:
                            t[max(0, y0):min(S, y1), a:b] = 255
    Image.fromarray(out, 'L').save(ROOT / 'assets/facades/facade_mask_strip.png', optimize=True)
    print('wrote', ROOT / 'assets/facades/facade_mask_strip.png', out.shape)


if __name__ == '__main__':
    main()
