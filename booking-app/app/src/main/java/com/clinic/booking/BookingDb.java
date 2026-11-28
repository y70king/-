package com.clinic.booking;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.os.Handler;
import android.os.Looper;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/** قاعدة بيانات الحجوزات (محلية على الهاتف). */
public class BookingDb extends SQLiteOpenHelper {

    public static class Booking {
        public long id;
        public String day;      // yyyy-MM-dd
        public int queueNo;     // رقم الدور
        public String name;     // اسم المريض/ة
        public String title;    // العنوان / ملاحظة يمكن تعديلها
        public String sender;   // اسم/رقم المرسل في واتساب
        public long createdAt;
        public boolean arrived; // واصل أم لا
    }

    public static final int FILTER_ALL = 0, FILTER_ARRIVED = 1, FILTER_WAITING = 2;

    private static BookingDb instance;
    private static Runnable changeListener;
    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    public static synchronized BookingDb get(Context c) {
        if (instance == null) instance = new BookingDb(c.getApplicationContext());
        return instance;
    }

    public static void setChangeListener(Runnable r) { changeListener = r; }

    private static void notifyChanged() {
        MAIN.post(() -> { Runnable r = changeListener; if (r != null) r.run(); });
    }

    private BookingDb(Context c) { super(c, "bookings.db", null, 1); }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE bookings (id INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT NOT NULL, " +
                "queue_no INTEGER NOT NULL, name TEXT NOT NULL, title TEXT, sender TEXT, " +
                "created_at INTEGER NOT NULL, arrived INTEGER NOT NULL DEFAULT 0)");
        db.execSQL("CREATE INDEX idx_day ON bookings(day)");
        // مفاتيح الرسائل التي تمت معالجتها حتى لا تتكرر
        db.execSQL("CREATE TABLE seen (k TEXT PRIMARY KEY, t INTEGER NOT NULL)");
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int o, int n) { }

    public static String today() { return dayOf(System.currentTimeMillis()); }

    public static String dayOf(long t) {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date(t));
    }

    public synchronized Booking add(String name, String title, String sender) {
        SQLiteDatabase db = getWritableDatabase();
        Booking b = new Booking();
        b.day = today();
        b.createdAt = System.currentTimeMillis();
        b.name = name;
        b.title = title == null ? "" : title;
        b.sender = sender == null ? "" : sender;
        try (Cursor c = db.rawQuery("SELECT IFNULL(MAX(queue_no),0) FROM bookings WHERE day=?", new String[]{b.day})) {
            b.queueNo = c.moveToFirst() ? c.getInt(0) + 1 : 1;
        }
        ContentValues v = new ContentValues();
        v.put("day", b.day);
        v.put("queue_no", b.queueNo);
        v.put("name", b.name);
        v.put("title", b.title);
        v.put("sender", b.sender);
        v.put("created_at", b.createdAt);
        v.put("arrived", 0);
        b.id = db.insert("bookings", null, v);
        notifyChanged();
        return b;
    }

    /** هل نفس المرسل حجز لنفس الاسم اليوم؟ */
    public synchronized boolean existsToday(String name, String sender) {
        try (Cursor c = getReadableDatabase().rawQuery(
                "SELECT 1 FROM bookings WHERE day=? AND name=? AND IFNULL(sender,'')=? LIMIT 1",
                new String[]{today(), name, sender == null ? "" : sender})) {
            return c.moveToFirst();
        }
    }

    public synchronized void update(Booking b) {
        ContentValues v = new ContentValues();
        v.put("name", b.name);
        v.put("title", b.title);
        v.put("sender", b.sender);
        v.put("arrived", b.arrived ? 1 : 0);
        getWritableDatabase().update("bookings", v, "id=?", new String[]{String.valueOf(b.id)});
        notifyChanged();
    }

    public synchronized void delete(long id) {
        getWritableDatabase().delete("bookings", "id=?", new String[]{String.valueOf(id)});
        notifyChanged();
    }

    public synchronized void deleteDay(String day) {
        getWritableDatabase().delete("bookings", "day=?", new String[]{day});
        notifyChanged();
    }

    public synchronized List<Booking> list(String day, int filter, String query) {
        StringBuilder where = new StringBuilder("day=?");
        List<String> args = new ArrayList<>();
        args.add(day);
        if (filter == FILTER_ARRIVED) where.append(" AND arrived=1");
        if (filter == FILTER_WAITING) where.append(" AND arrived=0");
        if (query != null && !query.trim().isEmpty()) {
            where.append(" AND (name LIKE ? OR title LIKE ? OR sender LIKE ?)");
            String q = "%" + query.trim() + "%";
            args.add(q); args.add(q); args.add(q);
        }
        List<Booking> out = new ArrayList<>();
        try (Cursor c = getReadableDatabase().query("bookings", null, where.toString(),
                args.toArray(new String[0]), null, null, "queue_no ASC")) {
            while (c.moveToNext()) {
                Booking b = new Booking();
                b.id = c.getLong(c.getColumnIndexOrThrow("id"));
                b.day = c.getString(c.getColumnIndexOrThrow("day"));
                b.queueNo = c.getInt(c.getColumnIndexOrThrow("queue_no"));
                b.name = c.getString(c.getColumnIndexOrThrow("name"));
                b.title = c.getString(c.getColumnIndexOrThrow("title"));
                b.sender = c.getString(c.getColumnIndexOrThrow("sender"));
                b.createdAt = c.getLong(c.getColumnIndexOrThrow("created_at"));
                b.arrived = c.getInt(c.getColumnIndexOrThrow("arrived")) == 1;
                out.add(b);
            }
        }
        return out;
    }

    /** [الكل، الواصلين، المنتظرين] */
    public synchronized int[] counts(String day) {
        try (Cursor c = getReadableDatabase().rawQuery(
                "SELECT COUNT(*), IFNULL(SUM(arrived),0) FROM bookings WHERE day=?", new String[]{day})) {
            if (!c.moveToFirst()) return new int[]{0, 0, 0};
            int all = c.getInt(0), arr = c.getInt(1);
            return new int[]{all, arr, all - arr};
        }
    }

    /** يرجع true اذا كانت هذه الرسالة جديدة (لم تُعالج سابقاً). */
    public synchronized boolean markSeen(String key) {
        SQLiteDatabase db = getWritableDatabase();
        long now = System.currentTimeMillis();
        db.delete("seen", "t<?", new String[]{String.valueOf(now - 7L * 24 * 3600 * 1000)});
        ContentValues v = new ContentValues();
        v.put("k", key);
        v.put("t", now);
        return db.insertWithOnConflict("seen", null, v, SQLiteDatabase.CONFLICT_IGNORE) != -1;
    }
}
