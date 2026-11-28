package com.clinic.booking;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Person;
import android.app.RemoteInput;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Parcelable;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import java.util.regex.Pattern;

/**
 * يستمع لإشعارات واتساب وواتساب للأعمال.
 * كل رسالة يرسلها الزبون (اسم المريض/ة) تتحول الى صف في جدول حجوزات اليوم.
 */
public class WhatsAppListener extends NotificationListenerService {

    private static final String WA = "com.whatsapp";
    private static final String WA_BUSINESS = "com.whatsapp.w4b";

    private static final Pattern SKIP = Pattern.compile(
            "(?i).*(\\d+\\s+(new\\s+)?messages|رسائل جديدة|رسالة جديدة|رسالتان جديدتان|" +
            "this message was deleted|تم حذف هذه الرسالة|missed (voice|video) call|مكالمة|" +
            "checking for new messages|جارٍ التحقق|incoming (voice|video) call|calling…|يتصل).*");

    // رموز رسائل الوسائط (صورة، فيديو، صوت، ملف، ملصق، موقع، جهة اتصال)
    private static final Pattern MEDIA = Pattern.compile("^\\s*(📷|🎥|🎤|🎵|📄|📎|🗺|📍|👤|🎬|GIF|Sticker|ملصق)");

    private static final Pattern PREFIX = Pattern.compile(
            "^\\s*(حجز|احجز|أحجز|موعد|اسم\\s+المريض/ة|اسم\\s+المريضة|اسم\\s+المريض|المريض/ة|المريضة|المريض|الاسم|اسم)(\\s*[:：\\-–]+\\s*|\\s+)");

    private static final Pattern ONLY_PREFIX = Pattern.compile(
            "^(حجز|احجز|أحجز|موعد|اسم|الاسم|المريض|المريضة|المريض/ة|مرحبا|السلام عليكم|هلو|شكرا|شكراً)$");

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            handle(sbn);
        } catch (Throwable ignored) {
            // لا نسمح لأي خطأ في قراءة إشعار ان يوقف الخدمة
        }
    }

    private void handle(StatusBarNotification sbn) {
        String pkg = sbn.getPackageName();
        if (!WA.equals(pkg) && !WA_BUSINESS.equals(pkg)) return;

        Prefs prefs = new Prefs(this);
        if (!prefs.enabled()) return;

        Notification n = sbn.getNotification();
        if (n == null) return;
        if ((n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;

        Bundle ex = n.extras;
        if (ex == null) return;

        boolean isGroup = ex.getBoolean(Notification.EXTRA_IS_GROUP_CONVERSATION, false)
                || ex.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE) != null;
        if (isGroup && !prefs.acceptGroups()) return;

        String title = str(ex.getCharSequence(Notification.EXTRA_TITLE));
        if (title.isEmpty() || title.equalsIgnoreCase("WhatsApp") || title.equalsIgnoreCase("WhatsApp Business")) return;

        BookingDb db = BookingDb.get(this);
        BookingDb.Booking last = null;

        Parcelable[] msgs = ex.getParcelableArray(Notification.EXTRA_MESSAGES);
        if (msgs != null && msgs.length > 0) {
            for (Parcelable p : msgs) {
                if (!(p instanceof Bundle)) continue;
                Bundle m = (Bundle) p;
                String text = str(m.getCharSequence("text"));
                long time = m.getLong("time", 0);
                String sender = senderOf(m);
                if (sender.isEmpty()) continue; // رسالة مرسلة من صاحب الهاتف نفسه
                BookingDb.Booking b = process(db, prefs, pkg, sender, text, time);
                if (b != null) last = b;
            }
        } else {
            String text = str(ex.getCharSequence(Notification.EXTRA_TEXT));
            BookingDb.Booking b = process(db, prefs, pkg, title, text, n.when);
            if (b != null) last = b;
        }

        if (last != null && prefs.autoReply()) reply(n, prefs, last);
    }

    private BookingDb.Booking process(BookingDb db, Prefs prefs, String pkg, String sender, String text, long time) {
        if (text.isEmpty()) return null;
        // تجاهل الرسائل القديمة (أكثر من 12 ساعة) التي قد تظهر عند إعادة تشغيل الهاتف
        if (time > 0 && System.currentTimeMillis() - time > 12L * 3600 * 1000) return null;
        // لا نحوّل ردّنا التلقائي الى حجز
        String replyHead = prefs.replyText().split("\\{")[0].trim();
        if (!replyHead.isEmpty() && text.startsWith(replyHead)) return null;

        String name = extractName(text, prefs.keyword());
        if (name == null) return null;

        String key = pkg + "|" + sender + "|" + time + "|" + text;
        if (!db.markSeen(key)) return null;
        if (db.existsToday(name, sender)) return null;

        return db.add(name, "", sender);
    }

    /** يستخرج اسم المريض/ة من نص الرسالة، أو null اذا لم تكن رسالة حجز. */
    public static String extractName(String text, String keyword) {
        if (text == null) return null;
        String t = text.trim();
        if (t.isEmpty() || SKIP.matcher(t).matches() || MEDIA.matcher(t).find()) return null;
        if (keyword != null && !keyword.trim().isEmpty()) {
            String k = keyword.trim();
            if (!t.contains(k)) return null;
            t = t.replace(k, " ");
        }
        t = t.replaceAll("[\\r\\n\\t]+", " ");
        for (int i = 0; i < 3; i++) t = PREFIX.matcher(t).replaceFirst("");
        t = t.replaceAll("\\s{2,}", " ").trim();
        t = t.replaceAll("^[:：\\-–.,،]+|[:：\\-–.,،]+$", "").trim();
        if (t.isEmpty() || ONLY_PREFIX.matcher(t).matches()) return null;
        if (t.length() > 80) t = t.substring(0, 80).trim() + "…";
        return t;
    }

    private static String senderOf(Bundle m) {
        CharSequence s = m.getCharSequence("sender");
        if (s != null && s.length() > 0) return s.toString().trim();
        if (Build.VERSION.SDK_INT >= 28) {
            Parcelable p = m.getParcelable("sender_person");
            if (p instanceof Person) {
                CharSequence nm = ((Person) p).getName();
                if (nm != null) return nm.toString().trim();
            }
        }
        return "";
    }

    /** رد تلقائي عبر زر «رد» الموجود في إشعار واتساب. */
    private void reply(Notification n, Prefs prefs, BookingDb.Booking b) {
        if (n.actions == null) return;
        String msg = prefs.replyText()
                .replace("{name}", b.name)
                .replace("{n}", String.valueOf(b.queueNo));
        for (Notification.Action a : n.actions) {
            RemoteInput[] inputs = a.getRemoteInputs();
            if (inputs == null || inputs.length == 0 || a.actionIntent == null) continue;
            Intent fill = new Intent();
            Bundle results = new Bundle();
            for (RemoteInput ri : inputs) results.putCharSequence(ri.getResultKey(), msg);
            RemoteInput.addResultsToIntent(inputs, fill, results);
            try {
                a.actionIntent.send(this, 0, fill);
            } catch (PendingIntent.CanceledException ignored) { }
            return;
        }
    }

    private static String str(CharSequence cs) { return cs == null ? "" : cs.toString().trim(); }
}
