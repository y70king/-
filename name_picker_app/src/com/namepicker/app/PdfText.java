package com.namepicker.app;

import java.io.ByteArrayOutputStream;
import java.nio.charset.Charset;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.Inflater;

/**
 * مستخرج نصوص خفيف لملفات PDF (بدون مكتبات خارجية).
 * يدعم: FlateDecode، Object Streams، خطوط Type0/CID مع ToUnicode، النص العربي
 * (يُعاد ترتيبه من الترتيب البصري إلى ترتيب القراءة)، والجداول.
 * لا يدعم ملفات PDF المصوّرة (السكانر) لأنها لا تحتوي نصاً أصلاً.
 */
final class PdfText {

    private static final Charset ISO = Charset.forName("ISO-8859-1");

    // ---------------- أنواع كائنات PDF ----------------

    static final class Name {
        final String v;
        Name(String v) { this.v = v; }
        @Override public boolean equals(Object o) { return o instanceof Name && ((Name) o).v.equals(v); }
        @Override public int hashCode() { return v.hashCode(); }
    }

    static final class Ref {
        final int num;
        Ref(int n) { num = n; }
    }

    static final class PStream {
        final Map<String, Object> dict;
        final byte[] raw;
        PStream(Map<String, Object> d, byte[] r) { dict = d; raw = r; }
    }

    static final class Op {
        final String v;
        Op(String v) { this.v = v; }
    }

    static final Object EOF = new Object();
    static final Object ARR_END = new Object();
    static final Object DICT_END = new Object();
    static final Object NULL = new Object();

    // ---------------- المحلل اللفظي ----------------

    static final class Parser {
        final byte[] b;
        int p;
        final int end;

        Parser(byte[] b, int p, int end) { this.b = b; this.p = p; this.end = end; }

        static boolean ws(int c) { return c == 0 || c == 9 || c == 10 || c == 12 || c == 13 || c == 32; }

        static boolean delim(int c) {
            return c == '(' || c == ')' || c == '<' || c == '>' || c == '[' || c == ']'
                    || c == '{' || c == '}' || c == '/' || c == '%';
        }

        void skipWs() {
            while (p < end) {
                int c = b[p] & 0xff;
                if (ws(c)) p++;
                else if (c == '%') { while (p < end && b[p] != '\n' && b[p] != '\r') p++; }
                else break;
            }
        }

        /** كائن مع دعم المراجع "n g R". */
        Object nextObj() {
            Object o = next();
            if (o instanceof Double && isInt((Double) o)) {
                int save = p;
                Object o2 = next();
                if (o2 instanceof Double && isInt((Double) o2)) {
                    Object o3 = next();
                    if (o3 instanceof Op && ((Op) o3).v.equals("R")) return new Ref(((Double) o).intValue());
                }
                p = save;
            }
            return o;
        }

        static boolean isInt(Double d) { return d >= 0 && d == Math.floor(d) && d < 1e9; }

        Object next() {
            skipWs();
            if (p >= end) return EOF;
            int c = b[p] & 0xff;
            if (c == '/') {
                p++;
                int s = p;
                while (p < end && !ws(b[p] & 0xff) && !delim(b[p] & 0xff)) p++;
                return new Name(decodeName(s, p));
            }
            if (c == '(') return literal();
            if (c == '<') {
                if (p + 1 < end && b[p + 1] == '<') { p += 2; return dict(); }
                return hex();
            }
            if (c == '[') {
                p++;
                List<Object> l = new ArrayList<>();
                while (true) {
                    Object o = nextObj();
                    if (o == EOF || o == ARR_END) break;
                    if (o == DICT_END) continue;
                    l.add(o);
                }
                return l;
            }
            if (c == ']') { p++; return ARR_END; }
            if (c == '>') {
                if (p + 1 < end && b[p + 1] == '>') { p += 2; return DICT_END; }
                p++;
                return next();
            }
            if (c == '{' || c == '}' || c == ')') { p++; return next(); }
            if (c == '+' || c == '-' || c == '.' || (c >= '0' && c <= '9')) {
                int s = p;
                p++;
                while (p < end) {
                    int d = b[p] & 0xff;
                    if ((d >= '0' && d <= '9') || d == '.' || d == '-') p++;
                    else break;
                }
                try {
                    return Double.parseDouble(new String(b, s, p - s, ISO));
                } catch (NumberFormatException e) {
                    return 0.0;
                }
            }
            int s = p;
            while (p < end && !ws(b[p] & 0xff) && !delim(b[p] & 0xff)) p++;
            if (p == s) { p++; return next(); }
            String k = new String(b, s, p - s, ISO);
            if (k.equals("true")) return Boolean.TRUE;
            if (k.equals("false")) return Boolean.FALSE;
            if (k.equals("null")) return NULL;
            return new Op(k);
        }

