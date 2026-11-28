package com.clinic.booking;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

public class SettingsActivity extends Activity {

    private Prefs prefs;
    private TextView status;
    private EditText keyword, reply;

    @Override
    protected void onCreate(Bundle s) {
        super.onCreate(s);
        prefs = new Prefs(this);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        root.setPadding(dp(16), 0, dp(16), dp(24));

        TextView head = new TextView(this);
        head.setText("⚙  الإعدادات");
        head.setTextSize(21);
        head.setTextColor(0xFFFFFFFF);
        head.setBackgroundColor(getColor(R.color.primary));
        head.setPadding(dp(16), dp(16), dp(16), dp(16));

        // ربط واتساب
        LinearLayout c1 = card(root, "ربط واتساب");
        status = new TextView(this);
        status.setTextSize(15);
        status.setPadding(0, 0, 0, dp(8));
        c1.addView(status);
        c1.addView(button("فتح إعداد الوصول الى الإشعارات", v ->
                startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))));
        c1.addView(note("يعمل مع واتساب وواتساب للأعمال. يجب أن تكون إشعارات واتساب مفعّلة، وألا تكون المحادثة مكتومة (Mute)."));

        Switch enabled = sw("استقبال الحجوزات تلقائياً من واتساب", prefs.enabled());
        enabled.setOnCheckedChangeListener((b, v) -> prefs.setEnabled(v));
        c1.addView(enabled);

        Switch groups = sw("قبول رسائل المجموعات أيضاً", prefs.acceptGroups());
        groups.setOnCheckedChangeListener((b, v) -> prefs.setAcceptGroups(v));
        c1.addView(groups);

        // الكلمة المفتاحية
        LinearLayout c2 = card(root, "تصفية الرسائل");
        c2.addView(note("اتركها فارغة لتحويل كل رسالة الى حجز. أو اكتب كلمة مثل «حجز» ليتم تسجيل الرسائل التي تحتوي عليها فقط (مثال: حجز أحمد علي)."));
        keyword = edit(prefs.keyword(), "مثال: حجز", false);
        c2.addView(keyword);

        // الرد التلقائي
        LinearLayout c3 = card(root, "الرد التلقائي على الزبون");
        Switch auto = sw("إرسال رد تلقائي بعد تسجيل الحجز", prefs.autoReply());
        auto.setOnCheckedChangeListener((b, v) -> prefs.setAutoReply(v));
        c3.addView(auto);
        c3.addView(note("استخدم {name} لاسم المريض/ة و {n} لرقم الدور."));
        reply = edit(prefs.replyText(), Prefs.DEFAULT_REPLY, true);
        c3.addView(reply);

        TextView save = button("حفظ", v -> {
            prefs.setKeyword(keyword.getText().toString().trim());
            String r = reply.getText().toString().trim();
            prefs.setReplyText(r.isEmpty() ? Prefs.DEFAULT_REPLY : r);
            Toast.makeText(this, "تم الحفظ ✅", Toast.LENGTH_SHORT).show();
            finish();
        });
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, dp(52));
        lp.topMargin = dp(16);
        root.addView(save, lp);

        ScrollView sv = new ScrollView(this);
        sv.addView(root);
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setBackgroundColor(getColor(R.color.bg));
        page.addView(head);
        page.addView(sv);
        setContentView(page);
    }

    @Override
    protected void onResume() {
        super.onResume();
        boolean on = Prefs.listenerEnabled(this);
        status.setText(on ? "✅ مربوط — التطبيق يستقبل رسائل واتساب" : "⚠ غير مربوط — فعّل الوصول الى الإشعارات");
        status.setTextColor(getColor(on ? R.color.arrived_text : R.color.warn_text));
    }

    private LinearLayout card(LinearLayout root, String title) {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        c.setBackgroundResource(R.drawable.bg_card);
        c.setPadding(dp(16), dp(14), dp(16), dp(14));
        TextView t = new TextView(this);
        t.setText(title);
        t.setTextSize(17);
        t.setTextColor(getColor(R.color.primary));
        t.setPadding(0, 0, 0, dp(8));
        t.getPaint().setFakeBoldText(true);
        c.addView(t);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.topMargin = dp(14);
        root.addView(c, lp);
        return c;
    }

    private TextView note(String s) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(13);
        t.setTextColor(getColor(R.color.text_soft));
        t.setPadding(0, dp(6), 0, dp(6));
        return t;
    }

    private Switch sw(String s, boolean on) {
        Switch w = new Switch(this);
        w.setText(s);
        w.setTextSize(15);
        w.setChecked(on);
        w.setPadding(0, dp(10), 0, dp(10));
        return w;
    }

    private EditText edit(String v, String hint, boolean multi) {
        EditText e = new EditText(this);
        e.setText(v);
        e.setHint(hint);
        e.setBackgroundResource(R.drawable.bg_input);
        e.setPadding(dp(12), dp(10), dp(12), dp(10));
        e.setTextAlignment(View.TEXT_ALIGNMENT_VIEW_START);
        if (multi) { e.setMinLines(2); e.setGravity(Gravity.TOP | Gravity.START); } else e.setSingleLine(true);
        return e;
    }

    private TextView button(String s, View.OnClickListener l) {
        TextView b = new TextView(this);
        b.setText(s);
        b.setGravity(Gravity.CENTER);
        b.setTextSize(15);
        b.setTextColor(0xFFFFFFFF);
        b.setBackgroundResource(R.drawable.bg_primary);
        b.setPadding(dp(12), dp(14), dp(12), dp(14));
        b.setOnClickListener(l);
        return b;
    }

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }
}
