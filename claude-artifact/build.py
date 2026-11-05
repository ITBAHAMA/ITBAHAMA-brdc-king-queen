"""Build the claude.ai artifact version: index.src.html + embedded logo -> artifact.html.

claude.ai adds the <html>/<head> wrapper when the artifact is published.
"""
import base64
import io
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).parent
REPO = ROOT.parent

im = Image.open(REPO / "assets" / "bahama-logo.jpg").convert("RGB")
im = im.crop((40, 70, 1560, 830)).resize((720, 360), Image.LANCZOS)
buf = io.BytesIO()
im.save(buf, "JPEG", quality=86)
logo = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()

content = (ROOT / "index.src.html").read_text(encoding="utf-8").replace("__LOGO__", logo)
(ROOT / "artifact.html").write_text(content, encoding="utf-8")
print("Built artifact.html")
