# Regenerates build/icon.ico. Not part of the build - run it by hand after
# changing the design:  pip install Pillow && python3 scripts/make-icon.py
#
from PIL import Image, ImageDraw

# Palette lifted verbatim from the CSS block inside src/PromptBench.jsx, so the
# icon belongs to the app rather than being invented alongside it.
SIGNAL = (0x1B, 0x36, 0xD8, 255)   # --signal  electric blue  (ground)
PANEL  = (0xE4, 0xE6, 0xE1, 255)   # --panel   pale grey-green (filled slots)
LIVE   = (0xC9, 0xF2, 0x4E, 255)   # --live    lime            (active slot)

# The mark is three stacked slots of decreasing width - the app's core gesture,
# filling structured fields. Proportions are taken from a 16px list/menu glyph
# (2px bar, 2px gap) scaled up, because that is the size that has to survive.
S = 1024                 # master, 4x the largest icon size
u = S / 256.0            # one unit at the 256 design size

BAR_H  = 32 * u
GAP    = 32 * u
X      = 48 * u
Y0     = 48 * u
WIDTHS = [160 * u, 124 * u, 88 * u]
COLORS = [PANEL, PANEL, LIVE]
RADIUS = 56 * u          # ground corner radius

master = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(master)
d.rounded_rectangle([0, 0, S - 1, S - 1], radius=RADIUS, fill=SIGNAL)

for i, (w, c) in enumerate(zip(WIDTHS, COLORS)):
    y = Y0 + i * (BAR_H + GAP)
    d.rounded_rectangle([X, y, X + w, y + BAR_H], radius=BAR_H / 2, fill=c)

master.save("build/icon-master.png")  # kept as the regeneratable source

SIZES = [16, 24, 32, 48, 64, 128, 256]
frames = [master.resize((n, n), Image.Resampling.LANCZOS) for n in SIZES]

# Build each size explicitly from the master rather than letting the ICO writer
# downsample once from 1024 - a single 1024->16 step comes out mushy.
frames[-1].save(
    "build/icon.ico",
    format="ICO",
    sizes=[(n, n) for n in SIZES],
    append_images=frames[:-1],
)

print("wrote build/icon.ico and build/icon-master.png")
