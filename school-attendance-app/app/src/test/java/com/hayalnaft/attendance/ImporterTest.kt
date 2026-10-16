package com.hayalnaft.attendance

import com.hayalnaft.attendance.util.Importer
import com.hayalnaft.attendance.util.ParsedStudent
import org.junit.Assert.assertEquals
import org.junit.Test

class ImporterTest {
    private fun resource(name: String) = javaClass.classLoader!!.getResourceAsStream(name).readBytes()

    @Test
    fun readsFirstExcelSheet() {
        assertEquals(
            listOf(
                ParsedStudent("أحمد محمد علي", "07701234567"),
                ParsedStudent("علي حسين كاظم", "07801234567"),
                ParsedStudent("مصطفى كريم جاسم", ""),
                ParsedStudent("حسن عباس فاضل", "07709876543"),
            ),
            Importer.fromBytes(resource("students.xlsx")),
        )
    }

    private val excelStudents = listOf(
        ParsedStudent("أحمد محمد علي", "07701234567"),
        ParsedStudent("علي حسين كاظم", "07801234567"),
        ParsedStudent("مصطفى كريم جاسم", ""),
        ParsedStudent("حسن عباس فاضل", "07709876543"),
    )

    private val wordStudents = listOf(
        ParsedStudent("محمد جواد كاظم", "07711112222"),
        ParsedStudent("زيد علي حسين", ""),
        ParsedStudent("كرار عادل سالم", "07501112233"),
        ParsedStudent("سجاد ماجد", ""),
    )

    @Test
    fun readsOldExcelFormat() {
        assertEquals(excelStudents, Importer.fromBytes(resource("students.xls")))
    }

    @Test
    fun readsLongOldExcelListAcrossContinueRecords() {
        val list = Importer.fromBytes(resource("many.xls"))
        assertEquals(400, list.size)
        assertEquals(ParsedStudent("طالب رقم 1 محمد عبد الله الحسيني", "07700000001"), list.first())
        assertEquals(ParsedStudent("طالب رقم 400 محمد عبد الله الحسيني", "07700000400"), list.last())
    }

    @Test
    fun readsOldWordFormat() {
        assertEquals(wordStudents, Importer.fromBytes(resource("students.doc")))
    }

    @Test
    fun readsWordParagraphsAndTables() {
        assertEquals(
            listOf(
                ParsedStudent("محمد جواد كاظم", "07711112222"),
                ParsedStudent("زيد علي حسين", ""),
                ParsedStudent("كرار عادل سالم", "07501112233"),
                ParsedStudent("سجاد ماجد", ""),
            ),
            Importer.fromBytes(resource("students.docx")),
        )
    }

    @Test
    fun readsPastedText() {
        val text = """
            الاسم	الهاتف
            1) أحمد محمد علي	07701234567
            علي حسين كاظم - 0780 123 4567
            ٣- مصطفى كريم جاسم
            حسن عباس، 07709876543

        """.trimIndent()
        assertEquals(
            listOf(
                ParsedStudent("أحمد محمد علي", "07701234567"),
                ParsedStudent("علي حسين كاظم", "07801234567"),
                ParsedStudent("مصطفى كريم جاسم", ""),
                ParsedStudent("حسن عباس", "07709876543"),
            ),
            Importer.fromText(text),
        )
    }

    @Test
    fun readsWindowsArabicCsv() {
        val csv = "اسم الطالب,رقم ولي الأمر\r\nعمر خالد,+9647701234567\r\n".toByteArray(charset("windows-1256"))
        assertEquals(listOf(ParsedStudent("عمر خالد", "+9647701234567")), Importer.fromBytes(csv))
    }
}
