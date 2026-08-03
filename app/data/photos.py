"""Fallback profile artwork, drawn as SVG.

Real photographs take priority: `find_real_photo` looks for
`static/img/<profile_id>/<index>.jpg` first, and the five Discover profiles all
ship with real screenshots. Everything here is what renders when a slot has no
file — currently the account owner and the wings, until their own photos are
dropped in.

Each fallback is an original vector portrait in the flat Springfield style: a
yellow head, two oversized overlapping eyes, a bulbous nose, and per-character
hair and props, assembled from primitives rather than traced. Backgrounds and
expressions shift per photo index so a profile's photos don't look like the same
picture repeated, and because it's generated, a slot can never fail to load
mid-demo.
"""

from pathlib import Path

STATIC_IMG_DIR = Path(__file__).resolve().parents[2] / "static" / "img"
REAL_PHOTO_SUFFIXES = (".jpg", ".jpeg", ".png", ".webp")

W, H = 900, 1200

SKIN = "#FFD90F"          # the famous yellow
SKIN_SHADOW = "#E8B90A"
OUTLINE = "#1A1A1A"

# Flat, saturated backdrops — a different one per photo slot.
BACKDROPS = [
    "#7EC0EE",  # Springfield sky
    "#F2A0C0",
    "#8FD18A",
    "#F7C873",
    "#B9A3E3",
    "#7FD1CB",
]


def find_real_photo(profile_id, index):
    for suffix in REAL_PHOTO_SUFFIXES:
        candidate = STATIC_IMG_DIR / profile_id / f"{index}{suffix}"
        if candidate.is_file():
            return candidate
    return None


def _escape(text):
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


# ---------------------------------------------------------------- characters

