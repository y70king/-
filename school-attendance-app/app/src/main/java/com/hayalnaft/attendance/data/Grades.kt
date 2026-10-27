package com.hayalnaft.attendance.data

import kotlin.math.ceil

/** Where a grade column counts in the Iraqi year. */
object GradeRole {
    const val S1 = "s1"
    const val MID = "mid"
    const val S2 = "s2"
    const val FINAL = "final"

    val all = listOf(S1, MID, S2, FINAL)

    fun label(r: String) = when (r) {
        S1 -> "الفصل الأول"
        MID -> "نصف السنة"
        S2 -> "الفصل الثاني"
        FINAL -> "الامتحان النهائي"
        else -> r
    }
}

/**
 * A grade the teacher added for a class and subject, e.g. "الشهر الأول" out of 20 counting in the first semester.
 * Columns are kept in the order they were added within their role.
 */
data class GradeColumn(
    val id: Long,
    val classId: Long,
    val subjectId: Long,
    val title: String,
    val role: String,
    val maxMark: Double,
    val position: Int,
)

/** Ready-made column names with their role, offered when adding a column. */
val gradePresets = listOf(
    "الشهر الأول" to GradeRole.S1,
    "الشهر الثاني" to GradeRole.S1,
    "الشهر الثالث" to GradeRole.S1,
    "نصف السنة" to GradeRole.MID,
    "الشهر الأول - ف2" to GradeRole.S2,
    "الشهر الثاني - ف2" to GradeRole.S2,
    "الشهر الثالث - ف2" to GradeRole.S2,
    "الامتحان النهائي" to GradeRole.FINAL,
)

/** The usual Iraqi set: two months per semester, mid-year and final. */
val standardColumns = listOf(
    "الشهر الأول" to GradeRole.S1,
    "الشهر الثاني" to GradeRole.S1,
    "نصف السنة" to GradeRole.MID,
    "الشهر الأول - ف2" to GradeRole.S2,
    "الشهر الثاني - ف2" to GradeRole.S2,
    "الامتحان النهائي" to GradeRole.FINAL,
)

/** Columns of one subject in one class with every mark: column id → student id → mark. */
data class SubjectGrades(val columns: List<GradeColumn>, val marks: Map<Long, Map<Long, Double>>) {
    fun of(studentId: Long): Map<Long, Double> =
        marks.mapNotNull { (col, byStudent) -> byStudent[studentId]?.let { col to it } }.toMap()

    companion object {
        val EMPTY = SubjectGrades(emptyList(), emptyMap())
    }
}

data class GradeResult(
    val semester1: Int?,
    val mid: Int?,
    val semester2: Int?,
    /** السعي السنوي */
    val annual: Int?,
    val finalExam: Int?,
    val finalGrade: Int?,
    val exempt: Boolean,
    val status: String,
)

/**
 * Iraqi grading for intermediate and preparatory schools. Every mark is first scaled to the school maximum
 * (a month out of 20 with 15 counts as 75 of 100), then:
 * - each semester grade is the average of its monthly grades (however many were added),
 * - the annual effort (السعي السنوي) is the average of semester 1, the mid-year exam and semester 2,
 * - a student whose annual effort reaches the exemption mark is exempt from the final exam
 *   in that subject (not in ministerial grades), and the effort becomes the final grade,
 * - otherwise the final grade is the average of the annual effort and the final exam.
 * Fractions are rounded up in the student's favour.
 */
object Grades {

    fun roundUp(x: Double): Int = ceil(x - 1e-9).toInt()

    private fun avg(xs: List<Double>): Int? = if (xs.isEmpty()) null else roundUp(xs.sum() / xs.size)

    fun compute(columns: List<GradeColumn>, marks: Map<Long, Double>, maxMark: Int, exemptMark: Int, ministerial: Boolean): GradeResult {
        fun scaled(role: String) = columns.filter { it.role == role && it.maxMark > 0 }
            .mapNotNull { c -> marks[c.id]?.let { it / c.maxMark * maxMark } }

        val s1 = avg(scaled(GradeRole.S1))
        val mid = avg(scaled(GradeRole.MID))
        val s2 = avg(scaled(GradeRole.S2))
        val annual = if (s1 != null && mid != null && s2 != null) avg(listOf(s1, mid, s2).map { it.toDouble() }) else null
        val exempt = !ministerial && annual != null && annual >= exemptMark
        val exam = avg(scaled(GradeRole.FINAL))
        val final = when {
            ministerial -> null
            exempt -> annual
            annual != null && exam != null -> avg(listOf(annual.toDouble(), exam.toDouble()))
            else -> null
        }
        val pass = roundUp(maxMark / 2.0)
        val status = when {
            ministerial && annual != null -> "وزاري"
            exempt -> "معفى"
            final == null -> ""
            final >= pass -> "ناجح"
            else -> "مكمل"
        }
        return GradeResult(s1, mid, s2, annual, exam, final, exempt, status)
    }
}

/** Average of daily marks, each taken as a fraction of its test's maximum, scaled to [maxMark] and rounded up. */
fun dailyAverage(fractions: List<Double>, maxMark: Int): Int? =
    if (fractions.isEmpty()) null else Grades.roundUp(fractions.average() * maxMark)
