# ساحة البث — لعبة تفاعلية لبث تيك توك المباشر

Each viewer's **name enters the arena** as a fighter when they send likes or gifts.
Fighters crash into each other, and the last one standing wins the round.

## شلون تشتغل
| بالبث | بالعبة |
|---|---|
| ❤️ كل **20 لايك** (من كل المشاهدين) | الشخص اللي كمّل الـ20 يطلع اسمه ويدخل الساحة. إذا كان موجود يرتفع مستواه |
| 💬 تعليق `!join` | يدخل الساحة |
| 🌹 هدية 1+ ماسة | 🛡️ درع حماية لمدة 8 ثواني |
| 🎁 هدية 10+ ماسات | 🦍 يصير عملاق لمدة 15 ثانية |
| 💣 هدية 100+ ماسة | قنبلة تضرب كل اللي يمه |
| 👑 هدية 500+ ماسة | يصير الملك (حجم كبير وقوة عالية) |
| ➕ متابعة / ↗ مشاركة | يدخل الساحة أو يرتفع مستواه |

When a gift arrives, a big banner shows the sender's name, the gift and what it did.
Every number above can be changed in `config.json` (`likesPerSpawn`, `giftTiers`, `roundSeconds`, ...).

## التشغيل (على الكمبيوتر اللي تبث منه)
1. نزّل [Node.js](https://nodejs.org) (نسخة 18 أو أحدث).
2. افتح terminal داخل هذا المجلد واكتب:
   ```
   npm install
   ```
3. حط يوزرك بتيك توك بملف `config.json` بمكان `PUT_YOUR_TIKTOK_USERNAME_HERE` (بدون @).
4. **افتح البث المباشر أولاً**، بعدها شغّل:
   ```
   npm start
   ```
   أو مباشرة: `node server.js your_username`
5. افتح بالمتصفح: `http://localhost:3000/` — هاي هي اللعبة.

### إضافتها للبث
- **TikTok LIVE Studio**: Add Source ← Link / Browser ← `http://localhost:3000/`، وخلي الحجم **1080×1920** (عمودي).
- **OBS**: Sources ← Browser ← URL `http://localhost:3000/`، العرض 1080 والارتفاع 1920.
- إذا تريد اللعبة فوق الكاميرا بدون خلفية: `http://localhost:3000/?transparent=1`

## التجربة بدون بث
- `npm run demo` ← مشاهدين وهميين يدزون لايكات وهدايا.
- `http://localhost:3000/?test=1` ← تظهر لوحة أزرار تجرّب بيها (لايك، هدية، join...). تكدر تطلعها أو تخفيها بحرف **T**.

## ملاحظات مهمة
- الاتصال يعتمد على مكتبة [tiktok-live-connector](https://github.com/zerodytrash/TikTok-Live-Connector)، وهي **غير رسمية**. تيك توك ممكن يغيّر نظامه وتوكف فترة. إذا وكفت، حدّث المكتبة: `npm i tiktok-live-connector@latest`.
- بالبثوث الكبيرة تيك توك ما يرسل كل حدث لايك، فممكن العداد يتأخر شوية.
- الربط مجاني وبيه حد للطلبات. إذا ظهر خطأ rate limit، سوّ حساب على eulerstream.com وشغّل بمفتاحك: `EULER_API_KEY=xxxx npm start`
- إذا ظهر `Could not connect`: تأكد إنك لايف هسه، وإن اليوزر مكتوب صح. السيرفر يعيد المحاولة وحده.

## الملفات
- `server.js` — يرتبط ببثك، ويحسب كل 20 لايك، ويرتب الهدايا حسب قيمتها، ويرسل الأحداث للعبة.
- `public/game.js` — اللعبة نفسها (الساحة، المقاتلين، التأثيرات، الجولات، قائمة الفائزين).
- `config.json` — كل الإعدادات.
