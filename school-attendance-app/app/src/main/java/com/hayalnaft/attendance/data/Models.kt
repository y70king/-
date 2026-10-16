package com.hayalnaft.attendance.data

import java.util.Calendar

object Status {
    const val NONE = 0
    const val PRESENT = 1
    const val ABSENT = 2
    const val LATE = 3
    const val EXCUSED = 4
}

object EventType {
    const val POINTS = 1
    const val GOOD = 2
    const val BAD = 3
    const val NOTE = 4
}

data class School(
    val id: Long,
    val name: String,
    val studentCount: Int = 0,
    val stage: String = Stages.SECONDARY,
    val shift: String = Shifts.MORNING,
    val year: String = defaultYear(),
    val directorate: String = "",
    val principal: String = "",
    val teacher: String = "",
    val maxMark: Int = 100,
    val exemptMark: Int = 90,
) {
    /** The school year kept left-to-right inside Arabic text, so "2026-2027" is not shown reversed. */
    val yearText: String get() = "\u202A$year\u202C"
}

data class SchoolClass(
    val id: Long,
    val schoolId: Long,
    val name: String,
    val section: String,
    val room: String,
    val ministerial: Boolean,
    val count: Int,
) {
    val title: String get() = if (section.isBlank()) name else "$name - $section"
}

data class Student(
    val id: Long,
    val schoolId: Long,
    val classId: Long,
    val className: String,
    val name: String,
    val phone: String,
)

data class Subject(val id: Long, val schoolId: Long, val name: String)

data class AttendanceRow(val student: Student, val status: Int, val notified: Boolean)

data class DayAbsence(val student: Student, val subjectName: String?, val status: Int, val notified: Boolean)

data class StudentStats(val student: Student, val present: Int, val absent: Int, val late: Int, val excused: Int) {
    val recorded: Int get() = present + absent + late + excused

    /** Share of recorded sessions the student attended (late counts as attended), or null when nothing is recorded. */
    val attendanceRate: Int? get() = if (recorded == 0) null else Math.round((present + late + excused) * 100f / recorded)
}

/** An inclusive range of ISO dates with a display name. */
data class DateRange(val from: String, val to: String, val label: String) {
    companion object {
        val ALL = DateRange("0000-00-00", "9999-12-31", "كل الفترة")
    }
}

data class HistoryRow(val date: String, val subjectName: String?, val status: Int, val subjectId: Long = 0)

data class StudentEvent(val id: Long, val studentId: Long, val date: String, val ts: Long, val type: Int, val points: Int, val note: String)

/** Daily activity summary of one student, shown on the attendance list. */
data class DayActivity(val points: Int, val good: Int, val bad: Int)

data class EventTotals(val points: Int, val good: Int, val bad: Int, val notes: Int)

data class Period(
    val id: Long,
    val schoolId: Long,
    val day: Int,
    val startMin: Int,
    val duration: Int,
    val classId: Long,
    val subjectId: Long,
    val classTitle: String = "",
    val subjectName: String = "",
)

data class LessonPlan(
    val id: Long = 0,
    val schoolId: Long,
    val date: String,
    val classId: Long? = null,
    val subjectId: Long? = null,
    val title: String = "",
    val cognitive: String = "",
    val affective: String = "",
    val psychomotor: String = "",
    val aids: String = "",
    val steps: String = "",
    val homework: String = "",
    val notes: String = "",
    val classTitle: String = "",
    val subjectName: String = "",
)

data class MessageLog(val id: Long, val studentName: String?, val phone: String, val body: String, val ts: Long, val ok: Boolean, val kind: String)

object Stages {
    const val PRIMARY = "ابتدائية"
    const val INTERMEDIATE = "متوسطة"
    const val PREPARATORY = "إعدادية"
    const val SECONDARY = "ثانوية"
    val all = listOf(PRIMARY, INTERMEDIATE, PREPARATORY, SECONDARY)

    private val primary = listOf(
        "الأول الابتدائي", "الثاني الابتدائي", "الثالث الابتدائي",
        "الرابع الابتدائي", "الخامس الابتدائي", "السادس الابتدائي",
    )
    private val intermediate = listOf("الأول المتوسط", "الثاني المتوسط", "الثالث المتوسط")
    private val preparatory = listOf(
        "الرابع العلمي", "الرابع الأدبي",
        "الخامس الإحيائي", "الخامس التطبيقي", "الخامس الأدبي",
        "السادس الإحيائي", "السادس التطبيقي", "السادس الأدبي",
    )

    fun grades(stage: String): List<String> = when (stage) {
        PRIMARY -> primary
        INTERMEDIATE -> intermediate
        PREPARATORY -> preparatory
        else -> intermediate + preparatory
    }

    /** Every grade from the first primary to the sixth preparatory. */
    val allGrades = primary + intermediate + preparatory

    /** Grades whose final exam is set by the ministry (no exemption). */
    fun isMinisterial(grade: String) = grade.startsWith("السادس") || grade == "الثالث المتوسط"

    fun defaultSubjects(stage: String): List<String> = when (stage) {
        PRIMARY -> listOf(
            "التربية الإسلامية", "اللغة العربية", "اللغة الإنكليزية", "الرياضيات",
            "العلوم", "الاجتماعيات", "التربية الفنية", "التربية الرياضية",
        )
        else -> listOf(
            "التربية الإسلامية", "اللغة العربية", "اللغة الإنكليزية", "الرياضيات",
            "الفيزياء", "الكيمياء", "الأحياء", "الاجتماعيات", "الحاسوب",
        )
    }
}

object Shifts {
    const val MORNING = "صباحي"
    const val EVENING = "مسائي"
    const val DOUBLE = "مزدوج"
    val all = listOf(MORNING, EVENING, DOUBLE)
}

/** Iraqi school year, e.g. "2026-2027"; it starts in September. */
fun defaultYear(): String {
    val c = Calendar.getInstance()
    val y = c.get(Calendar.YEAR)
    return if (c.get(Calendar.MONTH) >= Calendar.SEPTEMBER) "$y-${y + 1}" else "${y - 1}-$y"
}

const val DEFAULT_SCHOOL = "ثانوية حي النفط للبنين"
