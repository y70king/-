package com.hayalnaft.attendance.util

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.telephony.SmsManager
import android.widget.Toast
import androidx.core.content.ContextCompat
import com.hayalnaft.attendance.data.Student
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

class Prefs(context: Context) {
    private val sp = context.getSharedPreferences("settings", Context.MODE_PRIVATE)

    var schoolId: Long
        get() = sp.getLong("school", 0)
        set(v) = sp.edit().putLong("school", v).apply()

    var autoSend: Boolean
        get() = sp.getBoolean("auto_send", true)
        set(v) = sp.edit().putBoolean("auto_send", v).apply()

    var notifyLate: Boolean
        get() = sp.getBoolean("notify_late", false)
        set(v) = sp.edit().putBoolean("notify_late", v).apply()

    var absentTemplate: String
        get() = sp.getString("absent_tpl", null) ?: DEFAULT_ABSENT
        set(v) = sp.edit().putString("absent_tpl", v).apply()

    var lateTemplate: String
        get() = sp.getString("late_tpl", null) ?: DEFAULT_LATE
        set(v) = sp.edit().putString("late_tpl", v).apply()

    var countryCode: String
        get() = sp.getString("country_code", null) ?: "964"
        set(v) = sp.edit().putString("country_code", v).apply()

    companion object {
        const val DEFAULT_ABSENT =
            "ولي أمر الطالب {الطالب} المحترم، نعلمكم بغياب ابنكم عن الدوام يوم {اليوم} {التاريخ}. إدارة {المدرسة}"
        const val DEFAULT_LATE =
            "ولي أمر الطالب {الطالب} المحترم، نعلمكم بتأخر ابنكم عن الدوام يوم {اليوم} {التاريخ}. إدارة {المدرسة}"
    }
}

object Dates {
    private fun iso() = SimpleDateFormat("yyyy-MM-dd", Locale.US)
    private fun isoUtc() = iso().apply { timeZone = TimeZone.getTimeZone("UTC") }

    fun today(): String = iso().format(Date())
    fun monthStart(): String = SimpleDateFormat("yyyy-MM-01", Locale.US).format(Date())
    private fun parse(s: String): Date = runCatching { iso().parse(s) }.getOrNull() ?: Date()
    fun dayName(s: String): String = SimpleDateFormat("EEEE", Locale("ar")).format(parse(s))
    fun display(s: String): String = SimpleDateFormat("yyyy/MM/dd", Locale.US).format(parse(s))
    fun pretty(s: String): String = "${dayName(s)} ${display(s)}"
    fun time(ms: Long): String = SimpleDateFormat("yyyy/MM/dd  hh:mm a", Locale.US).format(Date(ms))
    fun toUtcMillis(s: String): Long = runCatching { isoUtc().parse(s)?.time }.getOrNull() ?: System.currentTimeMillis()
    fun fromUtcMillis(ms: Long): String = isoUtc().format(Date(ms))
}

object Templates {
    fun fill(template: String, student: Student?, school: String, date: String): String =
        template
            .replace("{الطالب}", student?.name ?: "")
            .replace("{الصف}", student?.className ?: "")
            .replace("{المدرسة}", school)
            .replace("{اليوم}", Dates.dayName(date))
            .replace("{التاريخ}", Dates.display(date))
}

object Phone {
    fun hasSmsPermission(context: Context): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED

    /** Sends an SMS straight from the phone's SIM. Works without internet. */
    fun sendSms(context: Context, phone: String, body: String): Boolean = try {
        val sm: SmsManager = if (Build.VERSION.SDK_INT >= 31) {
            context.getSystemService(SmsManager::class.java)
        } else {
            @Suppress("DEPRECATION")
            SmsManager.getDefault()
        }
        val parts = sm.divideMessage(body)
        if (parts.size > 1) sm.sendMultipartTextMessage(phone, null, parts, null, null)
        else sm.sendTextMessage(phone, null, body, null, null)
        true
    } catch (e: Exception) {
        false
    }

    fun dial(context: Context, phone: String) =
        start(context, Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone")))

    fun openSmsApp(context: Context, phone: String, body: String) =
        start(context, Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:$phone")).putExtra("sms_body", body))

    fun whatsapp(context: Context, phone: String, body: String, countryCode: String) {
        var d = phone.filter { it.isDigit() }
        d = when {
            d.startsWith("00") -> d.drop(2)
            d.startsWith("0") -> countryCode + d.drop(1)
            else -> d
        }
        start(context, Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/$d?text=" + Uri.encode(body))))
    }

    private fun start(context: Context, intent: Intent) {
        try {
            context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e: ActivityNotFoundException) {
            Toast.makeText(context, "لا يوجد تطبيق مناسب على الجهاز", Toast.LENGTH_SHORT).show()
        }
    }
}
