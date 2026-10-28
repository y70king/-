---
name: image-gen
description: Generate images (photos, illustrations, art, logos, posters, thumbnails) from a text description. Free by default (no API key). Use whenever the user asks to draw, design, generate, or create an image or picture (e.g. "ارسم", "صمم صورة", "سويلي صورة", "generate an image").
---

# توليد الصور (Image Generation)

Use `scripts/generate_image.py` to create images.

## Steps

1. Turn the user's request into a detailed **English** prompt: subject, style
   (photorealistic, 3D render, flat illustration, anime...), composition,
   lighting, colors, mood. Avoid asking the model to render Arabic text — free
   models garble it; add Arabic text afterwards with Pillow if needed.
2. Pick a size: `1024x1024` (square), `1536x1024` (landscape), `1024x1536`
   (portrait/story).
3. Run:

   ```bash
   python .claude/skills/image-gen/scripts/generate_image.py "<prompt>" \
     --size 1024x1024 -o generated-images/<short-name>.png
   ```

4. Look at the image (Read the file), then send it to the user and tell them,
   in their language, the prompt you used so they can ask for tweaks.

## Providers (`--provider` or env `IMAGE_PROVIDER`)

| Provider | Cost | Needs |
|---|---|---|
| `pollinations` (default) | Free | Nothing. Rate-limited (~1 image / 45s); the script retries automatically. Optional `POLLINATIONS_TOKEN`. |
| `huggingface` | Free monthly credits | `HF_TOKEN` (free at huggingface.co/settings/tokens). FLUX.1-schnell. |
| `openai` | Paid | `OPENAI_API_KEY`. Same engine as ChatGPT images, best with text in images. |

If one provider fails, try the next one that has its key available.
