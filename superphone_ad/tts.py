import ssl, asyncio, sys, edge_tts.communicate as c
c._SSL_CTX = ssl.create_default_context(cafile="/root/.ccr/ca-bundle.crt")
LINES = [
 "هل تريدُ أن تمنحَ فيديوهاتِك على تيك توك فرصةً أكبرَ للانتشار؟",
 "مع مكتبِ سوبر فون، يمكنُك طلبُ خدمةِ ترويجِ فيديوهاتِ تيك توك بسهولةٍ وبسعرٍ مناسب!",
 "والسعر؟ خمسةُ آلافِ دينارٍ عراقيٍّ فقط، مع إمكانيةِ الترويجِ كلَّ يومين!",
 "سوبر فون، اجعلْ حضورَك الرقميَّ يبدأُ بخطوة! اطلبْ خدمةَ الترويجِ اليوم.",
]
VOICE = sys.argv[1] if len(sys.argv) > 1 else "ar-SA-HamedNeural"
RATE = sys.argv[2] if len(sys.argv) > 2 else "+10%"
async def main():
    for i, t in enumerate(LINES, 1):
        await c.Communicate(t, VOICE, rate=RATE).save(f"audio/vo{i}.mp3")
asyncio.run(main())