        private String decodeName(int s, int e) {
            StringBuilder sb = new StringBuilder();
            for (int i = s; i < e; i++) {
                int c = b[i] & 0xff;
                if (c == '#' && i + 2 < e) {
                    int h = hexVal(b[i + 1]), l = hexVal(b[i + 2]);
                    if (h >= 0 && l >= 0) { sb.append((char) (h * 16 + l)); i += 2; continue; }
                }
                sb.append((char) c);
            }
            return sb.toString();
        }

        private Map<String, Object> dict() {
            Map<String, Object> m = new HashMap<>();
            while (true) {
                Object k = nextObj();
                if (k == EOF || k == DICT_END) break;
                if (!(k instanceof Name)) continue;
                Object v = nextObj();
                if (v == DICT_END) break;
                if (v == EOF) break;
                m.put(((Name) k).v, v);
            }
            return m;
        }

        private byte[] literal() {
            p++;
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            int depth = 1;
            while (p < end) {
                int c = b[p++] & 0xff;
                if (c == '\\' && p < end) {
                    int n = b[p++] & 0xff;
                    switch (n) {
                        case 'n': out.write('\n'); break;
                        case 'r': out.write('\r'); break;
                        case 't': out.write('\t'); break;
                        case 'b': out.write('\b'); break;
                        case 'f': out.write('\f'); break;
                        case '\r': if (p < end && b[p] == '\n') p++; break;
                        case '\n': break;
                        default:
                            if (n >= '0' && n <= '7') {
                                int v = n - '0';
                                for (int k = 0; k < 2 && p < end && b[p] >= '0' && b[p] <= '7'; k++) v = v * 8 + (b[p++] - '0');
                                out.write(v & 0xff);
                            } else {
                                out.write(n);
                            }
                    }
                } else if (c == '(') {
                    depth++;
                    out.write(c);
                } else if (c == ')') {
                    if (--depth == 0) break;
                    out.write(c);
                } else {
                    out.write(c);
                }
            }
            return out.toByteArray();
        }

        private byte[] hex() {
            p++;
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            int hi = -1;
            while (p < end) {
                int c = b[p++] & 0xff;
                if (c == '>') break;
                int v = hexVal((byte) c);
                if (v < 0) continue;
                if (hi < 0) hi = v;
                else { out.write(hi * 16 + v); hi = -1; }
            }
            if (hi >= 0) out.write(hi * 16);
            return out.toByteArray();
        }
    }

    static int hexVal(byte c) {
        if (c >= '0' && c <= '9') return c - '0';
        if (c >= 'a' && c <= 'f') return c - 'a' + 10;
        if (c >= 'A' && c <= 'F') return c - 'A' + 10;
        return -1;
    }

    // ---------------- فهرس الكائنات ----------------

    private final byte[] data;
    private final Map<Integer, Integer> offsets = new HashMap<>();
    private final Map<Integer, Object> cache = new HashMap<>();
    private final Set<Integer> loading = new HashSet<>();
    private final String latin;

    PdfText(byte[] data) {
        this.data = data;
        this.latin = new String(data, ISO);
        Matcher m = Pattern.compile("(?<![0-9])(\\d{1,9})\\s+(\\d{1,5})\\s+obj\\b").matcher(latin);
        while (m.find()) offsets.put(Integer.parseInt(m.group(1)), m.end());
        loadObjectStreams();
    }

