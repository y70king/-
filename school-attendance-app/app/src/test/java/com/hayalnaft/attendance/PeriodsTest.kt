package com.hayalnaft.attendance

import com.hayalnaft.attendance.util.Periods
import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.Calendar

class PeriodsTest {
    @Test
    fun followsTheIraqiSchoolCalendar() {
        // Thursday 16 October 2026.
        val now = Calendar.getInstance().apply { set(2026, Calendar.OCTOBER, 16) }
        val p = Periods.options("2026-2027", now).associateBy { it.label }
        assertEquals("2026-10-16" to "2026-10-16", p.getValue("اليوم").let { it.from to it.to })
        assertEquals("2026-10-10", p.getValue("هذا الأسبوع").from) // the week starts on Saturday
        assertEquals("2026-10-01" to "2026-10-31", p.getValue("هذا الشهر").let { it.from to it.to })
        assertEquals("2026-09-01" to "2026-09-30", p.getValue("الشهر الماضي").let { it.from to it.to })
        assertEquals("2026-09-01" to "2027-01-31", p.getValue("الفصل الأول").let { it.from to it.to })
        assertEquals("2027-02-01" to "2027-06-30", p.getValue("الفصل الثاني").let { it.from to it.to })
        assertEquals("2026-09-01" to "2027-08-31", p.getValue("السنة الدراسية").let { it.from to it.to })
    }
}
