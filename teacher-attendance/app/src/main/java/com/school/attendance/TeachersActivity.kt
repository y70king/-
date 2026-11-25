package com.school.attendance

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.widget.ArrayAdapter
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.ScrollView
import android.widget.Toast

@SuppressLint("MissingPermission")
class TeachersActivity : Activity() {

    private lateinit var list: LinearLayout
    private val adapter get() = getSystemService(BluetoothManager::class.java)?.adapter

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        title = "المدرسين"
        val root = vbox().apply { setPadding(dp(16), dp(12), dp(16), dp(12)) }

        root.addView(text(
            "طريقة التسجيل (مرة وحدة لكل مدرس):\n" +
            "1) المدرس يشغّل البلوتوث ويفتح صفحة البلوتوث بإعدادات تلفونه.\n" +
            "2) اضغط «بحث عن أجهزة قريبة» واختار تلفونه، واكتب اسمه.\n" +
            "3) وافقوا على طلب الربط (Pair) بالتلفونين.\n" +
            "بعدها كل يوم يتسجل حضوره تلقائياً إذا البلوتوث بتلفونه شغال.", 14f, color = 0xFF424242.toInt()))

        val row = hbox()
        row.addView(button("بحث عن أجهزة قريبة") { searchNearby() }, weighted())
        row.addView(button("من الأجهزة المربوطة") { pickBonded() }, weighted())
        root.addView(row)
        root.addView(button("فتح إعدادات البلوتوث") { startActivity(Intent(Settings.ACTION_BLUETOOTH_SETTINGS)) })

