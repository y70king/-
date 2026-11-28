package com.clinic.booking;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.os.Bundle;
import android.provider.Settings;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.TextView;
import android.widget.Toast;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public class MainActivity extends Activity {

    private BookingDb db;
    private Prefs prefs;
    private final Calendar day = Calendar.getInstance();
    private int filter = BookingDb.FILTER_ALL;
    private String query = "";
    private final List<BookingDb.Booking> items = new ArrayList<>();

    private TextView title, banner, dayLabel, chipAll, chipArrived, chipWaiting, empty;
    private ListView list;
    private Adapter adapter;

    @Override
    protected void onCreate(Bundle s) {
        super.onCreate(s);
        setContentView(R.layout.activity_main);
        db = BookingDb.get(this);
        prefs = new Prefs(this);

        title = findViewById(R.id.title);
        banner = findViewById(R.id.banner);
        dayLabel = findViewById(R.id.dayLabel);
        chipAll = findViewById(R.id.chipAll);
        chipArrived = findViewById(R.id.chipArrived);
        chipWaiting = findViewById(R.id.chipWaiting);
        empty = findViewById(R.id.empty);
        list = findViewById(R.id.list);
        adapter = new Adapter();
        list.setAdapter(adapter);
        list.setEmptyView(empty);

        title.setOnClickListener(v -> editTitle());
        banner.setOnClickListener(v -> openListenerSettings());
        findViewById(R.id.btnSettings).setOnClickListener(v -> startActivity(new Intent(this, SettingsActivity.class)));
        findViewById(R.id.prevDay).setOnClickListener(v -> { day.add(Calendar.DAY_OF_MONTH, -1); refresh(); });
        findViewById(R.id.nextDay).setOnClickListener(v -> { day.add(Calendar.DAY_OF_MONTH, 1); refresh(); });
        dayLabel.setOnClickListener(v -> { day.setTimeInMillis(System.currentTimeMillis()); refresh(); });
        dayLabel.setOnLongClickListener(v -> { confirmClearDay(); return true; });

        chipAll.setOnClickListener(v -> { filter = BookingDb.FILTER_ALL; refresh(); });
        chipArrived.setOnClickListener(v -> { filter = BookingDb.FILTER_ARRIVED; refresh(); });
        chipWaiting.setOnClickListener(v -> { filter = BookingDb.FILTER_WAITING; refresh(); });

        ((EditText) findViewById(R.id.search)).addTextChangedListener(new TextWatcher() {
            public void beforeTextChanged(CharSequence c, int a, int b, int d) { }
            public void onTextChanged(CharSequence c, int a, int b, int d) { }
            public void afterTextChanged(Editable e) { query = e.toString(); refresh(); }
        });

        findViewById(R.id.btnAdd).setOnClickListener(v -> editBooking(null, ""));
        findViewById(R.id.btnShare).setOnClickListener(v -> shareTable());

        handleShare(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleShare(intent);
    }

    @Override
    protected void onResume() {
        super.onResume();
        BookingDb.setChangeListener(this::refresh);
        refresh();
    }

    @Override
    protected void onPause() {
        super.onPause();
        BookingDb.setChangeListener(null);
    }

    private String dayKey() { return BookingDb.dayOf(day.getTimeInMillis()); }

    private void refresh() {
        title.setText(prefs.title() + "  ✎");
        banner.setVisibility(Prefs.listenerEnabled(this) ? View.GONE : View.VISIBLE);

        String key = dayKey();
        String label = new SimpleDateFormat("EEEE  d / M / yyyy", new Locale("ar")).format(day.getTime());
        dayLabel.setText(key.equals(BookingDb.today()) ? "اليوم — " + label : label);

        int[] c = db.counts(key);
        chipAll.setText("الكل  " + c[0]);
        chipArrived.setText("واصل  " + c[1]);
        chipWaiting.setText("غير واصل  " + c[2]);
        chipAll.setAlpha(filter == BookingDb.FILTER_ALL ? 1f : 0.55f);
        chipArrived.setAlpha(filter == BookingDb.FILTER_ARRIVED ? 1f : 0.55f);
        chipWaiting.setAlpha(filter == BookingDb.FILTER_WAITING ? 1f : 0.55f);

        items.clear();
        items.addAll(db.list(key, filter, query));
        adapter.notifyDataSetChanged();
    }

    /** نص مُشارك من واتساب أو أي تطبيق آخر ← حجز جديد. */
    private void handleShare(Intent i) {
        if (i == null || !Intent.ACTION_SEND.equals(i.getAction())) return;
        String text = i.getStringExtra(Intent.EXTRA_TEXT);
        i.setAction(null);
        if (text == null) return;
        String name = WhatsAppListener.extractName(text, "");
        editBooking(null, name == null ? text.trim() : name);
    }

    private void editTitle() {
        EditText e = input("عنوان الجدول", prefs.title(), false);
        new AlertDialog.Builder(this)
                .setTitle("تغيير العنوان")
                .setView(wrap(e))
                .setPositiveButton("حفظ", (d, w) -> {
                    String v = e.getText().toString().trim();
                    if (!v.isEmpty()) prefs.setTitle(v);
                    refresh();
                })
                .setNegativeButton("إلغاء", null)
                .show();
    }

    /** اضافة (b == null) او تعديل حجز. */
    private void editBooking(BookingDb.Booking b, String presetName) {
        boolean isNew = b == null;
        EditText name = input("اسم المريض/ة", isNew ? presetName : b.name, false);
        EditText ttl = input("العنوان / ملاحظة (اختياري)", isNew ? "" : b.title, false);
        EditText sender = input("المرسل / رقم الهاتف (اختياري)", isNew ? "" : b.sender, true);

        RadioGroup rg = new RadioGroup(this);
        rg.setOrientation(RadioGroup.HORIZONTAL);
        RadioButton rArr = new RadioButton(this);
        rArr.setText("واصل ✅");
        rArr.setId(View.generateViewId());
        RadioButton rWait = new RadioButton(this);
        rWait.setText("غير واصل ⏳");
        rWait.setId(View.generateViewId());
        rg.addView(rArr);
        rg.addView(rWait);
        rg.check(!isNew && b.arrived ? rArr.getId() : rWait.getId());

        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        int pad = dp(20);
        box.setPadding(pad, dp(8), pad, 0);
        box.addView(label("اسم المريض/ة")); box.addView(name);
        box.addView(label("العنوان")); box.addView(ttl);
        box.addView(label("المرسل")); box.addView(sender);
        box.addView(label("الحالة")); box.addView(rg);

        AlertDialog.Builder bd = new AlertDialog.Builder(this)
                .setTitle(isNew ? "حجز جديد" : "تعديل الحجز رقم " + b.queueNo)
                .setView(box)
                .setPositiveButton("حفظ", (d, w) -> {
                    String n = name.getText().toString().trim();
                    if (n.isEmpty()) { toast("اكتب اسم المريض/ة"); return; }
                    boolean arrived = rg.getCheckedRadioButtonId() == rArr.getId();
                    if (isNew) {
                        if (!dayKey().equals(BookingDb.today())) toast("أُضيف الحجز الى جدول اليوم");
                        BookingDb.Booking nb = db.add(n, ttl.getText().toString().trim(), sender.getText().toString().trim());
                        if (arrived) { nb.arrived = true; db.update(nb); }
                        day.setTimeInMillis(System.currentTimeMillis());
                    } else {
                        b.name = n;
                        b.title = ttl.getText().toString().trim();
                        b.sender = sender.getText().toString().trim();
                        b.arrived = arrived;
                        db.update(b);
                    }
                    refresh();
                })
                .setNegativeButton("إلغاء", null);
        if (!isNew) {
            bd.setNeutralButton("حذف", (d, w) -> new AlertDialog.Builder(this)
                    .setMessage("حذف حجز «" + b.name + "»؟")
                    .setPositiveButton("حذف", (d2, w2) -> { db.delete(b.id); refresh(); })
                    .setNegativeButton("إلغاء", null)
                    .show());
        }
        bd.show();
    }

    private void confirmClearDay() {
        new AlertDialog.Builder(this)
                .setMessage("مسح كل حجوزات هذا اليوم؟")
                .setPositiveButton("مسح", (d, w) -> { db.deleteDay(dayKey()); refresh(); })
                .setNegativeButton("إلغاء", null)
                .show();
    }

    private void shareTable() {
        List<BookingDb.Booking> all = db.list(dayKey(), BookingDb.FILTER_ALL, "");
        if (all.isEmpty()) { toast("لا توجد حجوزات للمشاركة"); return; }
        StringBuilder sb = new StringBuilder();
        sb.append("📋 ").append(prefs.title()).append("\n").append(dayLabel.getText()).append("\n\n");
        for (BookingDb.Booking b : all) {
            sb.append(b.queueNo).append(". ").append(b.name);
            if (b.title != null && !b.title.isEmpty()) sb.append(" — ").append(b.title);
            sb.append(b.arrived ? "  ✅ واصل" : "  ⏳ غير واصل").append("\n");
        }
        int[] c = db.counts(dayKey());
        sb.append("\nالمجموع: ").append(c[0]).append(" | واصل: ").append(c[1]).append(" | غير واصل: ").append(c[2]);
        Intent i = new Intent(Intent.ACTION_SEND);
        i.setType("text/plain");
        i.putExtra(Intent.EXTRA_TEXT, sb.toString());
        startActivity(Intent.createChooser(i, "مشاركة الجدول"));
    }

    private void openListenerSettings() {
        new AlertDialog.Builder(this)
                .setTitle("ربط واتساب")
                .setMessage("سيفتح الآن إعداد «الوصول الى الإشعارات».\nفعّل «" + getString(R.string.app_name) +
                        "» ثم ارجع للتطبيق.\n\nبعدها أي رسالة يرسلها الزبون على واتساب (اسم المريض/ة) ستُضاف للجدول تلقائياً.")
                .setPositiveButton("فتح الإعداد", (d, w) ->
                        startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)))
                .setNegativeButton("لاحقاً", null)
                .show();
    }

    // ---------- الجدول ----------
    private class Adapter extends BaseAdapter {
        public int getCount() { return items.size(); }
        public Object getItem(int i) { return items.get(i); }
        public long getItemId(int i) { return items.get(i).id; }

        public View getView(int pos, View v, ViewGroup parent) {
            if (v == null) v = getLayoutInflater().inflate(R.layout.row_booking, parent, false);
            BookingDb.Booking b = items.get(pos);
            v.setBackgroundColor(getColor(pos % 2 == 0 ? R.color.card : R.color.row_alt));
            ((TextView) v.findViewById(R.id.num)).setText(String.valueOf(b.queueNo));
            ((TextView) v.findViewById(R.id.name)).setText(b.name);

            StringBuilder sub = new StringBuilder();
            if (b.title != null && !b.title.isEmpty()) sub.append("📍 ").append(b.title);
            if (b.sender != null && !b.sender.isEmpty() && !b.sender.equals(b.name)) {
                if (sub.length() > 0) sub.append("   ");
                sub.append("💬 ").append(b.sender);
            }
            TextView subV = v.findViewById(R.id.sub);
            subV.setText(sub);
            subV.setVisibility(sub.length() == 0 ? View.GONE : View.VISIBLE);

            ((TextView) v.findViewById(R.id.time)).setText(
                    new SimpleDateFormat("h:mm a", new Locale("ar")).format(new Date(b.createdAt)));

            TextView st = v.findViewById(R.id.status);
            st.setText(b.arrived ? "✓ واصل" : "غير واصل");
            st.setBackgroundResource(b.arrived ? R.drawable.bg_arrived : R.drawable.bg_waiting);
            st.setTextColor(getColor(b.arrived ? R.color.arrived_text : R.color.waiting_text));
            st.setOnClickListener(x -> { b.arrived = !b.arrived; db.update(b); refresh(); });

            v.setOnClickListener(x -> editBooking(b, ""));
            return v;
        }
    }

    // ---------- أدوات ----------
    private EditText input(String hint, String value, boolean phone) {
        EditText e = new EditText(this);
        e.setHint(hint);
        e.setText(value == null ? "" : value);
        e.setSingleLine(true);
        e.setInputType(InputType.TYPE_CLASS_TEXT);
        e.setTextAlignment(View.TEXT_ALIGNMENT_VIEW_START);
        e.setBackgroundResource(R.drawable.bg_input);
        e.setPadding(dp(12), dp(10), dp(12), dp(10));
        if (phone) e.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        return e;
    }

    private View wrap(View v) {
        LinearLayout box = new LinearLayout(this);
        box.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        box.setPadding(dp(20), dp(12), dp(20), 0);
        box.addView(v, new LinearLayout.LayoutParams(-1, -2));
        return box;
    }

    private TextView label(String s) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextColor(getColor(R.color.text_soft));
        t.setTextSize(13);
        t.setPadding(0, dp(10), 0, dp(4));
        return t;
    }

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    private void toast(String s) { Toast.makeText(this, s, Toast.LENGTH_SHORT).show(); }
}
