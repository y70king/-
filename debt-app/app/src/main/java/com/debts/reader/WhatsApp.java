package com.debts.reader;

import android.content.Intent;
import android.net.Uri;

import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;

public class WhatsApp {

    public static final String DEFAULT_TEMPLATE =
            "السلام عليكم {الاسم}\nنود تذكيركم بأن عليكم مبلغ {المبلغ} دينار مستحق التسديد منذ {الأيام} يوم.\nنرجو التسديد في أقرب وقت، وشكراً لكم.";

    /** يحوّل الرقم إلى صيغة دولية بدون + (مثال 9647701234567)، أو "" إذا كان غير صالح */
    public static String normalizePhone(String phone) {
        String d = phone.replaceAll("[^0-9]", "");
        if (d.startsWith("00")) d = d.substring(2);
        if (d.startsWith("9640")) d = "964" + d.substring(4);
        else if (d.startsWith("07")) d = "964" + d.substring(1);
        return d.length() >= 10 ? d : "";
    }

    public static String message(String template, KonnashParser.Customer c, int days) {
        return template
                .replace("{الاسم}", c.name)
                .replace("{المبلغ}", MainActivity.money(c.due()))
                .replace("{الأيام}", String.valueOf(days));
    }

    public static Intent intent(String phone, String text) {
        String enc;
        try {
            enc = URLEncoder.encode(text, "UTF-8").replace("+", "%20");
        } catch (UnsupportedEncodingException e) {
            enc = "";
        }
        return new Intent(Intent.ACTION_VIEW,
                Uri.parse("https://api.whatsapp.com/send?phone=" + phone + "&text=" + enc));
    }
}
