import io

from fastapi import HTTPException
from PIL import Image, UnidentifiedImageError
import pillow_heif

pillow_heif.register_heif_opener()

MAX_PHOTO_BYTES = 20 * 1024 * 1024
ACCEPTED_PHOTO_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif")


def to_jpeg_bytes(file_bytes: bytes) -> bytes:
    try:
        img = Image.open(io.BytesIO(file_bytes))
    except UnidentifiedImageError:
        raise HTTPException(status_code=400, detail="Could not read the uploaded image. Use JPG, PNG, WebP, or HEIC.")
    if img.mode == "RGBA":
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[3])
        img = bg
    else:
        img = img.convert("RGB")
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=100, subsampling=0)
    return out.getvalue()
