"""Embed Noto Naskh Arabic (regular + bold) into a .docx (Word obfuscated-font format)."""
import sys, zipfile, uuid, re, shutil

FONTS = {"Noto Naskh Arabic": {
    "embedRegular": "/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf",
    "embedBold": "/usr/share/fonts/truetype/noto/NotoNaskhArabic-Bold.ttf"}}

def obfuscate(data, guid):
    h = guid.strip("{}").replace("-", "")
    key = bytes(int(h[30 - 2 * i:32 - 2 * i], 16) for i in range(16))
    b = bytearray(data)
    for i in range(32):
        b[i] ^= key[i % 16]
    return bytes(b)

def embed(path):
    src = zipfile.ZipFile(path)
    files = {n: src.read(n) for n in src.namelist()}
    src.close()
    ft = files["word/fontTable.xml"].decode()
    rels = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">']
    n = 0; entries = ""
    for name, kinds in FONTS.items():
        embeds = ""
        for kind, fpath in kinds.items():
            n += 1
            guid = "{" + str(uuid.uuid4()).upper() + "}"
            files[f"word/fonts/font{n}.odttf"] = obfuscate(open(fpath, "rb").read(), guid)
            rels.append(f'<Relationship Id="rIdF{n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font" Target="fonts/font{n}.odttf"/>')
            embeds += f'<w:{kind} r:id="rIdF{n}" w:fontKey="{guid}"/>'
        entries += (f'<w:font w:name="{name}"><w:charset w:val="B2"/><w:family w:val="roman"/>'
                    f'<w:pitch w:val="variable"/>{embeds}</w:font>')
    rels.append("</Relationships>")
    if 'xmlns:r=' not in ft[:600]:
        ft = ft.replace("<w:fonts ", '<w:fonts xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ', 1)
    ft = ft.replace("</w:fonts>", entries + "</w:fonts>")
    files["word/fontTable.xml"] = ft.encode()
    files["word/_rels/fontTable.xml.rels"] = "\n".join(rels).encode()
    ct = files["[Content_Types].xml"].decode()
    if 'Extension="odttf"' not in ct:
        ct = ct.replace("<Default ", '<Default Extension="odttf" ContentType="application/vnd.openxmlformats-officedocument.obfuscatedFont"/><Default ', 1)
    files["[Content_Types].xml"] = ct.encode()
    tmp = path + ".tmp"
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", files.pop("[Content_Types].xml"))
        for k, v in files.items():
            z.writestr(k, v)
    shutil.move(tmp, path)

if __name__ == "__main__":
    embed(sys.argv[1])