    private void loadObjectStreams() {
        for (Map.Entry<Integer, Integer> e : new ArrayList<>(offsets.entrySet())) {
            int off = e.getValue();
            String head = latin.substring(off, Math.min(latin.length(), off + 400));
            if (!head.contains("/ObjStm")) continue;
            Object o = get(e.getKey());
            if (!(o instanceof PStream)) continue;
            PStream s = (PStream) o;
            byte[] d = decode(s);
            if (d == null) continue;
            int n = intOf(s.dict.get("N"), 0), first = intOf(s.dict.get("First"), 0);
            Parser hp = new Parser(d, 0, Math.min(first, d.length));
            for (int i = 0; i < n; i++) {
                Object num = hp.next(), rel = hp.next();
                if (!(num instanceof Double) || !(rel instanceof Double)) break;
                int on = ((Double) num).intValue();
                if (offsets.containsKey(on) || cache.containsKey(on)) continue;
                int start = first + ((Double) rel).intValue();
                if (start < 0 || start >= d.length) continue;
                cache.put(on, new Parser(d, start, d.length).nextObj());
            }
        }
    }

    private Object get(int num) {
        if (cache.containsKey(num)) return cache.get(num);
        Integer off = offsets.get(num);
        if (off == null || loading.contains(num)) return null;
        loading.add(num);
        Object o;
        try {
            o = parseAt(off);
        } catch (RuntimeException ex) {
            o = null;
        }
        loading.remove(num);
        cache.put(num, o);
        return o;
    }

    private Object parseAt(int off) {
        Parser p = new Parser(data, off, data.length);
        Object o = p.nextObj();
        if (!(o instanceof Map)) return o;
        @SuppressWarnings("unchecked") Map<String, Object> dict = (Map<String, Object>) o;
        p.skipWs();
        if (!latin.startsWith("stream", p.p)) return dict;
        int start = p.p + 6;
        if (start < data.length && data[start] == '\r') start++;
        if (start < data.length && data[start] == '\n') start++;
        int len = intOf(resolve(dict.get("Length")), -1);
        int stop = -1;
        if (len >= 0 && start + len <= data.length) {
            int q = start + len;
            while (q < data.length && Parser.ws(data[q] & 0xff)) q++;
            if (latin.startsWith("endstream", q)) stop = start + len;
        }
        if (stop < 0) {
            int es = latin.indexOf("endstream", start);
            if (es < 0) es = data.length;
            stop = es;
            if (stop > start && data[stop - 1] == '\n') stop--;
            if (stop > start && data[stop - 1] == '\r') stop--;
        }
        byte[] raw = new byte[Math.max(0, stop - start)];
        System.arraycopy(data, start, raw, 0, raw.length);
        return new PStream(dict, raw);
    }

