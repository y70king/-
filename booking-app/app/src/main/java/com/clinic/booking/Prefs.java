package com.clinic.booking;

import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.provider.Settings;
import android.text.TextUtils;

public class Prefs {
    public static final String DEFAULT_REPLY = "تم تسجيل حجز {name} ✅\nرقم الدور: {n}";

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

    public boolean autoReply() { return p.getBoolean("auto_reply", false); }
    public void setAutoReply(boolean v) { p.edit().putBoolean("auto_reply", v).apply(); }

    public String replyText() { return p.getString("reply_text", DEFAULT_REPLY); }
    public void setReplyText(String v) { p.edit().putString("reply_text", v).apply(); }

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
