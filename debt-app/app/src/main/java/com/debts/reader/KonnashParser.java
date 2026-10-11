package com.debts.reader;

import java.text.Normalizer;
import java.util.*;

/**
 * يحلل تقرير "الوضع حسب العميل" من تطبيق Konnash.
 * الحروف العربية في الملف مخزنة كأشكال عرض (presentation forms) بترتيب بصري،
 * لذلك نرتبها حسب الموقع (من اليمين لليسار) ثم نطبّعها بـ NFKC.
 */
public class KonnashParser {
    public static class Glyph {
        final float x, y, w; final String text;
        public Glyph(float x, float y, float w, String text) { this.x = x; this.y = y; this.w = w; this.text = text; }
    }
    public static class Customer {
        public int index; public String name = ""; public String phone = "";
        public double gave, took, balance;

        /** المبلغ المتبقي على العميل (أعطيت - أخذت). عمود الرصيد في التقرير لا يُظهر الإشارة السالبة. */
        public double due() { return gave - took; }
    }

    private static final float ROW_TOL = 4f, CELL_GAP = 12f;

    /** glyphs of one page */
    public static List<Customer> parsePage(List<Glyph> glyphs) {
        List<Glyph> sorted = new ArrayList<>(glyphs);
        sorted.sort((a, b) -> Float.compare(a.y, b.y));
        List<List<Glyph>> lines = new ArrayList<>();
        List<Glyph> cur = null; float curY = -1000;
        for (Glyph g : sorted) {
            if (g.text == null || g.text.isEmpty()) continue;
            if (cur == null || g.y - curY > ROW_TOL) { cur = new ArrayList<>(); lines.add(cur); curY = g.y; }
            cur.add(g);
        }
        List<Customer> out = new ArrayList<>();
        for (List<Glyph> line : lines) {
            Customer c = parseLine(cells(line));
            if (c != null) out.add(c);
        }
        return out;
    }

    static List<String> cells(List<Glyph> line) {
        List<Glyph> l = new ArrayList<>(line);
        l.sort((a, b) -> Float.compare(a.x, b.x));
        List<List<Glyph>> groups = new ArrayList<>();
        List<Glyph> g = null; float end = -1000;
        for (Glyph q : l) {
            if (g == null || q.x - end > CELL_GAP) { g = new ArrayList<>(); groups.add(g); }
            g.add(q); end = Math.max(end, q.x + q.w);
        }
        List<String> res = new ArrayList<>(); // right-to-left order
        for (int i = groups.size() - 1; i >= 0; i--) res.add(cellText(groups.get(i)));
        return res;
    }

    static boolean isArabic(String s) {
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            if ((ch >= 0x0600 && ch <= 0x06FF) || (ch >= 0x0750 && ch <= 0x077F) || (ch >= 0xFB50 && ch <= 0xFDFF) || (ch >= 0xFE70 && ch <= 0xFEFF)) return true;
        }
        return false;
    }

    static String cellText(List<Glyph> gs) {
        StringBuilder all = new StringBuilder();
        for (Glyph q : gs) all.append(q.text);
        if (!isArabic(all.toString())) return all.toString().trim();
        // RTL: rightmost glyph first; keep embedded LTR runs (digits/latin) in their visual order
        List<Glyph> r = new ArrayList<>(gs);
        r.sort((a, b) -> Float.compare(b.x, a.x));
        StringBuilder sb = new StringBuilder();
        int i = 0;
        while (i < r.size()) {
            Glyph q = r.get(i);
            if (isLtr(q.text)) {
                int j = i;
                while (j + 1 < r.size() && isLtr(r.get(j + 1).text)) j++;
                for (int k = j; k >= i; k--) sb.append(r.get(k).text);
                i = j + 1;
            } else { sb.append(mirror(q.text)); i++; }
        }
        String s = Normalizer.normalize(sb.toString(), Normalizer.Form.NFKC);
        return s.replaceAll("\\s+", " ").trim();
    }

    /** الأقواس داخل النص العربي تظهر معكوسة بصرياً */
    static String mirror(String t) {
        switch (t) {
            case "(": return ")";
            case ")": return "(";
            case "[": return "]";
            case "]": return "[";
            case "{": return "}";
            case "}": return "{";
            case "<": return ">";
            case ">": return "<";
            default: return t;
        }
    }

    static boolean isLtr(String t) {
        if (t.isEmpty()) return false;
        char c = t.charAt(0);
        return Character.isLetterOrDigit(c) && !isArabic(t);
    }

    static boolean isAmount(String s) { return s.equals("-") || s.matches("-?[0-9][0-9.,]*"); }
    static boolean isPhone(String s) { return s.matches("\\+?[0-9]{7,}"); }

    static double amount(String s) {
        if (s.equals("-")) return 0;
        String t = s.replace(".", "").replace(",", ".");
        try { return Double.parseDouble(t); } catch (Exception e) { return 0; }
    }

    static Customer parseLine(List<String> cells) {
        if (cells.size() < 4) return null;
        String first = cells.get(0);
        if (!first.matches("[0-9]{1,5}")) return null;
        int n = cells.size();
        String bal = cells.get(n - 1), took = cells.get(n - 2), gave = cells.get(n - 3);
        if (!isAmount(bal) || !isAmount(took) || !isAmount(gave)) return null;
        Customer c = new Customer();
        c.index = Integer.parseInt(first);
        c.gave = amount(gave); c.took = amount(took); c.balance = amount(bal);
        StringBuilder name = new StringBuilder();
        for (int i = 1; i < n - 3; i++) {
            String s = cells.get(i);
            if (isPhone(s) && c.phone.isEmpty()) c.phone = s;
            else { if (name.length() > 0) name.append(' '); name.append(s); }
        }
        c.name = name.toString();
        return c;
    }
}