    private Object resolve(Object o) {
        int guard = 0;
        while (o instanceof Ref && guard++ < 32) o = get(((Ref) o).num);
        return o == NULL ? null : o;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> dictOf(Object o) {
        o = resolve(o);
        if (o instanceof Map) return (Map<String, Object>) o;
        if (o instanceof PStream) return ((PStream) o).dict;
        return null;
    }

    @SuppressWarnings("unchecked")
    private List<Object> listOf(Object o) {
        o = resolve(o);
        if (o instanceof List) return (List<Object>) o;
        if (o == null) return Collections.emptyList();
        List<Object> l = new ArrayList<>();
        l.add(o);
        return l;
    }

    private static int intOf(Object o, int def) {
        return o instanceof Double ? ((Double) o).intValue() : def;
    }

    private static double num(Object o) {
        return o instanceof Double ? (Double) o : 0;
    }

    private static String nameOf(Object o) {
        return o instanceof Name ? ((Name) o).v : null;
    }

    // ---------------- فك الضغط ----------------

    private byte[] decode(PStream s) {
        byte[] d = s.raw;
        for (Object f : listOf(s.dict.get("Filter"))) {
            String fn = nameOf(resolve(f));
            if (fn == null) continue;
            if (fn.equals("FlateDecode") || fn.equals("Fl")) d = inflate(d);
            else if (fn.equals("ASCIIHexDecode") || fn.equals("AHx")) d = new Parser(("<" + new String(d, ISO) + ">").getBytes(ISO), 0, d.length + 2).hex();
            else return null; // صور أو فلاتر غير مدعومة
            if (d == null) return null;
        }
        return d;
    }

    private static byte[] inflate(byte[] in) {
        byte[] r = inflate(in, false);
        if (r.length == 0) r = inflate(in, true);
        return r;
    }

    private static byte[] inflate(byte[] in, boolean nowrap) {
        Inflater inf = new Inflater(nowrap);
        inf.setInput(in);
        ByteArrayOutputStream out = new ByteArrayOutputStream(Math.max(64, in.length * 3));
        byte[] buf = new byte[16384];
        try {
            while (!inf.finished()) {
                int n = inf.inflate(buf);
                if (n == 0) {
                    if (inf.needsInput() || inf.needsDictionary()) break;
                }
                out.write(buf, 0, n);
            }
        } catch (Exception ignored) {
            // نعيد ما أمكن فكه
        } finally {
            inf.end();
        }
        return out.toByteArray();
    }

    // ---------------- الصفحات ----------------

    private static final class Page {
        final Map<String, Object> dict;
        final Map<String, Object> resources;
        Page(Map<String, Object> d, Map<String, Object> r) { dict = d; resources = r; }
    }

    private List<Page> pages() {
        List<Page> out = new ArrayList<>();
        Map<String, Object> catalog = null;
        Matcher m = Pattern.compile("/Root\\s+(\\d+)\\s+\\d+\\s+R").matcher(latin);
        while (m.find()) {
            Map<String, Object> c = dictOf(new Ref(Integer.parseInt(m.group(1))));
            if (c != null && c.get("Pages") != null) catalog = c;
        }
        if (catalog == null) {
            for (int n : allNums()) {
                Map<String, Object> d = dictOf(new Ref(n));
                if (d != null && "Catalog".equals(nameOf(d.get("Type")))) { catalog = d; break; }
            }
        }
        if (catalog != null) walk(catalog.get("Pages"), null, out, 0, new HashSet<Object>());
        if (out.isEmpty()) {
            for (int n : allNums()) {
                Map<String, Object> d = dictOf(new Ref(n));
                if (d != null && "Page".equals(nameOf(d.get("Type")))) out.add(new Page(d, dictOf(d.get("Resources"))));
            }
        }
        return out;
    }

    private Set<Integer> allNums() {
        TreeSet<Integer> s = new TreeSet<>(offsets.keySet());
        s.addAll(cache.keySet());
        return s;
    }

    private void walk(Object node, Map<String, Object> inhRes, List<Page> out, int depth, Set<Object> seen) {
        Map<String, Object> d = dictOf(node);
        if (d == null || depth > 64 || !seen.add(d)) return;
        Map<String, Object> res = dictOf(d.get("Resources"));
        if (res == null) res = inhRes;
        if (d.containsKey("Kids")) {
            for (Object k : listOf(d.get("Kids"))) walk(k, res, out, depth + 1, seen);
        } else {
            out.add(new Page(d, res));
        }
    }

    // ---------------- الخطوط ----------------

    private static final class Font {
        boolean twoByte;
        final Map<Integer, String> toUni = new HashMap<>();
        final Map<Integer, Double> widths = new HashMap<>();
        double defaultWidth = 500;
    }

    private final Map<Object, Font> fontCache = new HashMap<>();
    private static final Charset CP1252 = safeCharset("windows-1252");

    private static Charset safeCharset(String n) {
        try { return Charset.forName(n); } catch (Exception e) { return ISO; }
    }

    private Font font(Object ref) {
        Object key = ref instanceof Ref ? (Object) ((Ref) ref).num : ref;
        if (key == null) return null;
        Font f = fontCache.get(key);
        if (f != null) return f;
        f = new Font();
        fontCache.put(key, f);
        Map<String, Object> d = dictOf(ref);
        if (d == null) return f;
        String sub = nameOf(d.get("Subtype"));
        if ("Type0".equals(sub)) {
            f.twoByte = true;
            f.defaultWidth = 1000;
            List<Object> desc = listOf(d.get("DescendantFonts"));
            Map<String, Object> cid = desc.isEmpty() ? null : dictOf(desc.get(0));
            if (cid != null) {
                Object dw = resolve(cid.get("DW"));
                if (dw instanceof Double) f.defaultWidth = (Double) dw;
                List<Object> w = listOf(cid.get("W"));
                int i = 0;
                while (i < w.size()) {
                    Object a = resolve(w.get(i));
                    Object b = i + 1 < w.size() ? resolve(w.get(i + 1)) : null;
                    if (!(a instanceof Double)) { i++; continue; }
                    int c0 = ((Double) a).intValue();
                    if (b instanceof List) {
                        List<Object> arr = listOf(b);
                        for (int k = 0; k < arr.size(); k++) f.widths.put(c0 + k, num(resolve(arr.get(k))));
                        i += 2;
                    } else if (b instanceof Double && i + 2 < w.size()) {
                        int c1 = ((Double) b).intValue();
                        double wv = num(resolve(w.get(i + 2)));
                        for (int c = c0; c <= c1 && c - c0 < 65536; c++) f.widths.put(c, wv);
                        i += 3;
                    } else {
                        i++;
                    }
                }
            }
        } else {
            int first = intOf(resolve(d.get("FirstChar")), 0);
            List<Object> w = listOf(d.get("Widths"));
            for (int k = 0; k < w.size(); k++) f.widths.put(first + k, num(resolve(w.get(k))));
            if (!w.isEmpty()) f.defaultWidth = 0;
        }
        Object tu = resolve(d.get("ToUnicode"));
        if (tu instanceof PStream) {
            byte[] cm = decode((PStream) tu);
            if (cm != null) parseCMap(cm, f);
        }
        return f;
    }

    private static void parseCMap(byte[] cm, Font f) {
        Parser p = new Parser(cm, 0, cm.length);
        List<Object> ops = new ArrayList<>();
        while (true) {
            Object o = p.next();
            if (o == EOF) break;
            if (o instanceof Op) {
                String v = ((Op) o).v;
                if (v.equals("endbfchar")) {
                    for (int i = 0; i + 1 < ops.size(); i += 2) {
                        if (ops.get(i) instanceof byte[] && ops.get(i + 1) instanceof byte[])
                            f.toUni.put(code((byte[]) ops.get(i)), utf16((byte[]) ops.get(i + 1)));
                    }
                } else if (v.equals("endbfrange")) {
                    for (int i = 0; i + 2 < ops.size(); i += 3) {
                        if (!(ops.get(i) instanceof byte[]) || !(ops.get(i + 1) instanceof byte[])) continue;
                        int lo = code((byte[]) ops.get(i)), hi = code((byte[]) ops.get(i + 1));
                        Object dst = ops.get(i + 2);
                        if (hi - lo > 65536 || hi < lo) continue;
                        if (dst instanceof byte[]) {
                            byte[] base = (byte[]) dst;
                            for (int c = lo; c <= hi; c++) {
                                byte[] cur = base.clone();
                                int n = cur.length;
                                if (n >= 2) {
                                    int last = ((cur[n - 2] & 0xff) << 8 | (cur[n - 1] & 0xff)) + (c - lo);
                                    cur[n - 2] = (byte) (last >> 8);
                                    cur[n - 1] = (byte) last;
                                } else if (n == 1) {
                                    cur[0] = (byte) ((cur[0] & 0xff) + (c - lo));
                                }
                                f.toUni.put(c, utf16(cur));
                            }
                        } else if (dst instanceof List) {
                            List<?> arr = (List<?>) dst;
                            for (int k = 0; k < arr.size() && lo + k <= hi; k++)
                                if (arr.get(k) instanceof byte[]) f.toUni.put(lo + k, utf16((byte[]) arr.get(k)));
                        }
                    }
                }
                ops.clear();
            } else {
                ops.add(o);
            }
        }
    }

    private static int code(byte[] b) {
        int v = 0;
        for (byte x : b) v = (v << 8) | (x & 0xff);
        return v;
    }

    private static String utf16(byte[] b) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i + 1 < b.length; i += 2) sb.append((char) ((b[i] & 0xff) << 8 | (b[i + 1] & 0xff)));
        if (b.length == 1) sb.append((char) (b[0] & 0xff));
        String s = sb.toString();
        // الأحرف المركبة (مثل لا) تُعكس مسبقاً لأن السطر العربي سيُعكس لاحقاً بالكامل
        if (s.length() > 1 && hasRtl(s)) s = new StringBuilder(s).reverse().toString();
        return s;
    }

    // ---------------- تفسير محتوى الصفحة ----------------

    private static final class Chunk {
        double x0, x1, y, size;
        final StringBuilder text = new StringBuilder();
    }

    private static final class GState {
        double[] ctm = {1, 0, 0, 1, 0, 0};
        Font font;
        double fontSize = 12, tc, tw, th = 1, tl;

        GState copy() {
            GState g = new GState();
            g.ctm = ctm.clone();
            g.font = font; g.fontSize = fontSize; g.tc = tc; g.tw = tw; g.th = th; g.tl = tl;
            return g;
        }
    }

    private static double[] mul(double[] m1, double[] m2) {
        return new double[]{
                m1[0] * m2[0] + m1[1] * m2[2], m1[0] * m2[1] + m1[1] * m2[3],
                m1[2] * m2[0] + m1[3] * m2[2], m1[2] * m2[1] + m1[3] * m2[3],
                m1[4] * m2[0] + m1[5] * m2[2] + m2[4], m1[4] * m2[1] + m1[5] * m2[3] + m2[5]};
    }

    private final class Interp {
        final List<Chunk> chunks = new ArrayList<>();
        GState gs = new GState();
        final List<GState> stack = new ArrayList<>();
        double[] tm = {1, 0, 0, 1, 0, 0}, tlm = {1, 0, 0, 1, 0, 0};
        int depth = 0;

        void run(byte[] content, Map<String, Object> res) {
            Parser p = new Parser(content, 0, content.length);
            List<Object> args = new ArrayList<>();
            int count = 0;
            while (count++ < 5_000_000) {
                Object o = p.next();
                if (o == EOF) break;
                if (!(o instanceof Op)) { args.add(o); continue; }
                String op = ((Op) o).v;
                try {
                    exec(op, args, res, p);
                } catch (RuntimeException ignored) {
                    // نتجاهل الأوامر التالفة
                }
                args.clear();
            }
        }

        double a(List<Object> args, int i) {
            return i < args.size() ? num(args.get(i)) : 0;
        }

        void exec(String op, List<Object> args, Map<String, Object> res, Parser p) {
            switch (op) {
                case "q": stack.add(gs.copy()); break;
                case "Q": if (!stack.isEmpty()) gs = stack.remove(stack.size() - 1); break;
                case "cm":
                    if (args.size() >= 6) gs.ctm = mul(new double[]{a(args, 0), a(args, 1), a(args, 2), a(args, 3), a(args, 4), a(args, 5)}, gs.ctm);
                    break;
                case "BT": tm = new double[]{1, 0, 0, 1, 0, 0}; tlm = tm.clone(); break;
                case "Tf": {
                    Map<String, Object> fonts = res == null ? null : dictOf(res.get("Font"));
                    String fn = args.isEmpty() ? null : nameOf(args.get(0));
                    gs.font = fonts != null && fn != null && fonts.get(fn) != null ? font(fonts.get(fn)) : null;
                    gs.fontSize = a(args, 1);
                    break;
                }
                case "Tc": gs.tc = a(args, 0); break;
                case "Tw": gs.tw = a(args, 0); break;
                case "Tz": gs.th = a(args, 0) / 100.0; break;
                case "TL": gs.tl = a(args, 0); break;
                case "Td": td(a(args, 0), a(args, 1)); break;
                case "TD": gs.tl = -a(args, 1); td(a(args, 0), a(args, 1)); break;
                case "Tm":
                    tlm = new double[]{a(args, 0), a(args, 1), a(args, 2), a(args, 3), a(args, 4), a(args, 5)};
                    tm = tlm.clone();
                    break;
                case "T*": td(0, -gs.tl); break;
                case "Tj": if (!args.isEmpty()) show(args.get(0)); break;
                case "'": td(0, -gs.tl); if (!args.isEmpty()) show(args.get(args.size() - 1)); break;
                case "\"":
                    gs.tw = a(args, 0); gs.tc = a(args, 1); td(0, -gs.tl);
                    if (args.size() > 2) show(args.get(2));
                    break;
                case "TJ":
                    if (!args.isEmpty() && args.get(0) instanceof List) {
                        for (Object e : (List<?>) args.get(0)) {
                            if (e instanceof Double) {
                                double tx = -((Double) e) / 1000.0 * gs.fontSize * gs.th;
                                tm = mul(new double[]{1, 0, 0, 1, tx, 0}, tm);
                            } else {
                                show(e);
                            }
                        }
                    }
                    break;
                case "Do": doXObject(args, res); break;
                case "ID": skipInlineImage(p); break;
                default: break;
            }
        }

        void td(double tx, double ty) {
            tlm = mul(new double[]{1, 0, 0, 1, tx, ty}, tlm);
            tm = tlm.clone();
        }

        void show(Object s) {
            if (!(s instanceof byte[]) || gs.font == null) return;
            byte[] b = (byte[]) s;
            Font f = gs.font;
            Chunk c = new Chunk();
            double[] trm = mul(tm, gs.ctm);
            c.x0 = trm[4];
            c.y = trm[5];
            double scale = Math.hypot(trm[2], trm[3]);
            c.size = Math.abs(gs.fontSize) * (scale > 0 ? scale : 1);
            if (c.size < 0.5) c.size = 0.5;
            int step = f.twoByte ? 2 : 1;
            for (int i = 0; i + step - 1 < b.length; i += step) {
                int code = f.twoByte ? ((b[i] & 0xff) << 8 | (b[i + 1] & 0xff)) : (b[i] & 0xff);
                String u = f.toUni.get(code);
                if (u == null) {
                    if (f.twoByte) u = "";
                    else u = new String(new byte[]{(byte) code}, CP1252);
                }
                c.text.append(u);
                Double w = f.widths.get(code);
                double wv = w != null ? w : f.defaultWidth;
                double tx = (wv / 1000.0 * gs.fontSize + gs.tc + (step == 1 && code == 32 ? gs.tw : 0)) * gs.th;
                tm = mul(new double[]{1, 0, 0, 1, tx, 0}, tm);
            }
            double[] end = mul(tm, gs.ctm);
            c.x1 = end[4];
            if (c.x1 < c.x0) { double t = c.x0; c.x0 = c.x1; c.x1 = t; }
            if (c.text.length() > 0) chunks.add(c);
        }

        void doXObject(List<Object> args, Map<String, Object> res) {
            if (depth > 6 || args.isEmpty() || res == null) return;
            Map<String, Object> xo = dictOf(res.get("XObject"));
            String n = nameOf(args.get(0));
            if (xo == null || n == null) return;
            Object o = resolve(xo.get(n));
            if (!(o instanceof PStream)) return;
            PStream s = (PStream) o;
            if (!"Form".equals(nameOf(resolve(s.dict.get("Subtype"))))) return;
            byte[] d = decode(s);
            if (d == null) return;
            Map<String, Object> r2 = dictOf(s.dict.get("Resources"));
            stack.add(gs.copy());
            List<Object> mt = listOf(s.dict.get("Matrix"));
            if (mt.size() == 6) {
                double[] m = new double[6];
                for (int i = 0; i < 6; i++) m[i] = num(resolve(mt.get(i)));
                gs.ctm = mul(m, gs.ctm);
            }
            double[] stm = tm, stlm = tlm;
            depth++;
            run(d, r2 != null ? r2 : res);
            depth--;
            tm = stm; tlm = stlm;
            gs = stack.remove(stack.size() - 1);
        }

        void skipInlineImage(Parser p) {
            int i = p.p + 1;
            byte[] b = p.b;
            while (i + 2 < p.end) {
                if (Parser.ws(b[i] & 0xff) && b[i + 1] == 'E' && b[i + 2] == 'I'
                        && (i + 3 >= p.end || Parser.ws(b[i + 3] & 0xff))) {
                    p.p = i + 3;
                    return;
                }
                i++;
            }
            p.p = p.end;
        }
    }

    // ---------------- تجميع الأسطر ----------------

    /** يُرجع النص؛ كل سطر (أو خلية جدول) في سطر مستقل. */
    String extract() {
        StringBuilder out = new StringBuilder();
        for (Page pg : pages()) {
            ByteArrayOutputStream content = new ByteArrayOutputStream();
            for (Object c : listOf(pg.dict.get("Contents"))) {
                Object s = resolve(c);
                if (s instanceof PStream) {
                    byte[] d = decode((PStream) s);
                    if (d != null) { content.write(d, 0, d.length); content.write('\n'); }
                }
            }
            Interp in = new Interp();
            in.run(content.toByteArray(), pg.resources);
            appendLines(in.chunks, out);
        }
        return java.text.Normalizer.normalize(out.toString(), java.text.Normalizer.Form.NFKC);
    }

    private static void appendLines(List<Chunk> chunks, StringBuilder out) {
        if (chunks.isEmpty()) return;
        List<Chunk> sorted = new ArrayList<>(chunks);
        Collections.sort(sorted, new Comparator<Chunk>() {
            public int compare(Chunk a, Chunk b) { return Double.compare(b.y, a.y); }
        });
        List<List<Chunk>> lines = new ArrayList<>();
        List<Chunk> cur = null;
        double curY = 0, curSize = 0;
        for (Chunk c : sorted) {
            if (cur != null && Math.abs(c.y - curY) <= Math.max(curSize, c.size) * 0.45) {
                cur.add(c);
            } else {
                cur = new ArrayList<>();
                lines.add(cur);
                curY = c.y;
                curSize = c.size;
            }
            if (cur.isEmpty()) cur.add(c);
        }
        for (List<Chunk> line : lines) {
            Collections.sort(line, new Comparator<Chunk>() {
                public int compare(Chunk a, Chunk b) { return Double.compare(a.x0, b.x0); }
            });
            // تقسيم السطر إلى مقاطع عند الفراغات الكبيرة (أعمدة الجداول)
            List<String> segs = new ArrayList<>();
            StringBuilder seg = new StringBuilder();
            Chunk prev = null;
            for (Chunk c : line) {
                if (prev != null) {
                    double gap = c.x0 - prev.x1;
                    double sz = Math.max(prev.size, c.size);
                    if (gap > sz * 1.0) {
                        segs.add(seg.toString());
                        seg.setLength(0);
                    } else if (gap > sz * 0.15 && seg.length() > 0
                            && seg.charAt(seg.length() - 1) != ' ' && c.text.charAt(0) != ' ') {
                        seg.append(' ');
                    }
                }
                seg.append(c.text);
                prev = c;
            }
            segs.add(seg.toString());
            boolean rtlLine = false;
            for (int i = 0; i < segs.size(); i++) {
                String s = segs.get(i);
                if (hasRtl(s)) { rtlLine = true; segs.set(i, visualToLogical(s)); }
            }
            if (rtlLine) Collections.reverse(segs);
            for (String s : segs) {
                String t = s.trim();
                if (!t.isEmpty()) out.append(t).append('\n');
            }
        }
        out.append('\n');
    }

    static boolean isRtl(char c) {
        if ((c >= 0x0660 && c <= 0x0669) || (c >= 0x06F0 && c <= 0x06F9)) return false; // الأرقام تُكتب يساراً←يميناً
        return (c >= 0x0590 && c <= 0x08FF) || (c >= 0xFB1D && c <= 0xFDFF) || (c >= 0xFE70 && c <= 0xFEFF);
    }

    static boolean hasRtl(String s) {
        for (int i = 0; i < s.length(); i++) if (isRtl(s.charAt(i))) return true;
        return false;
    }

    /** يحوّل النص من ترتيب العرض (يسار←يمين) إلى ترتيب القراءة العربي. */
    static String visualToLogical(String s) {
        StringBuilder r = new StringBuilder(s).reverse();
        // إعادة الكلمات اللاتينية والأرقام إلى اتجاهها الصحيح
        int i = 0;
        while (i < r.length()) {
            if (isLtrStrong(r.charAt(i))) {
                int j = i;
                int lastStrong = i;
                while (j < r.length() && !isRtl(r.charAt(j))) {
                    if (isLtrStrong(r.charAt(j))) lastStrong = j;
                    j++;
                }
                String run = r.substring(i, lastStrong + 1);
                String fixed = new StringBuilder(run).reverse().toString();
                r.replace(i, lastStrong + 1, fixed);
                i = lastStrong + 1;
            } else {
                i++;
            }
        }
        return r.toString();
    }

    private static boolean isLtrStrong(char c) {
        return Character.isLetterOrDigit(c) && !isRtl(c);
    }
}
