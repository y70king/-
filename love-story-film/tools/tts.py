"""Generate the Arabic (MSA) narration with word timings.

Usage: python3 tools/tts.py            (run from love-story-film/)
Writes audio/vo/NN.mp3 and audio/vo/NN.words.json
"""
import asyncio, json, os, sys

try:  # the cloud proxy re-signs TLS; trust its bundle when present
    import certifi
    if os.path.exists("/root/.ccr/ca-bundle.crt"):
        certifi.where = lambda: "/root/.ccr/ca-bundle.crt"
except ImportError:
    pass
import edge_tts

VOICE = os.environ.get("VO_VOICE", "ar-SA-HamedNeural")
RATE = os.environ.get("VO_RATE", "+4%")
PITCH = os.environ.get("VO_PITCH", "-4Hz")


async def one(i, text):
    c = edge_tts.Communicate(text, VOICE, rate=RATE, pitch=PITCH,
                             boundary="WordBoundary",
                             proxy=os.environ.get("HTTPS_PROXY"))
    words, audio = [], bytearray()
    async for ch in c.stream():
        if ch["type"] == "audio":
            audio += ch["data"]
        elif ch["type"] == "WordBoundary":
            words.append({"t": ch["offset"] / 1e7, "d": ch["duration"] / 1e7, "w": ch["text"]})
    open(f"audio/vo/{i:02d}.mp3", "wb").write(audio)
    json.dump(words, open(f"audio/vo/{i:02d}.words.json", "w"), ensure_ascii=False, indent=0)


async def main():
    lines = json.load(open("narration.json"))
    only = set(int(a) for a in sys.argv[1:])
    for i, text in enumerate(lines):
        if not only or i in only:
            await one(i, text)
            print("ok", i)

asyncio.run(main())
