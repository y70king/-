package com.clinic.booking;

import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.provider.Settings;
import android.text.TextUtils;

public class Prefs {
    // رسائل المحادثة التلقائية مع الزبون
    public static final String DEF_MSG_BOOKED =
            "تم تسجيل حجز {name} ✅\nرقم الدور: {n}\n\nالرجاء إرسال عمر المريض/ة 🎂";
    public static final String DEF_MSG_AGE_AGAIN =
            "الرجاء إرسال عمر المريض/ة بالأرقام فقط (مثال: 25)";
    public static final String DEF_MSG_PAYMENT =
            "شكراً، تم تسجيل العمر: {age}\n\nطريقة دفع الكشفية {fee}:\n" +
            "اكتب «يدوي» إذا كنت تريد أن تدفعها في العيادة 💵\n" +
            "اكتب «الان» إذا كنت تريد أن تدفعها عن طريق الماستر كارد 💳";
    public static final String DEF_MSG_PAYMENT_AGAIN =
            "الرجاء الاختيار:\nاكتب «يدوي» للدفع في العيادة\nاكتب «الان» للدفع عن طريق الماستر كارد";
    public static final String DEF_MSG_MANUAL =
            "تم ✅ اخترت الدفع في العيادة.\nرقم دورك: {n} — بانتظارك 🌷";
    public static final String DEF_MSG_CARD =
            "تم ✅ اخترت الدفع عن طريق الماستر كارد 💳\nمبلغ الكشفية: {fee}\n{card}\n\nبعد التحويل أرسل صورة الإيصال. رقم دورك: {n} 🌷";

    public static final String[][] MESSAGES = {
            {"msg_booked", DEF_MSG_BOOKED, "١- بعد تسجيل الحجز (طلب العمر)"},
            {"msg_age_again", DEF_MSG_AGE_AGAIN, "اذا لم يرسل العمر بشكل صحيح"},
            {"msg_payment", DEF_MSG_PAYMENT, "٢- بعد استلام العمر (سؤال الدفع)"},
            {"msg_payment_again", DEF_MSG_PAYMENT_AGAIN, "اذا لم يكتب يدوي أو الان"},
            {"msg_manual", DEF_MSG_MANUAL, "٣- عند اختيار «يدوي»"},
            {"msg_card", DEF_MSG_CARD, "٣- عند اختيار «الان» (ماستر كارد)"},
    };

    private final SharedPreferences p;

    public Prefs(Context c) { p = c.getSharedPreferences("prefs", Context.MODE_PRIVATE); }

    public String title() { return p.getString("title", "حجوزات العيادة"); }
    public void setTitle(String v) { p.edit().putString("title", v).apply(); }

    /** كلمة مفتاحية (اختيارية) مثل «حجز». اذا فارغة: كل رسالة تُعتبر حجزاً. */
    public String keyword() { return p.getString("keyword", ""); }
    public void setKeyword(String v) { p.edit().putString("keyword", v).apply(); }

    public boolean enabled() { return p.getBoolean("enabled", true); }
    public void setEnabled(boolean v) { p.edit().putBoolean("enabled", v).apply(); }

    public boolean acceptGroups() { return p.getBoolean("groups", false); }
    public void setAcceptGroups(boolean v) { p.edit().putBoolean("groups", v).apply(); }

    /** المحادثة التلقائية: طلب العمر ثم طريقة الدفع. */
    public boolean flow() { return p.getBoolean("flow", true); }
    public void setFlow(boolean v) { p.edit().putBoolean("flow", v).apply(); }

    public String msg(String key) {
        for (String[] m : MESSAGES) if (m[0].equals(key)) return p.getString(key, m[1]);
        return "";
    }
    public void setMsg(String key, String v) { p.edit().putString(key, v).apply(); }

    public String fee() { return p.getString("fee", "25,000 دينار"); }
    public void setFee(String v) { p.edit().putString("fee", v).apply(); }

    public String card() { return p.getString("card", "رقم البطاقة: 0000 0000 0000 0000\nالاسم: ....."); }
    public void setCard(String v) { p.edit().putString("card", v).apply(); }

    public static boolean listenerEnabled(Context c) {
        String flat = Settings.Secure.getString(c.getContentResolver(), "enabled_notification_listeners");
        if (TextUtils.isEmpty(flat)) return false;
        ComponentName me = new ComponentName(c, WhatsAppListener.class);
        for (String s : flat.split(":")) {
            ComponentName cn = ComponentName.unflattenFromString(s);
            if (me.equals(cn)) return true;
        }
        return false;
    }
}