# Raw SVG fragments layered around a shared head at (450, 600), rx 210 / ry 232 —
# so the head spans x 240..660 and its crown sits at y 368.
#
# `hair_back` draws behind the head and is where bulk hair belongs: a Simpsons
# forehead is tiny and the eyes are enormous, so any hair drawn in front lands on
# top of the eyes. `hair` and `props` draw in front, for strands and headwear
# that genuinely sit over the face — those must stay clear of y 424, the top of
# the eye mass.
CHARACTERS = {
    # ---- the swipe deck ------------------------------------------------
    "homer": {
        "shirt": "#FFFFFF",
        "jaw": "stubble",
        "hair": """
          <path d="M 300 395 q 30 -55 78 -18 q -6 -42 42 -34" fill="none" stroke="#2B2B2B" stroke-width="17" stroke-linecap="round"/>
          <path d="M 250 470 q -22 -95 34 -122" fill="none" stroke="#2B2B2B" stroke-width="17" stroke-linecap="round"/>
          <path d="M 660 520 q 40 -80 -8 -140" fill="none" stroke="#2B2B2B" stroke-width="17" stroke-linecap="round"/>""",
    },
    "moe": {
        "shirt": "#F0F0F0",
        "jaw": "stubble",
        "nose": "big",
        "hair_back": """
          <ellipse cx="450" cy="392" rx="226" ry="122" fill="#2B2B2B"/>""",
    },
    "flanders": {
        "shirt": "#3E7A4E",
        "hair_back": """
          <ellipse cx="450" cy="386" rx="224" ry="112" fill="#8A5A2B"/>""",
        "facial": """
          <path d="M 368 686 q 82 -34 164 0 q -14 46 -82 46 q -68 0 -82 -46 Z" fill="#8A5A2B"/>""",
        "props": """
          <circle cx="392" cy="516" r="98" fill="none" stroke="#2B2B2B" stroke-width="11"/>
          <circle cx="512" cy="516" r="98" fill="none" stroke="#2B2B2B" stroke-width="11"/>""",
    },
    "krusty": {
        "shirt": "#7EC8E3",
        "nose": "big",
        "nose_color": "#D94F3D",
        "hair_back": """
          <ellipse cx="232" cy="430" rx="112" ry="92" fill="#3FA34D"/>
          <ellipse cx="668" cy="430" rx="112" ry="92" fill="#3FA34D"/>""",
        "props": """
          <path d="M 366 744 q 84 50 168 0 q -16 70 -84 70 q -68 0 -84 -70 Z" fill="#D94F3D"/>
          <path d="M 450 930 l -74 40 l 74 30 l 74 -30 Z" fill="#D94F3D"/>""",
    },
    "cbg": {
        "shirt": "#8A6A3E",
        "hair_back": """
          <ellipse cx="450" cy="388" rx="228" ry="118" fill="#5A3A22"/>
          <ellipse cx="700" cy="600" rx="70" ry="150" fill="#5A3A22"/>""",
        "facial": """
          <path d="M 318 664 q 132 118 264 0 q 16 142 -132 150 q -148 -8 -132 -150 Z" fill="#5A3A22"/>""",
        "props": """
          <circle cx="392" cy="516" r="96" fill="none" stroke="#2B2B2B" stroke-width="10"/>
          <circle cx="512" cy="516" r="96" fill="none" stroke="#2B2B2B" stroke-width="10"/>""",
    },
    # ---- the account owner and their wings -----------------------------
    # Same Springfield styling as the deck so the whole world looks like one
    # place. Shirt colours come from Hinge's extended palette.
    "sheshu": {
        "shirt": "#67295F",
        "hair_back": """
          <ellipse cx="450" cy="368" rx="240" ry="140" fill="#241C18"/>
          <ellipse cx="262" cy="560" rx="70" ry="150" fill="#241C18"/>
          <ellipse cx="638" cy="560" rx="70" ry="150" fill="#241C18"/>""",
    },
    "jason": {
        "shirt": "#025656",
        "jaw": "stubble",
        # Wide enough to show at the temples — a narrower ellipse only peeks
        # over the crown and reads as a hat rather than hair.
        "hair_back": """
          <ellipse cx="450" cy="404" rx="238" ry="124" fill="#33251C"/>""",
    },
    "julia": {
        "shirt": "#D45847",
        "lashes": True,
        "hair_back": """
          <ellipse cx="450" cy="366" rx="248" ry="146" fill="#7A4520"/>
          <ellipse cx="236" cy="660" rx="80" ry="220" fill="#7A4520"/>
          <ellipse cx="664" cy="660" rx="80" ry="220" fill="#7A4520"/>""",
    },
    "sewon": {
        "shirt": "#75457D",
        "hair_back": """
          <ellipse cx="450" cy="352" rx="246" ry="152" fill="#1F1A17"/>
          <circle cx="248" cy="430" r="82" fill="#1F1A17"/>
          <circle cx="652" cy="430" r="82" fill="#1F1A17"/>""",
    },
}

DEFAULT = {"shirt": "#B0B0B0"}


# ------------------------------------------------------------------ drawing


