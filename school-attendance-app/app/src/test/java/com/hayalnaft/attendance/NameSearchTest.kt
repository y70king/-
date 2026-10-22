package com.hayalnaft.attendance

import com.hayalnaft.attendance.util.NameSearch
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NameSearchTest {
    @Test
    fun ignoresCommonArabicSpellingDifferences() {
        assertTrue(NameSearch.matches("أحمد محمد علي", "احمد"))
        assertTrue(NameSearch.matches("إسماعيل جاسم", "اسماعيل"))
        assertTrue(NameSearch.matches("حمزة عبد الله", "حمزه"))
        assertTrue(NameSearch.matches("مصطفى كريم", "مصطفي"))
        assertTrue(NameSearch.matches("مُحَمَّد جواد", "محمد"))
    }

    @Test
    fun matchesAllWordsInAnyOrder() {
        assertTrue(NameSearch.matches("علي حسين كاظم", "كاظم علي"))
        assertFalse(NameSearch.matches("علي حسين كاظم", "علي جاسم"))
    }

    @Test
    fun matchesParentPhoneDigits() {
        assertTrue(NameSearch.matches("علي حسين", "0780", "07801234567"))
        assertFalse(NameSearch.matches("علي حسين", "12", "07801234567")) // too short to be a phone search
    }
}
