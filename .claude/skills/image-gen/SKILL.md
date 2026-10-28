---
name: image-gen
description: Generate images (photos, illustrations, art, logos, posters, thumbnails) from a text description using OpenAI's image model, the same engine behind ChatGPT images. Use whenever the user asks to draw, design, generate, or create an image or picture (e.g. "ارسم", "صمم صورة", "سويلي صورة", "generate an image").
---

# توليد الصور (Image Generation)

Use `scripts/generate_image.py` to create images with OpenAI's image API.

## Steps

1. Turn the user's request into a detailed **English** prompt: subject, style
   (photorealistic, 3D, flat illustration, anime...), composition, lighting,
   colors, mood. If the image must contain text (e.g. Arabic words), put the
   exact text in quotes inside the prompt.
2. Pick a size: `1024x1024` (square), `1536x1024` (landscape), `1024x1536`
   (portrait/story).
3. Run:

   ```bash
   python .claude/skills/image-gen/scripts/generate_image.py "<prompt>" \
     --size 1024x1024 --quality high -o generated-images/<short-name>.png
   ```

4. Show the result to the user (send the file / give its path) and tell them,
   in their language, the prompt you used so they can ask for tweaks.

## Notes

- Needs `OPENAI_API_KEY` in the environment. If missing, tell the user to add
  it (in a cloud session: environment secrets) and stop.
- `--quality low` is cheaper and faster for drafts; `high` for final images.
- `-n 2..4` generates variations.
- Override the model with `OPENAI_IMAGE_MODEL` if a newer one is available.
