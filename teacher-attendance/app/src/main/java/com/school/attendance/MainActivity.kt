package com.school.attendance

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.text.InputType
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast

class MainActivity : Activity() {

    private lateinit var dateView: TextView
    private lateinit var status: TextView
    private lateinit var list: LinearLayout
    private lateinit var autoBtn: android.widget.Button
    private var pendingAfterPerms: (() -> Unit)? = null

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context, i: Intent) = refresh()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        title = "حضور المدرسين"

        val root = vbox().apply { setPadding(dp(16), dp(12), dp(16), dp(12)) }
        dateView = text("", 14f, color = 0xFF616161.toInt())
        status = text("", 18f, bold = true)
        root.addView(dateView)
        root.addView(status)

        val row1 = hbox()
        row1.addView(button("فحص الآن") { withPerms { ScanService.send(this, ScanService.ACTION_ONCE) } }, weighted())
        autoBtn = button("") { toggleAuto() }
        row1.addView(autoBtn, weighted())
        root.addView(row1)

        val row2 = hbox()
        row2.addView(button("المدرسين") { startActivity(Intent(this, TeachersActivity::class.java)) }, weighted())
        row2.addView(button("تصدير Excel") { export() }, weighted())
        row2.addView(button("الإعدادات") { settings() }, weighted())
        root.addView(row2)

        list = vbox().apply { setPadding(0, dp(8), 0, 0) }
        root.addView(ScrollView(this).apply { addView(list) },
            LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        setContentView(root)

        withPerms { }
    }

    override fun onResume() {
        super.onResume()
        val f = IntentFilter(ScanService.BROADCAST_UPDATED)
        if (Build.VERSION.SDK_INT >= 26) registerReceiver(receiver, f, Context.RECEIVER_NOT_EXPORTED)
        else @SuppressLint("UnspecifiedRegisterReceiverFlag") registerReceiver(receiver, f)
        refresh()
    }

    override fun onPause() {
        unregisterReceiver(receiver)
        super.onPause()
    }

    private fun refresh() {
        val db = Db.get(this)
        val today = Clock.day()
        val teachers = db.teachers()
        val recs = db.recordsForDay(today)
        dateView.text = "اليوم: $today"
        val btOn = getSystemService(BluetoothManager::class.java)?.adapter?.isEnabled == true
        status.text = when {
            !btOn -> "⚠️ البلوتوث مطفي"
            ScanService.scanning -> "🔍 جارٍ الفحص… (حاضر ${recs.size} من ${teachers.size})"
            else -> "حاضر ${recs.size} من ${teachers.size}"
        }
        autoBtn.text = if (ScanService.autoMode) "إيقاف الفحص التلقائي" else "تشغيل الفحص التلقائي"

        list.removeAllViews()
        if (teachers.isEmpty()) {
            list.addView(text("ما مضاف أي مدرس بعد.\nاضغط «المدرسين» حتى تضيف المدرسين وتربط تلفوناتهم.", 16f))
            return
        }
        // الغائبين أولاً حتى ينتبهلهم المدير، بعدين المتأخرين، بعدين الحاضرين
        val sorted = teachers.sortedBy { t ->
            val r = recs[t.id]
            when { r == null -> 0; Clock.isLate(this, r.firstSeen) -> 1; else -> 2 }
        }
        for (t in sorted) {
            val r = recs[t.id]
            val (bg, line) = when {
                r == null -> "#FFEBEE" to "❌ غائب"
                Clock.isLate(this, r.firstSeen) -> "#FFF8E1" to "⚠️ متأخر — وصل ${Clock.hm(r.firstSeen)}"
                else -> "#E8F5E9" to "✅ حاضر — وصل ${Clock.hm(r.firstSeen)}"
            }
            val c = card(bg)
            c.addView(text(t.name, 17f, bold = true))
            c.addView(text(line, 15f))
            if (r != null) c.addView(text("آخر ظهور: ${Clock.hm(r.lastSeen)}", 13f, color = 0xFF616161.toInt()))
            list.addView(c)
        }
    }

    private fun toggleAuto() {
        if (ScanService.autoMode) ScanService.send(this, ScanService.ACTION_AUTO_STOP)
        else withPerms {
            ScanService.send(this, ScanService.ACTION_AUTO_START)
            Toast.makeText(this, "الفحص التلقائي يعيد كل ${Prefs.intervalMin(this)} دقيقة. خلي التلفون على الشحن.", Toast.LENGTH_LONG).show()
        }
        status.postDelayed({ refresh() }, 300)
    }

    // ---------- الصلاحيات ----------

    /** يتأكد من الصلاحيات والبلوتوث والموقع، وبعدها ينفذ [then]. */
    fun withPerms(then: () -> Unit) {
        val missing = Perms.missing(this, Perms.required() + Perms.optional())
        if (missing.isNotEmpty()) {
            pendingAfterPerms = then
            requestPermissions(missing.toTypedArray(), 1)
            return
        }
        if (ensureBluetoothAndLocation()) then()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        val then = pendingAfterPerms
        pendingAfterPerms = null
        if (Perms.hasRequired(this)) {
            if (ensureBluetoothAndLocation()) then?.invoke()
        } else {
            AlertDialog.Builder(this)
                .setTitle("الصلاحيات مطلوبة")
                .setMessage("التطبيق يحتاج صلاحية «الأجهزة القريبة» و«الموقع» حتى يكدر يفحص البلوتوث. ما نستخدم الموقع لأي شي ثاني.")
                .setPositiveButton("فتح الإعدادات") { _, _ ->
                    startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
                }
                .setNegativeButton("لاحقاً", null)
                .show()
        }
    }

    @SuppressLint("MissingPermission")
    private fun ensureBluetoothAndLocation(): Boolean {
        val adapter = getSystemService(BluetoothManager::class.java)?.adapter
        if (adapter == null) {
            Toast.makeText(this, "هذا الجهاز ما بيه بلوتوث", Toast.LENGTH_LONG).show()
            return false
        }
        if (!adapter.isEnabled) {
            startActivity(Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE))
            return false
        }
        if (!Perms.locationOn(this)) {
            AlertDialog.Builder(this)
                .setMessage("شغّل الموقع (GPS) — أغلب التلفونات ما تبحث عن أجهزة البلوتوث إذا الموقع مطفي.")
                .setPositiveButton("تشغيل") { _, _ -> startActivity(Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)) }
                .setNegativeButton("تخطي", null)
                .show()
        }
        return true
    }

    // ---------- التصدير ----------

    private fun export() {
        val i = Intent(Intent.ACTION_CREATE_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType("text/csv")
            .putExtra(Intent.EXTRA_TITLE, "حضور-المدرسين-${Clock.day()}.csv")
        startActivityForResult(i, 2)
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        val uri = data?.data
        if (requestCode != 2 || resultCode != RESULT_OK || uri == null) return
        try {
            contentResolver.openOutputStream(uri)?.use { it.write(Export.csv(this)) }
            Toast.makeText(this, "تم حفظ الملف ✅ تكدر تفتحه بـ Excel", Toast.LENGTH_LONG).show()
        } catch (e: Exception) {
            Toast.makeText(this, "فشل الحفظ: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    // ---------- الإعدادات ----------

    private fun settings() {
        val box = vbox().apply { setPadding(dp(20), dp(8), dp(20), 0) }
        box.addView(text("وقت التأخير (بعده يعتبر متأخر):", 14f))
        val late = EditText(this).apply { setText(Prefs.lateTime(this@MainActivity)); inputType = InputType.TYPE_CLASS_DATETIME or InputType.TYPE_DATETIME_VARIATION_TIME }
        box.addView(late)
        box.addView(text("الفحص التلقائي كل كم دقيقة:", 14f))
        val interval = EditText(this).apply { setText(Prefs.intervalMin(this@MainActivity).toString()); inputType = InputType.TYPE_CLASS_NUMBER }
        box.addView(interval)

        val dlg = AlertDialog.Builder(this)
            .setTitle("الإعدادات")
            .setView(box)
            .setPositiveButton("حفظ") { _, _ ->
                val l = late.text.toString().trim()
                if (Clock.validHm(l)) Prefs.setLateTime(this, l)
                else Toast.makeText(this, "اكتب الوقت بهالشكل: 08:00", Toast.LENGTH_LONG).show()
                interval.text.toString().toIntOrNull()?.let { Prefs.setIntervalMin(this, it) }
                refresh()
            }
            .setNegativeButton("إلغاء", null)

        val pm = getSystemService(PowerManager::class.java)
        if (!pm.isIgnoringBatteryOptimizations(packageName)) {
            dlg.setNeutralButton("إيقاف توفير البطارية") { _, _ ->
                @SuppressLint("BatteryLife")
                val i = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName"))
                startActivity(i)
            }
        }
        dlg.show()
    }
}
