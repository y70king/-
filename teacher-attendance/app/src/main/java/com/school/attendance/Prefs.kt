package com.school.attendance

import android.content.Context
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object Prefs {
    private fun sp(ctx: Context) = ctx.getSharedPreferences("settings", Context.MODE_PRIVATE)

    /** بعد هذا الوقت يعتبر المدرس متأخر. */
    fun lateTime(ctx: Context): String = sp(ctx).getString("late", "08:00")!!
    fun setLateTime(ctx: Context, v: String) = sp(ctx).edit().putString("late", v).apply()

    /** كل كم دقيقة يعيد الفحص التلقائي. */
    fun intervalMin(ctx: Context): Int = sp(ctx).getInt("interval", 2)
    fun setIntervalMin(ctx: Context, v: Int) = sp(ctx).edit().putInt("interval", v.coerceIn(1, 60)).apply()

    fun autoMode(ctx: Context): Boolean = sp(ctx).getBoolean("auto", false)
    fun setAutoMode(ctx: Context, v: Boolean) = sp(ctx).edit().putBoolean("auto", v).apply()
}

object Clock {
    fun day(t: Long = System.currentTimeMillis()): String = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(t))
    fun hm(t: Long): String = SimpleDateFormat("HH:mm", Locale.US).format(Date(t))

    fun isLate(ctx: Context, firstSeen: Long): Boolean = hm(firstSeen) > Prefs.lateTime(ctx)

    fun validHm(s: String): Boolean = Regex("^([01]\\d|2[0-3]):[0-5]\\d$").matches(s)
}
