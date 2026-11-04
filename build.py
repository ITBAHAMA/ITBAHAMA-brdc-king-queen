"""Build the page from index.src.html with the BAHAMA logo embedded as a data URI.

Writes two files:
- artifact.html: page content as published to claude.ai (claude.ai adds the <html>/<head> wrapper)
- index.html:    the same page wrapped in a full HTML document, so it opens correctly in a browser
"""
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

content = (ROOT / "index.src.html").read_text(encoding="utf-8").replace("__LOGO__", logo)
(ROOT / "artifact.html").write_text(content, encoding="utf-8")

page = (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
    "</head><body>\n" + content + "\n</body></html>\n"
)
(ROOT / "index.html").write_text(page, encoding="utf-8")
print("Built artifact.html and index.html")
