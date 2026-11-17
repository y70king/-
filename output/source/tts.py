import certifi, sys, asyncio
certifi.where=lambda:'/root/.ccr/ca-bundle.crt'
import edge_tts
async def main(text,out,rate,pitch):
  await edge_tts.Communicate(text,"ar-IQ-RanaNeural",rate=rate,pitch=pitch).save(out)
asyncio.run(main(sys.argv[1],sys.argv[2],sys.argv[3],sys.argv[4]))
