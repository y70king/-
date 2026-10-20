package com.hayalnaft.attendance.data

import kotlin.math.ceil

/** Grade columns a teacher fills in, in the order of the Iraqi school year. */
object GradeField {
    const val M1 = "m1"
    const val M2 = "m2"
    const val MID = "mid"
    const val M3 = "m3"
    const val M4 = "m4"
    const val FINAL = "final"

    val inputs = listOf(M1, M2, MID, M3, M4, FINAL)

    fun label(f: String) = when (f) {
        M1 -> "الشهر الأول"
        M2 -> "الشهر الثاني"
        MID -> "نصف السنة"
        M3 -> "الشهر الأول ف2"
        M4 -> "الشهر الثاني ف2"
        FINAL -> "الامتحان النهائي"
        else -> f
    }

    fun short(f: String) = when (f) {
        M1 -> "ش1"
        M2 -> "ش2"
        MID -> "نصف"
        M3 -> "ش3"
        M4 -> "ش4"
        FINAL -> "نهائي"
        else -> f
    }
}

data class GradeResult(
    val semester1: Int?,
    val semester2: Int?,
    /** السعي السنوي */
    val annual: Int?,
    val finalGrade: Int?,
    val exempt: Boolean,
    val status: String,
)

/**
 * Iraqi grading for intermediate and preparatory schools:
 * - each semester grade is the average of its two monthly grades,
 * - the annual effort (السعي السنوي) is the average of semester 1, the mid-year exam and semester 2,
 * - a student whose annual effort reaches the exemption mark is exempt from the final exam
 *   in that subject (not in ministerial grades), and the effort becomes the final grade,
 * - otherwise the final grade is the average of the annual effort and the final exam.
 * Fractions are rounded up in the student's favour.
 */
object Grades {

    fun roundUp(x: Double): Int = ceil(x - 1e-9).toInt()

    private fun avg(vararg v: Number?): Int? {
        val xs = v.filterNotNull().map { it.toDouble() }
        return if (xs.isEmpty()) null else roundUp(xs.sum() / xs.size)
    }

    fun compute(values: Map<String, Double>, maxMark: Int, exemptMark: Int, ministerial: Boolean): GradeResult {
        val s1 = avg(values[GradeField.M1], values[GradeField.M2])
        val s2 = avg(values[GradeField.M3], values[GradeField.M4])
        val mid = values[GradeField.MID]
        val annual = if (s1 != null && mid != null && s2 != null) avg(s1, mid, s2) else null
        val exempt = !ministerial && annual != null && annual >= exemptMark
        val exam = values[GradeField.FINAL]
        val final = when {
            ministerial -> null
            exempt -> annual
            annual != null && exam != null -> avg(annual, exam)
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
        return GradeResult(s1, s2, annual, final, exempt, status)
    }
}

/** Average of daily marks, each taken as a fraction of its test's maximum, scaled to [maxMark] and rounded up. */
fun dailyAverage(fractions: List<Double>, maxMark: Int): Int? =
    if (fractions.isEmpty()) null else Grades.roundUp(fractions.average() * maxMark)
