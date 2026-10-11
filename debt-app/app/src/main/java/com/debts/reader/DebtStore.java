package com.debts.reader;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.List;
import java.util.TimeZone;

/**
 * التقرير لا يحتوي تواريخ، لذلك نحفظ محلياً تاريخ أول مرة ظهر فيها العميل مديناً
 * (ويمكن للمستخدم تعديله)، وتاريخ آخر تذكير واتساب أُرسل له.
 * التواريخ تُخزن كرقم اليوم منذ 1970 (epoch day) بالتوقيت المحلي.
 */
public class DebtStore {

    private final SharedPreferences since, reminded;

    public DebtStore(Context ctx) {
        since = ctx.getSharedPreferences("debt_since", Context.MODE_PRIVATE);
        reminded = ctx.getSharedPreferences("debt_reminded", Context.MODE_PRIVATE);
    }

    public static long today() {
        long now = System.currentTimeMillis();
        return (now + TimeZone.getDefault().getOffset(now)) / 86400000L;
    }

    public static String key(KonnashParser.Customer c) {
        return c.name + "|" + c.phone;
    }

    /** يحدّث التواريخ بعد قراءة تقرير جديد */
    public void update(List<KonnashParser.Customer> all) {
        long t = today();
        SharedPreferences.Editor e = since.edit();
        SharedPreferences.Editor r = reminded.edit();
        for (KonnashParser.Customer c : all) {
            String k = key(c);
            if (c.due() > 0.005) {
                if (!since.contains(k)) e.putLong(k, t);
            } else {
                // سدّد كامل المبلغ: نبدأ العدّ من جديد إذا استدان مرة أخرى
                e.remove(k);
                r.remove(k);
            }
        }
        e.apply();
        r.apply();
    }

    public long since(KonnashParser.Customer c) {
        return since.getLong(key(c), today());
    }

    public int days(KonnashParser.Customer c) {
        return (int) (today() - since(c));
    }

    public void setSince(KonnashParser.Customer c, long epochDay) {
        since.edit().putLong(key(c), epochDay).apply();
    }

    /** عدد الأيام منذ آخر تذكير، أو -1 إذا لم يُذكَّر */
    public int daysSinceReminder(KonnashParser.Customer c) {
        long d = reminded.getLong(key(c), -1);
        return d < 0 ? -1 : (int) (today() - d);
    }

    public void markReminded(KonnashParser.Customer c) {
        reminded.edit().putLong(key(c), today()).apply();
    }
}