        list = vbox().apply { setPadding(0, dp(8), 0, 0) }
        root.addView(ScrollView(this).apply { addView(list) },
            LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        setContentView(root)
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    private fun refresh() {
        list.removeAllViews()
        val teachers = Db.get(this).teachers()
        if (teachers.isEmpty()) {
            list.addView(text("ما مضاف أي مدرس بعد.", 15f))
            return
        }
        val bonded = bondedAddresses()
        for (t in teachers) {
            val c = card("#F5F5F5")
            c.addView(text(t.name, 17f, bold = true))
            val paired = t.address in bonded
            c.addView(text(
                t.address + if (paired) "  •  مربوط ✓" else "  •  غير مربوط (يتسجل بس إذا تلفونه ظاهر للبحث)",
                12f, color = if (paired) 0xFF2E7D32.toInt() else 0xFFE65100.toInt()))
            val actions = hbox()
            actions.addView(button("تعديل الاسم") { rename(t) }, weighted())
            if (!paired) actions.addView(button("ربط") { pair(t.address) }, weighted())
            actions.addView(button("حذف") { delete(t) }, weighted())
            c.addView(actions)
            list.addView(c)
        }
    }

    private fun bondedAddresses(): Set<String> =
        try { adapter?.bondedDevices.orEmpty().map { it.address.uppercase() }.toSet() } catch (_: Exception) { emptySet() }

    private fun ready(): Boolean {
        if (!Perms.hasRequired(this)) {
            Toast.makeText(this, "وافق على الصلاحيات من الشاشة الرئيسية أولاً", Toast.LENGTH_LONG).show()
            return false
        }
        if (adapter?.isEnabled != true) {
            Toast.makeText(this, "شغّل البلوتوث أولاً", Toast.LENGTH_LONG).show()
            return false
        }
        return true
    }

    private fun pickBonded() {
        if (!ready()) return
        val devices = try { adapter?.bondedDevices.orEmpty().toList() } catch (_: Exception) { emptyList() }
        if (devices.isEmpty()) {
            Toast.makeText(this, "ماكو أجهزة مربوطة. استخدم «بحث عن أجهزة قريبة».", Toast.LENGTH_LONG).show()
            return
        }
        val labels = devices.map { "${it.name ?: "بدون اسم"}\n${it.address}" }.toTypedArray()
        AlertDialog.Builder(this)
            .setTitle("اختار تلفون المدرس")
            .setItems(labels) { _, i -> askName(devices[i].address, devices[i].name, pairAfter = false) }
            .show()
    }

    private fun searchNearby() {
        if (!ready()) return
        if (ScanService.scanning) {
            Toast.makeText(this, "انتظر شوية، يوجد فحص شغال هسه", Toast.LENGTH_SHORT).show()
            return
        }
        val found = LinkedHashMap<String, String?>()
        val items = ArrayAdapter<String>(this, android.R.layout.simple_list_item_1, ArrayList())
        val lv = ListView(this).apply { this.adapter = items }
        lateinit var scanner: BtScanner
        lateinit var dlg: AlertDialog

        fun rebuild() {
            items.clear()
            items.addAll(found.map { (addr, name) -> "${name ?: "بدون اسم"}\n$addr" })
        }

        scanner = BtScanner(this, object : BtScanner.Listener {
            override fun onDevice(address: String, name: String?, rssi: Int, classic: Boolean) {
                // أجهزة BLE بدون اسم هواي وما تفيد، نعرض بس اللي إلها اسم أو ظاهرة بالبحث العادي
                if (!classic && name == null) return
                if (found.containsKey(address) && (name == null || found[address] != null)) return
                found[address] = name ?: found[address]
                rebuild()
            }
            override fun onFinished() {
                dlg.setTitle(if (found.isEmpty()) "ما لكينا أجهزة — تأكد صفحة البلوتوث مفتوحة بتلفون المدرس" else "انتهى البحث — اختار التلفون")
            }
        })

        lv.setOnItemClickListener { _, _, pos, _ ->
            val (addr, name) = found.entries.elementAt(pos).let { it.key to it.value }
            scanner.cancel()
            dlg.dismiss()
            askName(addr, name, pairAfter = true)
        }

        dlg = AlertDialog.Builder(this)
            .setTitle("جارٍ البحث… (≈15 ثانية)")
            .setView(lv)
            .setNegativeButton("إغلاق", null)
            .setOnDismissListener { scanner.cancel(); ScanService.paused = false }
            .create()
        ScanService.paused = true
        dlg.show()
        scanner.start(emptySet())
    }

    private fun askName(address: String, deviceName: String?, pairAfter: Boolean) {
        val input = EditText(this).apply { hint = "اسم المدرس" }
        AlertDialog.Builder(this)
            .setTitle("اسم صاحب الجهاز")
            .setMessage("الجهاز: ${deviceName ?: address}")
            .setView(input)
            .setPositiveButton("حفظ") { _, _ ->
                val name = input.text.toString().trim()
                if (name.isEmpty()) {
                    Toast.makeText(this, "لازم تكتب الاسم", Toast.LENGTH_SHORT).show()
                    return@setPositiveButton
                }
                if (!Db.get(this).addTeacher(name, address)) {
                    Toast.makeText(this, "هذا الجهاز مسجل لمدرس ثاني", Toast.LENGTH_LONG).show()
                    return@setPositiveButton
                }
                if (pairAfter && address !in bondedAddresses()) pair(address)
                refresh()
            }
            .setNegativeButton("إلغاء", null)
            .show()
    }

    /** الربط يخلي التطبيق يتعرف على التلفون حتى لو مو ظاهر للبحث أو عنوانه يتغير. */
    private fun pair(address: String) {
        if (!ready()) return
        try {
            val d: BluetoothDevice = adapter!!.getRemoteDevice(address)
            if (d.createBond()) Toast.makeText(this, "وافقوا على طلب الربط بالتلفونين", Toast.LENGTH_LONG).show()
            else Toast.makeText(this, "ما صار الربط. خلي المدرس يفتح صفحة البلوتوث ويحاول مرة ثانية", Toast.LENGTH_LONG).show()
        } catch (e: Exception) {
            Toast.makeText(this, "خطأ بالربط: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    private fun rename(t: Teacher) {
        val input = EditText(this).apply { setText(t.name) }
        AlertDialog.Builder(this)
            .setTitle("تعديل الاسم")
            .setView(input)
            .setPositiveButton("حفظ") { _, _ ->
                val n = input.text.toString().trim()
                if (n.isNotEmpty()) { Db.get(this).renameTeacher(t.id, n); refresh() }
            }
            .setNegativeButton("إلغاء", null)
            .show()
    }

    private fun delete(t: Teacher) {
        AlertDialog.Builder(this)
            .setMessage("تحذف ${t.name} وكل سجل حضوره؟")
            .setPositiveButton("حذف") { _, _ -> Db.get(this).deleteTeacher(t.id); refresh() }
            .setNegativeButton("إلغاء", null)
            .show()
    }
}
