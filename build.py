"""Rebuild index.html from index.src.html with the BAHAMA logo embedded as a data URI."""
import base64
import io
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).parent

im = Image.open(ROOT / "assets" / "bahama-logo.jpg").convert("RGB")
im = im.crop((40, 70, 1560, 830)).resize((720, 360), Image.LANCZOS)
buf = io.BytesIO()
im.save(buf, "JPEG", quality=86)
logo = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()

src = (ROOT / "index.src.html").read_text(encoding="utf-8")
(ROOT / "index.html").write_text(src.replace("__LOGO__", logo), encoding="utf-8")
print("Built index.html")
