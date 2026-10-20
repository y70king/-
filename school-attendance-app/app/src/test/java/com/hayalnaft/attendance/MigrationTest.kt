package com.hayalnaft.attendance

import android.database.sqlite.SQLiteDatabase
import androidx.test.core.app.ApplicationProvider
import com.hayalnaft.attendance.data.Db
import com.hayalnaft.attendance.data.Status
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** A phone with version 1 of the app keeps its students and attendance after updating. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MigrationTest {
    @Test
    fun upgradesVersionOneDatabase() {
        val ctx = ApplicationProvider.getApplicationContext<android.content.Context>()
        val file = ctx.getDatabasePath("v1-test.db").apply { parentFile!!.mkdirs(); delete() }
        SQLiteDatabase.openOrCreateDatabase(file, null).use { d ->
            d.execSQL("CREATE TABLE schools(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, created INTEGER NOT NULL)")
            d.execSQL("CREATE TABLE classes(id INTEGER PRIMARY KEY AUTOINCREMENT, school_id INTEGER NOT NULL, name TEXT NOT NULL)")
            d.execSQL("CREATE TABLE students(id INTEGER PRIMARY KEY AUTOINCREMENT, school_id INTEGER NOT NULL, class_id INTEGER NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '')")
            d.execSQL("CREATE TABLE attendance(student_id INTEGER NOT NULL, date TEXT NOT NULL, status INTEGER NOT NULL, notified INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(student_id, date))")
            d.execSQL("CREATE INDEX idx_attendance_date ON attendance(date)")
            d.execSQL("CREATE TABLE messages(id INTEGER PRIMARY KEY AUTOINCREMENT, school_id INTEGER NOT NULL, student_name TEXT, phone TEXT NOT NULL, body TEXT NOT NULL, ts INTEGER NOT NULL, ok INTEGER NOT NULL, kind TEXT NOT NULL)")
            d.execSQL("INSERT INTO schools VALUES(1, 'ثانوية حي النفط للبنين', 0)")
            d.execSQL("INSERT INTO classes VALUES(1, 1, 'السادس العلمي'), (2, 1, 'الرابع العلمي')")
            d.execSQL("INSERT INTO students VALUES(1, 1, 1, 'أحمد', '0770'), (2, 1, 2, 'علي', '')")
            d.execSQL("INSERT INTO attendance VALUES(1, '2026-10-01', ${Status.ABSENT}, 1), (2, '2026-10-01', ${Status.PRESENT}, 0)")
            d.version = 1
        }
        // Put the old file where the app keeps its database, then open it with the current helper.
        val target = ctx.getDatabasePath(Db.NAME)
        file.copyTo(target, overwrite = true)
        val helper = Db(ctx)
        val classes = helper.classes(1)
        assertTrue(classes.first { it.name == "السادس العلمي" }.ministerial)
        assertEquals(false, classes.first { it.name == "الرابع العلمي" }.ministerial)
        val rows = helper.attendance(1, "2026-10-01", 0)
        assertEquals(Status.ABSENT, rows.single().status)
        assertTrue(rows.single().notified)
        assertEquals(2, helper.daySummary(1, "2026-10-01")[Status.NONE])
        assertEquals(1, helper.history(1).size)
        val math = helper.addSubject(1, "الرياضيات")
        assertEquals(1, helper.subjects(1).size)
        // Version 3 adds daily grades.
        val test = helper.saveDailyTest(com.hayalnaft.attendance.data.DailyTest(0, 1, math, "2026-10-02", "اختبار قصير", 10.0))
        helper.setDailyMark(test, 1, 8.0)
        assertEquals(mapOf(test to mapOf(1L to 8.0)), helper.dailyMarks(1, math))
        helper.close()
    }
}
