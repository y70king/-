package com.school.attendance

import android.content.Context

/** ملف CSV يفتح بـ Excel (مع BOM حتى يطلع العربي صح). */
object Export {
    fun csv(ctx: Context): ByteArray {
        val db = Db.get(ctx)
        val teachers = db.teachers()
        val sb = StringBuilder()
        sb.append(row("التاريخ", "المدرس", "الحالة", "وقت الحضور", "آخر ظهور"))
        for (day in db.days()) {
            val recs = db.recordsForDay(day)
            for (t in teachers) {
                val r = recs[t.id]
                if (r == null) sb.append(row(day, t.name, "غائب", "", ""))
                else sb.append(
                    row(
                        day, t.name,
                        if (Clock.isLate(ctx, r.firstSeen)) "متأخر" else "حاضر",
                        Clock.hm(r.firstSeen), Clock.hm(r.lastSeen)
                    )
                )
            }
        }
        val bom = byteArrayOf(0xEF.toByte(), 0xBB.toByte(), 0xBF.toByte())
        return bom + sb.toString().toByteArray(Charsets.UTF_8)
    }

    private fun row(vararg cells: String) =
        cells.joinToString(",") { "\"" + it.replace("\"", "\"\"") + "\"" } + "\r\n"
}