def _face(cfg, index):
    """Head, eyes, nose and mouth. Expression varies with the photo slot."""
    skin = cfg.get("skin", SKIN)
    # Pupils drift between photos so the six shots don't feel identical.
    gaze = [(0, 0), (-9, 3), (7, -3), (0, 5), (-6, -4), (8, 2)][index % 6]
    gx, gy = gaze

    parts = []

    # Neck, then shoulders. The torso is drawn much wider than the canvas and
    # kept shallow: a narrow, tall ellipse reads as a hill behind the character
    # instead of a body in front of the backdrop.
    shirt = cfg.get("shirt", "#B0B0B0")
    parts.append(f'<rect x="392" y="790" width="116" height="180" fill="{SKIN_SHADOW}"/>')
    parts.append(f'<ellipse cx="450" cy="1330" rx="620" ry="290" fill="{shirt}"/>')
    # A collar reads as clothing and stops a plain shirt looking like landscape.
    parts.append(
        f'<path d="M 356 1046 q 94 96 188 0 q -66 -22 -94 -22 q -28 0 -94 22 Z" '
        f'fill="{SKIN_SHADOW}" opacity="0.55"/>'
    )

    # ears then head
    parts.append(f'<circle cx="238" cy="646" r="46" fill="{skin}"/>')
    parts.append(f'<circle cx="662" cy="646" r="46" fill="{skin}"/>')
    parts.append(f'<ellipse cx="450" cy="600" rx="210" ry="232" fill="{skin}"/>')

    if cfg.get("jowls"):
        parts.append(f'<ellipse cx="450" cy="760" rx="196" ry="130" fill="{skin}"/>')

    if cfg.get("cheeks"):
        parts.append(f'<circle cx="300" cy="690" r="46" fill="{cfg["cheeks"]}" opacity="0.5"/>')
        parts.append(f'<circle cx="600" cy="690" r="46" fill="{cfg["cheeks"]}" opacity="0.5"/>')

    # the signature overlapping eyes, sitting proud of the head outline
    parts.append(f'<circle cx="392" cy="516" r="92" fill="#FFFFFF" stroke="{OUTLINE}" stroke-width="6"/>')
    parts.append(f'<circle cx="512" cy="516" r="92" fill="#FFFFFF" stroke="{OUTLINE}" stroke-width="6"/>')
    # re-fill the overlap seam so the two circles read as one eye mass
    parts.append('<ellipse cx="452" cy="516" rx="52" ry="86" fill="#FFFFFF"/>')
    parts.append(f'<circle cx="{392 + gx}" cy="{516 + gy}" r="17" fill="{OUTLINE}"/>')
    parts.append(f'<circle cx="{512 + gx}" cy="{516 + gy}" r="17" fill="{OUTLINE}"/>')

    if cfg.get("lashes"):
        for cx in (392, 512):
            parts.append(
                f'<path d="M {cx - 78} 452 q 78 -46 156 0" fill="none" stroke="{OUTLINE}" stroke-width="9" stroke-linecap="round"/>'
            )

    brows = cfg.get("brows")
    if brows == "sad":
        parts.append(f'<path d="M 320 424 q 72 26 140 6" fill="none" stroke="{OUTLINE}" stroke-width="12" stroke-linecap="round"/>')
        parts.append(f'<path d="M 580 424 q -72 26 -140 6" fill="none" stroke="{OUTLINE}" stroke-width="12" stroke-linecap="round"/>')

    # nose: bulbous, hanging off the eye mass
    nose_r = 44 if cfg.get("nose") == "big" else 34
    parts.append(
        f'<ellipse cx="556" cy="600" rx="{nose_r}" ry="{int(nose_r * 0.82)}" '
        f'fill="{cfg.get("nose_color", skin)}" stroke="{OUTLINE}" stroke-width="5"/>'
    )

    # mouth / jaw
    jaw = cfg.get("jaw")
    if jaw == "stubble":
        parts.append(f'<ellipse cx="450" cy="756" rx="150" ry="96" fill="{SKIN_SHADOW}" opacity="0.75"/>')
    mouth = ["q 90 60 180 0", "q 90 34 180 0", "q 90 78 180 0", "q 90 20 180 0"][index % 4]
    parts.append(
        f'<path d="M 360 726 {mouth}" fill="none" stroke="{OUTLINE}" stroke-width="10" stroke-linecap="round"/>'
    )

    return "".join(parts)


def render_svg(profile_id, index, caption=""):
    cfg = CHARACTERS.get(profile_id, DEFAULT)
    backdrop = BACKDROPS[index % len(BACKDROPS)]

    caption_markup = ""
    if caption:
        caption_markup = f"""
  <rect x="0" y="{H - 230}" width="{W}" height="230" fill="url(#scrim)"/>
  <text x="56" y="{H - 74}" fill="#FFFFFF" font-size="40" font-weight="600"
        font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">{_escape(caption)}</text>"""

    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
  <defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.6"/>
    </linearGradient>
    <clipPath id="frame"><rect width="{W}" height="{H}"/></clipPath>
  </defs>
  <g clip-path="url(#frame)">
    <rect width="{W}" height="{H}" fill="{backdrop}"/>
    <circle cx="{W - 130}" cy="180" r="90" fill="#FFFFFF" opacity="0.35"/>
    <circle cx="{W - 240}" cy="230" r="60" fill="#FFFFFF" opacity="0.25"/>
    {cfg.get("hair_back", "")}
    {_face(cfg, index)}
    {cfg.get("hair", "")}
    {cfg.get("facial", "")}
    {cfg.get("props", "")}
  </g>
  {caption_markup}
</svg>"""
