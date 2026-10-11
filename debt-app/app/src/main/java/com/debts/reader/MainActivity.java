package com.debts.reader;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DatePickerDialog;
import android.app.ProgressDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.ListView;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.DecimalFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public class MainActivity extends Activity {

    private static final int REQ_PICK = 1;
    private static final String PREFS = "settings";
    /** لا نحدد تلقائياً من أُرسل له تذكير خلال هذه المدة */
    private static final int REMIND_COOLDOWN_DAYS = 7;

    private EditText etToken, etChatId, etDays, etTemplate;
    private View settingsBox;
    private CheckBox cbAmount;
    private TextView tvSummary;
    private RadioButton rbOverdue;
    private ListView list;
    private Button btnSend, btnWhatsApp;

    private DebtStore store;
    private int totalCustomers;
    /** كل المستحقين من آخر تقرير */
    private final List<KonnashParser.Customer> owing = new ArrayList<>();
    /** المعروضين حالياً في القائمة حسب الفلتر */
    private final List<KonnashParser.Customer> shown = new ArrayList<>();
    private final Set<String> unchecked = new HashSet<>();

    // طابور إرسال الواتساب
    private final List<KonnashParser.Customer> waQueue = new ArrayList<>();
    private int waIndex;
    private boolean waWaitingReturn;
    /** رجوع من واتساب بعد تذكير فردي */
    private boolean singleWaitingReturn;

    private final CustomerAdapter adapter = new CustomerAdapter();

    private ProgressDialog progress;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        store = new DebtStore(this);

        etToken = findViewById(R.id.etToken);
        etChatId = findViewById(R.id.etChatId);
        etDays = findViewById(R.id.etDays);
        etTemplate = findViewById(R.id.etTemplate);
        settingsBox = findViewById(R.id.settingsBox);
        cbAmount = findViewById(R.id.cbAmount);
        tvSummary = findViewById(R.id.tvSummary);
        rbOverdue = findViewById(R.id.rbOverdue);
        list = findViewById(R.id.list);
        btnSend = findViewById(R.id.btnSend);
        btnWhatsApp = findViewById(R.id.btnWhatsApp);

        SharedPreferences sp = getSharedPreferences(PREFS, MODE_PRIVATE);
        etToken.setText(sp.getString("token", ""));
        etChatId.setText(sp.getString("chat_id", ""));
        etDays.setText(String.valueOf(sp.getInt("days", 25)));
        etTemplate.setText(sp.getString("wa_template", WhatsApp.DEFAULT_TEMPLATE));
        cbAmount.setChecked(sp.getBoolean("with_amount", true));
        // إخفاء الإعدادات إذا كانت محفوظة مسبقاً
        if (!etToken.getText().toString().isEmpty() && !etChatId.getText().toString().isEmpty()) {
            settingsBox.setVisibility(View.GONE);
        }
        updateFilterLabel();

        findViewById(R.id.btnToggleSettings).setOnClickListener(v ->
                settingsBox.setVisibility(settingsBox.getVisibility() == View.VISIBLE ? View.GONE : View.VISIBLE));
        findViewById(R.id.btnSave).setOnClickListener(v -> {
            saveSettings();
            updateFilterLabel();
            refreshList();
            toast("تم الحفظ");
        });
        findViewById(R.id.btnPick).setOnClickListener(v -> pickPdf());
        ((RadioGroup) findViewById(R.id.rgFilter)).setOnCheckedChangeListener((g, id) -> refreshList());
        list.setAdapter(adapter);
        list.setOnItemClickListener((parent, view, pos, id) -> {
            String k = DebtStore.key(shown.get(pos));
            if (!unchecked.remove(k)) unchecked.add(k);
            adapter.notifyDataSetChanged();
        });
        list.setOnItemLongClickListener((parent, view, pos, id) -> {
            editStartDate(shown.get(pos));
            return true;
        });
        btnSend.setOnClickListener(v -> sendTelegram());
        btnWhatsApp.setOnClickListener(v -> startWhatsApp());

        // عرض آخر تقرير محفوظ مباشرة عند فتح التطبيق
        loadSavedReport();
        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIntent(intent);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (waWaitingReturn) {
            waWaitingReturn = false;
            askNextWhatsApp();
        } else if (singleWaitingReturn) {
            singleWaitingReturn = false;
            refreshList();
        }
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;
        Uri uri = null;
        if (Intent.ACTION_VIEW.equals(intent.getAction())) uri = intent.getData();
        else if (Intent.ACTION_SEND.equals(intent.getAction())) uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if (uri != null) loadPdf(uri);
    }

    private int thresholdDays() {
        try {
            return Math.max(0, Integer.parseInt(etDays.getText().toString().trim()));
        } catch (NumberFormatException e) {
            return 25;
        }
    }

    private void updateFilterLabel() {
        rbOverdue.setText("واصلين " + thresholdDays() + " يوم فأكثر");
    }

    private void saveSettings() {
        String tpl = etTemplate.getText().toString();
        if (tpl.trim().isEmpty()) {
            tpl = WhatsApp.DEFAULT_TEMPLATE;
            etTemplate.setText(tpl);
        }
        getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                .putString("token", etToken.getText().toString().trim())
                .putString("chat_id", etChatId.getText().toString().trim())
                .putInt("days", thresholdDays())
                .putString("wa_template", tpl)
                .putBoolean("with_amount", cbAmount.isChecked())
                .apply();
    }

    private void pickPdf() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("application/pdf");
        startActivityForResult(i, REQ_PICK);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_PICK && resultCode == RESULT_OK && data != null && data.getData() != null) {
            loadPdf(data.getData());
        }
    }

    private void loadPdf(final Uri uri) {
        showProgress("جاري قراءة الملف...");
        new Thread(() -> {
            try {
                final List<KonnashParser.Customer> all = PdfReader.read(this, uri);
                runOnUiThread(() -> {
                    hideProgress();
                    if (all.isEmpty()) {
                        tvSummary.setText("لم يتم العثور على عملاء. تأكد أن الملف تقرير \"الوضع حسب العميل\".");
                        return;
                    }
                    store.update(all);
                    saveReport(all);
                    setReport(all);
                });
            } catch (Exception e) {
                runOnUiThread(() -> {
                    hideProgress();
                    tvSummary.setText("تعذر قراءة الملف: " + e.getMessage());
                });
            }
        }).start();
    }

    private void setReport(List<KonnashParser.Customer> all) {
        totalCustomers = all.size();
        owing.clear();
        for (KonnashParser.Customer c : all) if (c.due() > 0.005) owing.add(c);
        unchecked.clear();
        for (KonnashParser.Customer c : owing) {
            int r = store.daysSinceReminder(c);
            if (r >= 0 && r < REMIND_COOLDOWN_DAYS) unchecked.add(DebtStore.key(c));
        }
        refreshList();
    }

    private void refreshList() {
        if (totalCustomers == 0) return;
        int threshold = thresholdDays();
        boolean onlyOverdue = rbOverdue.isChecked();
        shown.clear();
        double sumAll = 0, sumOverdue = 0;
        int overdue = 0;
        for (KonnashParser.Customer c : owing) {
            sumAll += c.due();
            boolean isOver = store.days(c) >= threshold;
            if (isOver) {
                overdue++;
                sumOverdue += c.due();
            }
            if (!onlyOverdue || isOver) shown.add(c);
        }
        tvSummary.setText("عدد العملاء: " + totalCustomers
                + "\nالمستحقين: " + owing.size() + "  —  المجموع: " + money(sumAll)
                + "\nواصلين " + threshold + " يوم فأكثر: " + overdue + "  —  المجموع: " + money(sumOverdue));

        adapter.notifyDataSetChanged();
        btnSend.setEnabled(!shown.isEmpty());
        btnWhatsApp.setEnabled(!shown.isEmpty());
    }

    private List<KonnashParser.Customer> selected() {
        List<KonnashParser.Customer> out = new ArrayList<>();
        for (KonnashParser.Customer c : shown) if (!unchecked.contains(DebtStore.key(c))) out.add(c);
        return out;
    }

    private void editStartDate(final KonnashParser.Customer c) {
        Calendar cal = Calendar.getInstance();
        cal.add(Calendar.DAY_OF_YEAR, -store.days(c));
        DatePickerDialog d = new DatePickerDialog(this, (view, y, m, day) -> {
            Calendar picked = Calendar.getInstance();
            picked.set(y, m, day, 12, 0, 0);
            long diffDays = Math.round((Calendar.getInstance().getTimeInMillis() - picked.getTimeInMillis()) / 86400000.0);
            store.setSince(c, DebtStore.today() - Math.max(0, diffDays));
            refreshList();
        }, cal.get(Calendar.YEAR), cal.get(Calendar.MONTH), cal.get(Calendar.DAY_OF_MONTH));
        d.setTitle("تاريخ بداية دين: " + c.name);
        d.show();
    }

    // ---------------- واتساب ----------------

    private void startWhatsApp() {
        saveSettings();
        waQueue.clear();
        int noPhone = 0;
        for (KonnashParser.Customer c : selected()) {
            if (WhatsApp.normalizePhone(c.phone).isEmpty()) noPhone++;
            else waQueue.add(c);
        }
        if (waQueue.isEmpty()) {
            toast(noPhone > 0 ? "المحددين ليس لديهم أرقام هواتف" : "لم يتم تحديد أي شخص");
            return;
        }
        waIndex = 0;
        String msg = "سيتم فتح واتساب لـ " + waQueue.size() + " شخص بالتتابع، اضغط إرسال ثم ارجع للتطبيق لفتح التالي.";
        if (noPhone > 0) msg += "\n\n(" + noPhone + " شخص بدون رقم هاتف سيتم تخطيهم)";
        new AlertDialog.Builder(this)
                .setTitle("إرسال تذكير واتساب")
                .setMessage(msg)
                .setPositiveButton("ابدأ", (d, w) -> openNextWhatsApp())
                .setNegativeButton("إلغاء", null)
                .show();
    }

    /** زر "تذكير" بجانب اسم شخص واحد */
    private void remindOne(KonnashParser.Customer c) {
        saveSettings();
        String phone = WhatsApp.normalizePhone(c.phone);
        if (phone.isEmpty()) {
            toast("لا يوجد رقم هاتف لـ " + c.name);
            return;
        }
        String text = WhatsApp.message(etTemplate.getText().toString(), c, store.days(c));
        try {
            startActivity(WhatsApp.intent(phone, text));
        } catch (ActivityNotFoundException e) {
            toast("واتساب غير مثبت");
            return;
        }
        store.markReminded(c);
        unchecked.add(DebtStore.key(c));
        singleWaitingReturn = true;
    }

    private String rowText(KonnashParser.Customer c) {
        StringBuilder sb = new StringBuilder();
        sb.append(c.name).append("\n").append(money(c.due()))
                .append("  •  ").append(store.days(c)).append(" يوم");
        int r = store.daysSinceReminder(c);
        if (r == 0) sb.append("\n✔ ذُكّر اليوم");
        else if (r > 0) sb.append("\n✔ ذُكّر قبل ").append(r).append(" يوم");
        return sb.toString();
    }

    private class CustomerAdapter extends BaseAdapter {
        @Override
        public int getCount() {
            return shown.size();
        }

        @Override
        public Object getItem(int position) {
            return shown.get(position);
        }

        @Override
        public long getItemId(int position) {
            return position;
        }

        @Override
        public View getView(int position, View view, ViewGroup parent) {
            if (view == null) view = getLayoutInflater().inflate(R.layout.item_customer, parent, false);
            final KonnashParser.Customer c = shown.get(position);
            ((CheckBox) view.findViewById(R.id.cb)).setChecked(!unchecked.contains(DebtStore.key(c)));
            ((TextView) view.findViewById(R.id.tv)).setText(rowText(c));
            Button b = view.findViewById(R.id.btnRemind);
            boolean hasPhone = !WhatsApp.normalizePhone(c.phone).isEmpty();
            b.setEnabled(hasPhone);
            b.setText(hasPhone ? "💬 تذكير" : "بدون رقم");
            b.setOnClickListener(v -> remindOne(c));
            return view;
        }
    }

    private void openNextWhatsApp() {
        KonnashParser.Customer c = waQueue.get(waIndex);
        String text = WhatsApp.message(etTemplate.getText().toString(), c, store.days(c));
        try {
            startActivity(WhatsApp.intent(WhatsApp.normalizePhone(c.phone), text));
        } catch (ActivityNotFoundException e) {
            toast("واتساب غير مثبت");
            waQueue.clear();
            return;
        }
        store.markReminded(c);
        unchecked.add(DebtStore.key(c));
        waIndex++;
        waWaitingReturn = true;
    }

    private void askNextWhatsApp() {
        refreshList();
        if (waIndex >= waQueue.size()) {
            toast("تم الانتهاء من " + waQueue.size() + " رسالة ✅");
            waQueue.clear();
            return;
        }
        KonnashParser.Customer next = waQueue.get(waIndex);
        new AlertDialog.Builder(this)
                .setTitle("تم " + waIndex + " من " + waQueue.size())
                .setMessage("التالي: " + next.name + "  —  " + money(next.due()))
                .setPositiveButton("إرسال", (d, w) -> openNextWhatsApp())
                .setNeutralButton("تخطي", (d, w) -> {
                    waIndex++;
                    askNextWhatsApp();
                })
                .setNegativeButton("إيقاف", (d, w) -> waQueue.clear())
                .setCancelable(false)
                .show();
    }

    // ---------------- تيليغرام ----------------

    private void sendTelegram() {
        saveSettings();
        final String token = etToken.getText().toString().trim();
        final String chatId = etChatId.getText().toString().trim();
        if (token.isEmpty() || chatId.isEmpty()) {
            settingsBox.setVisibility(View.VISIBLE);
            toast("أدخل التوكن والآيدي أولاً");
            return;
        }
        List<KonnashParser.Customer> sel = selected();
        if (sel.isEmpty()) {
            toast("لم يتم تحديد أي شخص");
            return;
        }
        String title = rbOverdue.isChecked()
                ? "📋 المستحقين للتسديد (واصلين " + thresholdDays() + " يوم فأكثر)"
                : "📋 المستحقين للتسديد";
        final List<String> messages = buildMessages(title, sel, cbAmount.isChecked());
        showProgress("جاري الإرسال...");
        new Thread(() -> {
            try {
                for (String m : messages) TelegramSender.send(token, chatId, m);
                runOnUiThread(() -> {
                    hideProgress();
                    toast("تم الإرسال ✅");
                });
            } catch (Exception e) {
                runOnUiThread(() -> {
                    hideProgress();
                    toast("فشل الإرسال: " + e.getMessage());
                });
            }
        }).start();
    }

    /** يقسم القائمة إلى رسائل لا تتجاوز حد تيليغرام (4096 حرف) */
    private List<String> buildMessages(String title, List<KonnashParser.Customer> people, boolean withAmount) {
        List<String> out = new ArrayList<>();
        double sum = 0;
        for (KonnashParser.Customer c : people) sum += c.due();
        StringBuilder sb = new StringBuilder(title + " — " + people.size() + "\n\n");
        int n = 0;
        for (KonnashParser.Customer c : people) {
            n++;
            int days = store.days(c);
            String line = n + ". " + c.name
                    + (withAmount ? " — " + money(c.due()) : "")
                    + (days > 0 ? " (" + days + " يوم)" : "") + "\n";
            if (sb.length() + line.length() > 3900) {
                out.add(sb.toString());
                sb = new StringBuilder();
            }
            sb.append(line);
        }
        if (withAmount) sb.append("\n💰 المجموع: ").append(money(sum));
        out.add(sb.toString());
        return out;
    }

    // ---------------- حفظ آخر تقرير ----------------

    private void saveReport(List<KonnashParser.Customer> all) {
        try {
            JSONArray arr = new JSONArray();
            for (KonnashParser.Customer c : all) {
                JSONObject o = new JSONObject();
                o.put("i", c.index);
                o.put("n", c.name);
                o.put("p", c.phone);
                o.put("g", c.gave);
                o.put("t", c.took);
                o.put("b", c.balance);
                arr.put(o);
            }
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString("last_report", arr.toString()).apply();
        } catch (Exception ignored) {
        }
    }

    private void loadSavedReport() {
        String s = getSharedPreferences(PREFS, MODE_PRIVATE).getString("last_report", null);
        if (s == null) return;
        try {
            JSONArray arr = new JSONArray(s);
            List<KonnashParser.Customer> all = new ArrayList<>();
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                KonnashParser.Customer c = new KonnashParser.Customer();
                c.index = o.getInt("i");
                c.name = o.getString("n");
                c.phone = o.getString("p");
                c.gave = o.getDouble("g");
                c.took = o.getDouble("t");
                c.balance = o.getDouble("b");
                all.add(c);
            }
            if (!all.isEmpty()) setReport(all);
        } catch (Exception ignored) {
        }
    }

    static String money(double v) {
        return new DecimalFormat("#,##0.##").format(v);
    }

    private void showProgress(String msg) {
        progress = ProgressDialog.show(this, null, msg, true, false);
    }

    private void hideProgress() {
        if (progress != null && progress.isShowing()) progress.dismiss();
        progress = null;
    }

    private void toast(String s) {
        Toast.makeText(this, s, Toast.LENGTH_LONG).show();
    }
}
