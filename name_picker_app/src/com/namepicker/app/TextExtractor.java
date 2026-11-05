package com.namepicker.app;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/** يستخرج النص من ملفات PDF و Word (.docx) والملفات النصية، ويحوّله إلى قائمة أسماء. */
final class TextExtractor {

    static final class UserError extends Exception {
        UserError(String msg) { super(msg); }
    }

    private TextExtractor() {}

    static String extract(byte[] data) throws UserError, IOException {
        if (startsWith(data, "%PDF") || indexOf(data, "%PDF-", 1024) >= 0) {
            String t = new PdfText(data).extract();
            if (names(t).isEmpty())
                throw new UserError("لم أجد نصاً في ملف PDF. قد يكون الملف صورة ممسوحة ضوئياً (سكانر) أو محمياً.");
            return t;
        }
        if (startsWith(data, "PK")) return docx(data);
        if (data.length > 8 && (data[0] & 0xff) == 0xD0 && (data[1] & 0xff) == 0xCF && (data[2] & 0xff) == 0x11 && (data[3] & 0xff) == 0xE0)
            throw new UserError("هذا ملف Word بالصيغة القديمة (.doc). افتحه في Word واحفظه بصيغة .docx أو PDF ثم أعد المحاولة.");
        return plainText(data);
    }

    // ---------------- Word (.docx) ----------------

    private static String docx(byte[] data) throws UserError, IOException {
        ZipInputStream zin = new ZipInputStream(new ByteArrayInputStream(data));
        ZipEntry e;
        String xml = null;
        while ((e = zin.getNextEntry()) != null) {
            if (e.getName().equals("word/document.xml")) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[16384];
                int n;
                while ((n = zin.read(buf)) > 0) out.write(buf, 0, n);
                xml = new String(out.toByteArray(), "UTF-8");
                break;
            }
        }
        zin.close();
        if (xml == null) throw new UserError("الملف ليس مستند Word صالحاً (.docx).");
        return docxXmlToText(xml);
    }

    static String docxXmlToText(String xml) {
        StringBuilder out = new StringBuilder();
        Matcher m = Pattern.compile("<(/?)w:(p|t|tab|br|cr|tc)(?=[\\s>/])[^>]*>").matcher(xml);
        int textStart = -1;
        boolean inPPr = false;
        while (m.find()) {
            boolean closing = !m.group(1).isEmpty();
            boolean self = m.group().endsWith("/>");
            String tag = m.group(2);
            switch (tag) {
                case "t":
                    if (!closing && !self) textStart = m.end();
                    else if (closing && textStart >= 0) {
                        out.append(unescape(xml.substring(textStart, m.start())));
                        textStart = -1;
                    }
                    break;
                case "p":
                case "tc":
                    if (closing || self) out.append('\n');
                    break;
                case "tab":
                    // علامات الجدولة داخل <w:tabs> هي إعدادات وليست نصاً
                    int tabsOpen = xml.lastIndexOf("<w:tabs>", m.start());
                    int tabsClose = xml.lastIndexOf("</w:tabs>", m.start());
                    if (tabsOpen <= tabsClose) out.append('\t');
                    break;
                default: // br, cr
                    out.append('\n');
            }
        }
        return out.toString().replace('\t', '\n');
    }

    private static String unescape(String s) {
        if (s.indexOf('&') < 0) return s;
        StringBuilder sb = new StringBuilder();
        Matcher m = Pattern.compile("&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);").matcher(s);
        int last = 0;
        while (m.find()) {
            sb.append(s, last, m.start());
            String g = m.group(1);
            if (g.equals("amp")) sb.append('&');
            else if (g.equals("lt")) sb.append('<');
            else if (g.equals("gt")) sb.append('>');
            else if (g.equals("quot")) sb.append('"');
            else if (g.equals("apos")) sb.append('\'');
            else if (g.startsWith("#x")) sb.appendCodePoint(Integer.parseInt(g.substring(2), 16));
            else sb.appendCodePoint(Integer.parseInt(g.substring(1)));
            last = m.end();
        }
        sb.append(s.substring(last));
        return sb.toString();
    }

    // ---------------- نص عادي ----------------

    private static String plainText(byte[] data) {
        int off = 0;
        if (data.length >= 3 && (data[0] & 0xff) == 0xEF && (data[1] & 0xff) == 0xBB && (data[2] & 0xff) == 0xBF) off = 3;
        if (data.length >= 2 && (data[0] & 0xff) == 0xFF && (data[1] & 0xff) == 0xFE)
            return new String(data, 2, data.length - 2, Charset.forName("UTF-16LE"));
        if (data.length >= 2 && (data[0] & 0xff) == 0xFE && (data[1] & 0xff) == 0xFF)
            return new String(data, 2, data.length - 2, Charset.forName("UTF-16BE"));
        try {
            return Charset.forName("UTF-8").newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(data, off, data.length - off)).toString();
        } catch (CharacterCodingException ex) {
            try {
                return new String(data, Charset.forName("windows-1256")); // ترميز عربي قديم
            } catch (Exception e2) {
                return new String(data, Charset.forName("ISO-8859-1"));
            }
        }
    }

    // ---------------- تحويل النص إلى أسماء ----------------

    private static final Pattern SPLIT = Pattern.compile("[\\n\\r,،;؛\\t]+");
    private static final Pattern NUMBERING = Pattern.compile("^[\\s\\-–•*●▪◦·]*[0-9٠-٩۰-۹]+\\s*[\\.\\-\\)\\(:/–]*\\s*");
    private static final Pattern TRAILING_NUMBER = Pattern.compile("\\s+(?:[.\\-)(:]+[0-9٠-٩۰-۹]+|[0-9٠-٩۰-۹]+[.\\-)(:]+)$");
    private static final Pattern BULLET = Pattern.compile("^[\\-–•*●▪◦·]+\\s*");

    /** يقسم النص إلى أسماء: سطر/فاصلة لكل اسم، ويحذف الترقيم والأسطر التي لا تحتوي أحرفاً. */
    static List<String> names(String text) {
        List<String> names = new ArrayList<>();
        for (String part : SPLIT.split(text)) {
            String n = part.trim();
            n = NUMBERING.matcher(n).replaceFirst("");
            n = BULLET.matcher(n).replaceFirst("");
            n = TRAILING_NUMBER.matcher(n).replaceFirst(""); // ترقيم ظهر في نهاية السطر بسبب اتجاه الكتابة
            n = n.replaceAll("\\s+", " ").trim();
            if (n.isEmpty() || !hasLetter(n)) continue;
            names.add(n);
        }
        return names;
    }

    private static boolean hasLetter(String s) {
        for (int i = 0; i < s.length(); i++) if (Character.isLetter(s.charAt(i))) return true;
        return false;
    }

    private static boolean startsWith(byte[] d, String p) {
        if (d.length < p.length()) return false;
        for (int i = 0; i < p.length(); i++) if (d[i] != p.charAt(i)) return false;
        return true;
    }

    private static int indexOf(byte[] d, String p, int limit) {
        outer:
        for (int i = 0; i + p.length() <= Math.min(d.length, limit); i++) {
            for (int k = 0; k < p.length(); k++) if (d[i + k] != p.charAt(k)) continue outer;
            return i;
        }
        return -1;
    }
}
