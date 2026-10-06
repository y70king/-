# إعلان «مطبعة ألوان» — موشن جرافيك 9:16

- `alwan_ad_4k.mp4` — النسخة النهائية 2160×3840 (4K عمودي)، 30fps، 38 ثانية، صوت AAC ستيريو (−14 LUFS).
- `alwan_ad_1080p.mp4` — نسخة 1080×1920 أخف للرفع السريع.

## المصادر
- `ad.html` — محرك الرسوم المتحركة (Canvas، حتمي: `render(t)` يرسم الإطار عند الزمن t). للمعاينة: افتح `ad.html?s=0.5&play`.
- `render.mjs` — تصيير الإطارات عبر Playwright/Chromium: `node render.mjs <dir> 2 30 <worker> <workers>`.
- `audio.py` — موسيقى إلكترونية سينمائية مولّدة + مؤثرات صوتية + معالجة التعليق الصوتي والمكساج.
- `vo/` — مقاطع التعليق الصوتي (صوت عربي فصيح ذكوري، TTS عصبي).
- `fonts/` — Cairo و Reem Kufi (رخصة OFL).

ترميز نهائي:
`ffmpeg -framerate 30 -i frames/%05d.jpg -i mix.wav -c:v libx264 -crf 19 -pix_fmt yuv420p -c:a aac -b:a 256k -af loudnorm=I=-14:TP=-1 alwan_ad_4k.mp4`
