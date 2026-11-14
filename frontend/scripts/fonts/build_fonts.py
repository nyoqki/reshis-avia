"""Build the self-hosted font subsets (Golos Text wght 400-600, JetBrains Mono 600).

Build (needs network, once):
    uv run --no-project --with 'fonttools[woff]==4.68.0' python frontend/scripts/fonts/build_fonts.py
Check the committed woff2 files (no network):
    uv run --no-project --with 'fonttools[woff]==4.68.0' python frontend/scripts/fonts/build_fonts.py --check

Sources are the full OFL fonts from github.com/google/fonts at one pinned commit, verified by sha256.
Google Fonts and @fontsource subsets lack U+2192 and U+2248, hence the own subsetting.
REQUIRED code points must be in the committed files (--check exits 1 otherwise); SUBSET ones are
kept when the font has them and only reported.
"""

from __future__ import annotations

import hashlib
import io
import tempfile
import sys
import urllib.request
from pathlib import Path

from fontTools.ttLib import TTFont

SHA = "29b4ec6df2522a8aee279414b78a07910b065874"
BASE = f"https://raw.githubusercontent.com/google/fonts/{SHA}/ofl"
OUT = Path(__file__).resolve().parents[2] / "src" / "assets" / "fonts"

SOURCES = {
    "golos": (
        f"{BASE}/golostext/GolosText%5Bwght%5D.ttf",
        "17bb58fb69aec2dfb047a2ebf52534023e9b688c97a6b7ac795b0a72912c2063",
    ),
    "jetbrains": (
        f"{BASE}/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf",
        "48715a42ec242c21e9f02692891e147d022299a52e48d5e413e1a942193ffeda",
    ),
}

REQUIRED = (
    set(range(0x20, 0x7F))
    | {0xA0, 0xAB, 0xBB, 0x401, 0x451, 0x2013, 0x2014, 0x202F, 0x20BD, 0x2192, 0x2212, 0x2248}
    | set(range(0x410, 0x450))
)
SUBSET = {
    "golos": (
        set(range(0xA0, 0x100))
        | set(range(0x400, 0x460))
        | set(range(0x2010, 0x2028))
        | set(range(0x2030, 0x203B))
        | {0x2116, 0x2264, 0x2265}
        | set(range(0x2190, 0x2194))
    ),
    "jetbrains": {0xB7, 0x2026},
}
TARGETS = {"golos": OUT / "golos-text-wght.woff2", "jetbrains": OUT / "jetbrains-mono-600.woff2"}

# Fallback metrics (unitsPerEm 2048): Arial and Courier New hhea values and mean lowercase a-z advance in em.
FALLBACKS = {
    "golos": ("Golos Text Fallback", "Arial", 1854, 434, 67, 0.4895),
    "jetbrains": ("JetBrains Mono Fallback", "Courier New", 1705, 615, 0, 0.6001),
}


def fetch(name: str) -> Path:
    url, digest = SOURCES[name]
    with urllib.request.urlopen(url, timeout=60) as r:  # noqa: S310 - pinned https URL
        data = r.read()
    got = hashlib.sha256(data).hexdigest()
    if got != digest:
        sys.exit(f"sha256 mismatch for {url}: {got}")
    path = Path(tempfile.gettempdir()) / f"{name}-source.ttf"
    path.write_bytes(data)
    return path


def build() -> None:
    from fontTools import subset
    from fontTools.varLib import instancer

    OUT.mkdir(parents=True, exist_ok=True)
    for name in SOURCES:
        font = TTFont(fetch(name))
        limits = {"wght": (400, 600)} if name == "golos" else {"wght": 600}
        font = instancer.instantiateVariableFont(font, limits)
        buf = io.BytesIO()  # round-trip: the subsetter trips over lazily loaded gvar after instancing
        font.save(buf)
        buf.seek(0)
        font = TTFont(buf)
        if name == "jetbrains":
            alias_space(font, 0x202F, 0xA0)
        cmap = set(font.getBestCmap())
        keep = REQUIRED | (SUBSET[name] & cmap)
        opts = subset.Options()
        opts.flavor = "woff2"
        opts.layout_features = ["kern", "liga", "calt", "ccmp", "locl", "mark", "mkmk", "tnum", "case"]
        opts.notdef_outline = True
        opts.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
        sub = subset.Subsetter(opts)
        sub.populate(unicodes=sorted(keep))
        sub.subset(font)
        font.flavor = "woff2"
        font.save(TARGETS[name])
        print(f"wrote {TARGETS[name]} ({TARGETS[name].stat().st_size} bytes)")
        print_metrics(name, font)


def alias_space(font: TTFont, new: int, like: int) -> None:
    """JetBrains Mono has no U+202F; in a monospace font a narrow no-break space is a full cell, like NBSP."""
    for table in font["cmap"].tables:
        if table.isUnicode() and like in table.cmap and new not in table.cmap:
            table.cmap[new] = table.cmap[like]


def lowercase_avg(font: TTFont) -> float:
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    widths = [hmtx[cmap[c]][0] for c in range(ord("a"), ord("z") + 1)]
    return sum(widths) / len(widths) / font["head"].unitsPerEm


def print_metrics(name: str, font: TTFont) -> None:
    label, fallback, f_asc, f_desc, f_gap, f_width = FALLBACKS[name]
    upm = font["head"].unitsPerEm
    hhea = font["hhea"]
    adjust = lowercase_avg(font) / f_width
    print(
        f"@font-face {{ font-family: '{label}'; src: local('{fallback}'); "
        f"size-adjust: {adjust * 100:.2f}%; ascent-override: {hhea.ascent / upm / adjust * 100:.2f}%; "
        f"descent-override: {-hhea.descent / upm / adjust * 100:.2f}%; "
        f"line-gap-override: {hhea.lineGap / upm / adjust * 100:.2f}%; }}"
    )


def check() -> int:
    bad = 0
    for name, path in TARGETS.items():
        cmap = set(TTFont(path).getBestCmap())
        missing = sorted(REQUIRED - cmap)
        if missing:
            bad = 1
            print(f"{path.name}: missing REQUIRED " + " ".join(f"U+{c:04X}" for c in missing))
        gaps = sorted(SUBSET[name] - cmap)
        if gaps:
            print(f"{path.name}: SUBSET gaps (info) " + " ".join(f"U+{c:04X}" for c in gaps))
    if not bad:
        print("all REQUIRED code points present")
    return bad


if __name__ == "__main__":
    if "--check" in sys.argv[1:]:
        sys.exit(check())
    build()
