package com.hayalnaft.attendance

import com.hayalnaft.attendance.data.GradeField
import com.hayalnaft.attendance.data.Grades
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GradesTest {
    private fun g(vararg p: Pair<String, Double>) = mapOf(*p)

    @Test
    fun computesSemestersAnnualEffortAndFinalGrade() {
        val r = Grades.compute(
            g(GradeField.M1 to 70.0, GradeField.M2 to 75.0, GradeField.MID to 60.0, GradeField.M3 to 80.0,
                GradeField.M4 to 81.0, GradeField.FINAL to 65.0),
            maxMark = 100, exemptMark = 90, ministerial = false,
        )
        assertEquals(73, r.semester1) // 72.5 rounds up
        assertEquals(81, r.semester2) // 80.5 rounds up
        assertEquals(72, r.annual) // (73 + 60 + 81) / 3 = 71.33 rounds up
        assertEquals(69, r.finalGrade) // (72 + 65) / 2 = 68.5 rounds up
        assertFalse(r.exempt)
        assertEquals("ناجح", r.status)
    }

    @Test
    fun exemptsStudentsReachingTheExemptionMark() {
        val r = Grades.compute(
            g(GradeField.M1 to 92.0, GradeField.M2 to 88.0, GradeField.MID to 89.0, GradeField.M3 to 91.0, GradeField.M4 to 90.0),
            maxMark = 100, exemptMark = 90, ministerial = false,
        )
        assertEquals(90, r.annual)
        assertTrue(r.exempt)
        assertEquals(90, r.finalGrade)
        assertEquals("معفى", r.status)
    }

    @Test
    fun ministerialGradesAreNeverExempt() {
        val all95 = GradeField.inputs.dropLast(1).associateWith { 95.0 }
        val r = Grades.compute(all95, maxMark = 100, exemptMark = 90, ministerial = true)
        assertEquals(95, r.annual)
        assertFalse(r.exempt)
        assertNull(r.finalGrade)
        assertEquals("وزاري", r.status)
    }

    @Test
    fun failingFinalGradeNeedsSecondRound() {
        val r = Grades.compute(
            g(GradeField.M1 to 40.0, GradeField.M2 to 40.0, GradeField.MID to 40.0, GradeField.M3 to 40.0,
                GradeField.M4 to 40.0, GradeField.FINAL to 50.0),
            maxMark = 100, exemptMark = 90, ministerial = false,
        )
        assertEquals(45, r.finalGrade)
        assertEquals("مكمل", r.status)
    }

    @Test
    fun annualEffortWaitsForAllParts() {
        val r = Grades.compute(g(GradeField.M1 to 80.0), maxMark = 100, exemptMark = 90, ministerial = false)
        assertEquals(80, r.semester1)
        assertNull(r.annual)
        assertEquals("", r.status)
    }
}
