# © 2026 Mathew. All rights reserved.
"""Generate Egyptian Arabic mp3s for BAB cards using edge-tts."""
import asyncio
import hashlib
import json
import re
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parents[1]
VOICE = "ar-EG-SalmaNeural"
OUT = ROOT / "assets" / "audio"
OUT.mkdir(parents=True, exist_ok=True)

CARDS_JS = (ROOT / "js" / "cards.js").read_text(encoding="utf-8")

# Pull every Arabic-looking string from cards.js
AR_RE = re.compile(r'["\']([^"\']*[\u0600-\u06FF][^"\']*)["\']')
texts = []
seen = set()
for m in AR_RE.finditer(CARDS_JS):
    t = m.group(1).strip()
    if t and t not in seen:
        seen.add(t)
        texts.append(t)

# Always include a few extras used in UI
for extra in ("اسمع", "خلاص", "مش كويس"):
    if extra not in seen:
        texts.append(extra)
        seen.add(extra)


def fname(text: str) -> str:
    h = hashlib.sha1(text.encode("utf-8")).hexdigest()[:12]
    return f"{h}.mp3"


async def one(text: str, path: Path) -> None:
    comm = edge_tts.Communicate(text, VOICE, rate="-8%")
    await comm.save(str(path))


async def main() -> None:
    mapping = {}
    for text in texts:
        path = OUT / fname(text)
        mapping[text] = f"assets/audio/{path.name}"
        if path.exists() and path.stat().st_size > 200:
            print("skip", text)
            continue
        print("tts", text)
        await one(text, path)

    map_js = ROOT / "js" / "audio-map.js"
    payload = json.dumps(mapping, ensure_ascii=False, indent=2)
    map_js.write_text(
        f"/* auto-generated Egyptian audio map */\nconst AUDIO_FILES = {payload};\n",
        encoding="utf-8",
    )
    print("wrote", len(mapping), "clips")


if __name__ == "__main__":
    asyncio.run(main())
