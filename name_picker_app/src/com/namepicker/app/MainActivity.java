package com.namepicker.app;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends Activity {

    private static final String PREFS = "names";
    private static final String KEY_LIST = "list";
    private static final int REQ_PICK_FILE = 1;
    private static final int MAX_FILE_BYTES = 60 * 1024 * 1024;

    private final SecureRandom random = new SecureRandom();
    private final Handler handler = new Handler(Looper.getMainLooper());

    private EditText input;
    private TextView result;
    private TextView countLabel;
    private CheckBox removeAfterPick;
    private Button pickButton;
    private Button importButton;
    private boolean spinning = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        buildUi();

        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        input.setText(prefs.getString(KEY_LIST, ""));
        handleShare(getIntent());
        updateCount();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleShare(intent);
    }

    @Override
    protected void onPause() {
        super.onPause();
        getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                .putString(KEY_LIST, input.getText().toString()).apply();
    }

    /** نص أو ملف مُرسل من تطبيق آخر عبر "مشاركة" أو "فتح باستخدام". */
    private void handleShare(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (Intent.ACTION_VIEW.equals(action) && intent.getData() != null) {
            importFile(intent.getData());
        } else if (Intent.ACTION_SEND.equals(action)) {
            Object stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (stream instanceof Uri) {
                importFile((Uri) stream);
                return;
            }
            CharSequence shared = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
            if (shared != null && shared.length() > 0) {
                input.setText(shared);
                result.setTextColor(Color.parseColor("#4527A0"));
                result.setText("تم استلام القائمة ✔");
                updateCount();
            }
        }
        setIntent(new Intent()); // لا نعيد الاستيراد عند تدوير الشاشة
    }

    private void openFilePicker() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("*/*");
        i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{
                "application/pdf",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "application/msword",
                "text/plain"});
        try {
            startActivityForResult(i, REQ_PICK_FILE);
        } catch (Exception e) {
            Toast.makeText(this, "لا يوجد تطبيق لاختيار الملفات على هذا الجهاز", Toast.LENGTH_LONG).show();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_PICK_FILE && resultCode == RESULT_OK && data != null && data.getData() != null) {
            importFile(data.getData());
        }
    }

    /** يقرأ الملف في الخلفية ويستخرج الأسماء منه. */
    private void importFile(final Uri uri) {
        importButton.setEnabled(false);
        pickButton.setEnabled(false);
        result.setTextColor(Color.parseColor("#4527A0"));
        result.setText("⏳ جاري قراءة الملف...");
        new Thread(new Runnable() {
            @Override
            public void run() {
                String error = null;
                List<String> names = null;
                try {
                    byte[] bytes = readAll(uri);
                    names = TextExtractor.names(TextExtractor.extract(bytes));
                    if (names.isEmpty()) error = "لم أجد أسماء في هذا الملف.";
                } catch (TextExtractor.UserError e) {
                    error = e.getMessage();
                } catch (OutOfMemoryError e) {
                    error = "الملف كبير جداً.";
                } catch (Exception e) {
                    error = "تعذّرت قراءة الملف: " + e.getClass().getSimpleName();
                }
                final String err = error;
                final List<String> found = names;
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        importButton.setEnabled(true);
                        pickButton.setEnabled(true);
                        if (err != null) {
                            result.setTextColor(Color.parseColor("#C62828"));
                            result.setTextSize(18);
                            result.setText(err);
                            return;
                        }
                        StringBuilder sb = new StringBuilder();
                        for (String n : found) {
                            if (sb.length() > 0) sb.append('\n');
                            sb.append(n);
                        }
                        input.setText(sb.toString());
                        result.setTextColor(Color.parseColor("#4527A0"));
                        result.setTextSize(22);
                        result.setText("تم استيراد " + found.size() + " اسم ✔\nراجع القائمة واحذف أي سطر ليس اسماً (مثل العناوين)");
                    }
                });
            }
        }).start();
    }

    private byte[] readAll(Uri uri) throws Exception {
        InputStream in = getContentResolver().openInputStream(uri);
        if (in == null) throw new Exception("null stream");
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                if (out.size() > MAX_FILE_BYTES) throw new TextExtractor.UserError("الملف كبير جداً (أكثر من 60 ميجابايت).");
            }
            return out.toByteArray();
        } finally {
            in.close();
        }
    }

    private List<String> parseNames() {
        return TextExtractor.names(input.getText().toString());
    }

    private void updateCount() {
        countLabel.setText("عدد الأسماء: " + parseNames().size());
    }

    private void pick() {
        if (spinning) return;
        final List<String> names = parseNames();
        if (names.isEmpty()) {
            Toast.makeText(this, "اكتب أو الصق قائمة الأسماء أولاً", Toast.LENGTH_SHORT).show();
            return;
        }
        if (names.size() == 1) {
            showWinner(names, 0);
            return;
        }
        spinning = true;
        pickButton.setEnabled(false);
        final int winner = random.nextInt(names.size());
        final int steps = 18;
        for (int i = 0; i < steps; i++) {
            final boolean last = (i == steps - 1);
            final int delay = 40 * i + 4 * i * i; // يتباطأ تدريجياً
            handler.postDelayed(new Runnable() {
                @Override
                public void run() {
                    if (last) {
                        showWinner(names, winner);
                        spinning = false;
                        pickButton.setEnabled(true);
                    } else {
                        result.setTextSize(32);
                        result.setTextColor(Color.parseColor("#9E9E9E"));
                        result.setText(names.get(random.nextInt(names.size())));
                    }
                }
            }, delay);
        }
    }

    private void showWinner(List<String> names, int index) {
        String name = names.get(index);
        result.setTextColor(Color.parseColor("#2E7D32"));
        result.setTextSize(32);
        result.setText("🎉 " + name + " 🎉");
        if (removeAfterPick.isChecked()) {
            names.remove(index);
            StringBuilder sb = new StringBuilder();
            for (String n : names) {
                if (sb.length() > 0) sb.append('\n');
                sb.append(n);
            }
            input.setText(sb.toString());
        }
    }

    // ---------------- واجهة المستخدم ----------------

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private GradientDrawable rounded(int color, int strokeColor) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(dp(14));
        if (strokeColor != 0) d.setStroke(dp(1), strokeColor);
        return d;
    }

    private void buildUi() {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(Color.parseColor("#F3F1FA"));

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        root.setPadding(dp(20), dp(28), dp(20), dp(20));
        scroll.addView(root);

        TextView title = new TextView(this);
        title.setText("🎲 القرعة العشوائية");
        title.setTextSize(26);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setTextColor(Color.parseColor("#4527A0"));
        title.setGravity(Gravity.CENTER);
        root.addView(title);

        TextView hint = new TextView(this);
        hint.setText("اكتب الأسماء (كل اسم في سطر أو افصل بينها بفاصلة)، أو استورد ملف PDF / Word، أو شارك قائمة من أي تطبيق إلى «القرعة».");
        hint.setTextSize(14);
        hint.setTextColor(Color.parseColor("#616161"));
        hint.setGravity(Gravity.CENTER);
        hint.setPadding(0, dp(8), 0, dp(14));
        root.addView(hint);

        importButton = new Button(this);
        importButton.setText("📄 استيراد الأسماء من ملف PDF أو Word");
        importButton.setTextSize(16);
        importButton.setAllCaps(false);
        importButton.setTextColor(Color.parseColor("#4527A0"));
        importButton.setBackground(rounded(Color.parseColor("#EDE7F6"), Color.parseColor("#B39DDB")));
        importButton.setOnClickListener(new View.OnClickListener() {
            public void onClick(View v) { openFilePicker(); }
        });
        LinearLayout.LayoutParams ip = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(52));
        ip.bottomMargin = dp(12);
        root.addView(importButton, ip);

        input = new EditText(this);
        input.setHint("أحمد\nمحمد\nسارة\nفاطمة");
        input.setMinLines(6);
        input.setMaxLines(12);
        input.setGravity(Gravity.TOP | Gravity.START);
        input.setTextSize(17);
        input.setPadding(dp(14), dp(12), dp(14), dp(12));
        input.setBackground(rounded(Color.WHITE, Color.parseColor("#D1C4E9")));
        input.addTextChangedListener(new TextWatcher() {
            public void beforeTextChanged(CharSequence s, int a, int b, int c) {}
            public void onTextChanged(CharSequence s, int a, int b, int c) {}
            public void afterTextChanged(Editable s) { updateCount(); }
        });
        root.addView(input, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, dp(8), 0, dp(8));

        countLabel = new TextView(this);
        countLabel.setTextSize(14);
        countLabel.setTextColor(Color.parseColor("#4527A0"));
        row.addView(countLabel, new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

        Button clear = new Button(this);
        clear.setText("مسح");
        clear.setOnClickListener(new View.OnClickListener() {
            public void onClick(View v) {
                input.setText("");
                result.setText("");
            }
        });
        row.addView(clear);
        root.addView(row);

        removeAfterPick = new CheckBox(this);
        removeAfterPick.setText("احذف الاسم من القائمة بعد اختياره (بدون تكرار)");
        removeAfterPick.setTextSize(14);
        root.addView(removeAfterPick);

        pickButton = new Button(this);
        pickButton.setText("اختر اسماً عشوائياً");
        pickButton.setTextSize(20);
        pickButton.setTextColor(Color.WHITE);
        pickButton.setTypeface(Typeface.DEFAULT_BOLD);
        pickButton.setAllCaps(false);
        pickButton.setBackground(rounded(Color.parseColor("#5E35B1"), 0));
        pickButton.setOnClickListener(new View.OnClickListener() {
            public void onClick(View v) { pick(); }
        });
        LinearLayout.LayoutParams bp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(64));
        bp.topMargin = dp(14);
        root.addView(pickButton, bp);

        result = new TextView(this);
        result.setTextSize(32);
        result.setTypeface(Typeface.DEFAULT_BOLD);
        result.setGravity(Gravity.CENTER);
        result.setMinHeight(dp(120));
        result.setPadding(dp(12), dp(12), dp(12), dp(12));
        result.setBackground(rounded(Color.WHITE, Color.parseColor("#D1C4E9")));
        LinearLayout.LayoutParams rp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        rp.topMargin = dp(18);
        root.addView(result, rp);

        setContentView(scroll);
    }
}
