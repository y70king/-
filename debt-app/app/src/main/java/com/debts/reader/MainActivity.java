package com.debts.reader;

import android.app.Activity;
import android.app.ProgressDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.ListView;
import android.widget.TextView;
import android.widget.Toast;

import java.text.DecimalFormat;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends Activity {

    private static final int REQ_PICK = 1;
    private static final String PREFS = "settings";

    private EditText etToken, etChatId;
    private View settingsBox;
    private CheckBox cbAmount;
    private TextView tvSummary;
    private ListView list;
    private Button btnSend;

    private final List<KonnashParser.Customer> due = new ArrayList<>();
    private ProgressDialog progress;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        etToken = findViewById(R.id.etToken);
        etChatId = findViewById(R.id.etChatId);
        settingsBox = findViewById(R.id.settingsBox);
        cbAmount = findViewById(R.id.cbAmount);
        tvSummary = findViewById(R.id.tvSummary);
        list = findViewById(R.id.list);
        btnSend = findViewById(R.id.btnSend);

        SharedPreferences sp = getSharedPreferences(PREFS, MODE_PRIVATE);
        etToken.setText(sp.getString("token", ""));
        etChatId.setText(sp.getString("chat_id", ""));
        cbAmount.setChecked(sp.getBoolean("with_amount", true));
        // إخفاء الإعدادات إذا كانت محفوظة مسبقاً
        if (!etToken.getText().toString().isEmpty() && !etChatId.getText().toString().isEmpty()) {
            settingsBox.setVisibility(View.GONE);
        }

        findViewById(R.id.btnToggleSettings).setOnClickListener(v ->
                settingsBox.setVisibility(settingsBox.getVisibility() == View.VISIBLE ? View.GONE : View.VISIBLE));
        findViewById(R.id.btnSave).setOnClickListener(v -> {
            saveSettings();
            toast("تم الحفظ");
        });
        findViewById(R.id.btnPick).setOnClickListener(v -> pickPdf());
        btnSend.setOnClickListener(v -> send());

        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;
        Uri uri = null;
        if (Intent.ACTION_VIEW.equals(intent.getAction())) uri = intent.getData();
        else if (Intent.ACTION_SEND.equals(intent.getAction())) uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if (uri != null) loadPdf(uri);
    }

    private void saveSettings() {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                .putString("token", etToken.getText().toString().trim())
                .putString("chat_id", etChatId.getText().toString().trim())
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
                List<KonnashParser.Customer> all = PdfReader.read(this, uri);
                final List<KonnashParser.Customer> owing = new ArrayList<>();
                for (KonnashParser.Customer c : all) if (c.due() > 0.005) owing.add(c);
                runOnUiThread(() -> {
                    hideProgress();
                    showResult(all.size(), owing);
                });
            } catch (Exception e) {
                runOnUiThread(() -> {
                    hideProgress();
                    tvSummary.setText("تعذر قراءة الملف: " + e.getMessage());
                });
            }
        }).start();
    }

    private void showResult(int total, List<KonnashParser.Customer> owing) {
        due.clear();
        due.addAll(owing);
        double sum = 0;
        List<String> rows = new ArrayList<>();
        for (KonnashParser.Customer c : due) {
            sum += c.due();
            rows.add(c.index + ". " + c.name + "  —  " + money(c.due()));
        }
        if (total == 0) {
            tvSummary.setText("لم يتم العثور على عملاء. تأكد أن الملف تقرير \"الوضع حسب العميل\".");
        } else {
            tvSummary.setText("عدد العملاء: " + total + "\nالمستحقين للتسديد: " + due.size()
                    + "\nالمجموع المتبقي: " + money(sum));
        }
        list.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_list_item_multiple_choice, rows));
        for (int i = 0; i < rows.size(); i++) list.setItemChecked(i, true);
        btnSend.setEnabled(!due.isEmpty());
    }

    private void send() {
        saveSettings();
        final String token = etToken.getText().toString().trim();
        final String chatId = etChatId.getText().toString().trim();
        if (token.isEmpty() || chatId.isEmpty()) {
            settingsBox.setVisibility(View.VISIBLE);
            toast("أدخل التوكن والآيدي أولاً");
            return;
        }
        List<KonnashParser.Customer> selected = new ArrayList<>();
        for (int i = 0; i < due.size(); i++) if (list.isItemChecked(i)) selected.add(due.get(i));
        if (selected.isEmpty()) {
            toast("لم يتم تحديد أي شخص");
            return;
        }
        final List<String> messages = buildMessages(selected, cbAmount.isChecked());
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
    static List<String> buildMessages(List<KonnashParser.Customer> people, boolean withAmount) {
        List<String> out = new ArrayList<>();
        double sum = 0;
        for (KonnashParser.Customer c : people) sum += c.due();
        StringBuilder sb = new StringBuilder("📋 المستحقين للتسديد (" + people.size() + ")\n\n");
        int n = 0;
        for (KonnashParser.Customer c : people) {
            n++;
            String line = n + ". " + c.name + (withAmount ? " — " + money(c.due()) : "") + "\n";
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
