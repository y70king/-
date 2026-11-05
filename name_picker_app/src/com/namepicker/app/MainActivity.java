package com.namepicker.app;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
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

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends Activity {

    private static final String PREFS = "names";
    private static final String KEY_LIST = "list";

    private final SecureRandom random = new SecureRandom();
    private final Handler handler = new Handler(Looper.getMainLooper());

    private EditText input;
    private TextView result;
    private TextView countLabel;
    private CheckBox removeAfterPick;
    private Button pickButton;
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

    /** نص مُرسل من تطبيق آخر عبر "مشاركة" يصبح هو القائمة. */
    private void handleShare(Intent intent) {
        if (intent != null && Intent.ACTION_SEND.equals(intent.getAction())) {
            CharSequence shared = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
            if (shared != null && shared.length() > 0) {
                input.setText(shared);
                result.setText("تم استلام القائمة ✔");
                updateCount();
            }
        }
    }

    /** يقبل الأسماء مفصولة بسطر جديد أو فاصلة (عربية أو إنجليزية) أو فاصلة منقوطة. */
    private List<String> parseNames() {
        List<String> names = new ArrayList<>();
        String[] parts = input.getText().toString().split("[\\n\\r,،;؛]+");
        for (String p : parts) {
            String n = p.trim().replaceFirst("^[0-9٠-٩]+[\\.\\-\\)]\\s*", "").trim();
            if (!n.isEmpty()) names.add(n);
        }
        return names;
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
        hint.setText("اكتب الأسماء (كل اسم في سطر أو افصل بينها بفاصلة)، أو شارك قائمة من أي تطبيق إلى «القرعة».");
        hint.setTextSize(14);
        hint.setTextColor(Color.parseColor("#616161"));
        hint.setGravity(Gravity.CENTER);
        hint.setPadding(0, dp(8), 0, dp(14));
        root.addView(hint);

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
