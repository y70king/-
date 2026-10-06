import asyncio, ssl, sys
import edge_tts.communicate as c
c._SSL_CTX = ssl.create_default_context(cafile="/root/.ccr/ca-bundle.crt")
import edge_tts
async def main(text, out, rate="+0%", pitch="+0Hz", voice="ar-IQ-BashirNeural"):
    await edge_tts.Communicate(text, voice, rate=rate, pitch=pitch).save(out)
asyncio.run(main(*sys.argv[1:]))
