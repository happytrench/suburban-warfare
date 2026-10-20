#!/usr/bin/env python3
"""Builds client/vendor/textures/world/ from Poly Haven (CC0) 1k downloads.

    python3 -I tools/worldmats.py <raw dir with {slug}_diff.jpg/{slug}_nor.jpg> <out dir>

Surfaces the maps tint per object (siding, concrete, metal, planks, wood) are neutralised to grey so
the material colour shows through; natural surfaces keep their photo colour.
"""
import os, sys
import numpy as np
from PIL import Image

RAW, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
# name: (slug, size, neutral, brightness)
SRC = {
    'pasture': ('sparse_grass', 1024, False, 1.3),
    'fairground': ('aerial_grass_rock', 1024, False, 1.0),
    'asphalt': ('asphalt_02', 1024, False, 1.0),
    'concrete': ('concrete_floor_worn_001', 512, True, 1.0),
    'brick': ('red_brick', 512, False, 1.0),
    'roof': ('roof_09', 512, True, 1.0),
    'siding': ('painted_plaster_wall', 512, True, 1.0),
    'bark': ('bark_brown_02', 512, False, 1.0),
    'sand': ('coast_sand_01', 512, False, 1.0),
    'dirt': ('rocks_ground_02', 512, False, 1.0),
    'metal': ('corrugated_iron', 512, True, 1.0),
    'planks': ('weathered_brown_planks', 512, True, 1.0),
    'wood': ('wood_floor', 512, True, 1.0),
}
for name, (slug, size, neutral, bright) in SRC.items():
    d = Image.open(f'{RAW}/{slug}_diff.jpg').convert('RGB').resize((size, size), Image.LANCZOS)
    a = np.asarray(d).astype(np.float32)
    if neutral:
        g = a.mean(2)
        g = (g - g.mean()) / (g.std() + 1e-6) * 26 + 205
        a = np.stack([g, g, g], 2)
    a = np.clip(a * bright, 0, 255)
    Image.fromarray(a.astype(np.uint8)).save(f'{OUT}/{name}_diff.jpg', quality=84)
    Image.open(f'{RAW}/{slug}_nor.jpg').convert('RGB').resize((size, size), Image.LANCZOS).save(f'{OUT}/{name}_nor.jpg', quality=88)
print('ok')
