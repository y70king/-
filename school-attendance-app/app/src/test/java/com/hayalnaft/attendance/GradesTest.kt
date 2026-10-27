package com.hayalnaft.attendance

import com.hayalnaft.attendance.data.GradeColumn
import com.hayalnaft.attendance.data.GradeRole
import com.hayalnaft.attendance.data.Grades
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GradesTest {
    private var nextId = 1L
    private fun col(role: String, max: Double = 100.0) = GradeColumn(nextId++, 1, 1, "c$nextId", role, max, 0)

    private val m1 = col(GradeRole.S1)
    private val m2 = col(GradeRole.S1)
    private val mid = col(GradeRole.MID)
    private val m3 = col(GradeRole.S2)
    private val m4 = col(GradeRole.S2)
    private val fin = col(GradeRole.FINAL)
    private val standard = listOf(m1, m2, mid, m3, m4, fin)

    private fun marks(vararg v: Double?) = standard.zip(v.toList()).mapNotNull { (c, m) -> m?.let { c.id to it } }.toMap()

    @Test
    fun computesSemestersAnnualEffortAndFinalGrade() {
        val r = Grades.compute(standard, marks(70.0, 75.0, 60.0, 80.0, 81.0, 65.0), maxMark = 100, exemptMark = 90, ministerial = false)
        assertEquals(73, r.semester1) // 72.5 rounds up
        assertEquals(60, r.mid)
        assertEquals(81, r.semester2) // 80.5 rounds up
        assertEquals(72, r.annual) // (73 + 60 + 81) / 3 = 71.33 rounds up
        assertEquals(69, r.finalGrade) // (72 + 65) / 2 = 68.5 rounds up
        assertFalse(r.exempt)
        assertEquals("ناجح", r.status)
    }

    @Test
    fun scalesEachColumnByItsOwnMaximum() {
        // First month out of 20, second out of 50, mid-year out of 100.
        val a = col(GradeRole.S1, 20.0)
        val b = col(GradeRole.S1, 50.0)
        val m = col(GradeRole.MID, 100.0)
        val c = col(GradeRole.S2, 25.0)
        val r = Grades.compute(listOf(a, b, m, c), mapOf(a.id to 15.0, b.id to 40.0, m.id to 70.0, c.id to 20.0), 100, 90, false)
        assertEquals(78, r.semester1) // 75 and 80 → 77.5 rounds up
        assertEquals(80, r.semester2) // 20 / 25 = 80
        assertEquals(76, r.annual) // (78 + 70 + 80) / 3 = 76
    }

    @Test
    fun allowsAnyNumberOfMonthsPerSemester() {
        val a = col(GradeRole.S1)
        val b = col(GradeRole.S1)
        val c = col(GradeRole.S1)
        val r = Grades.compute(listOf(a, b, c), mapOf(a.id to 60.0, b.id to 70.0, c.id to 90.0), 100, 90, false)
        assertEquals(74, r.semester1) // 73.33 rounds up
    }

    @Test
    fun exemptsStudentsReachingTheExemptionMark() {
        val r = Grades.compute(standard, marks(92.0, 88.0, 89.0, 91.0, 90.0, null), maxMark = 100, exemptMark = 90, ministerial = false)
        assertEquals(90, r.annual)
        assertTrue(r.exempt)
        assertEquals(90, r.finalGrade)
        assertEquals("معفى", r.status)
    }

    @Test
    fun ministerialGradesAreNeverExempt() {
        val r = Grades.compute(standard, marks(95.0, 95.0, 95.0, 95.0, 95.0, null), maxMark = 100, exemptMark = 90, ministerial = true)
        assertEquals(95, r.annual)
        assertFalse(r.exempt)
        assertNull(r.finalGrade)
        assertEquals("وزاري", r.status)
    }

    @Test
    fun failingFinalGradeNeedsSecondRound() {
        val r = Grades.compute(standard, marks(40.0, 40.0, 40.0, 40.0, 40.0, 50.0), maxMark = 100, exemptMark = 90, ministerial = false)
        assertEquals(45, r.finalGrade)
        assertEquals("مكمل", r.status)
    }

    @Test
    fun annualEffortWaitsForAllParts() {
        val r = Grades.compute(standard, marks(80.0), maxMark = 100, exemptMark = 90, ministerial = false)
        assertEquals(80, r.semester1)
        assertNull(r.annual)
        assertEquals("", r.status)
    }

    @Test
    fun dailyAverageScalesEachTestToTheSchoolMaximum() {
        // 8/10, 15/20 and 4/5 → 80%, 75%, 80% → 78.33 of 100, rounded up.
        assertEquals(79, com.hayalnaft.attendance.data.dailyAverage(listOf(0.8, 0.75, 0.8), 100))
        assertNull(com.hayalnaft.attendance.data.dailyAverage(emptyList(), 100))
    }
}
