package com.hayalnaft.attendance.data

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.hayalnaft.attendance.util.ParsedStudent

object Status {
    const val NONE = 0
    const val PRESENT = 1
    const val ABSENT = 2
    const val LATE = 3
    const val EXCUSED = 4
}

data class School(val id: Long, val name: String, val studentCount: Int)
data class SchoolClass(val id: Long, val schoolId: Long, val name: String, val count: Int)
data class Student(
    val id: Long,
    val schoolId: Long,
    val classId: Long,
    val className: String,
    val name: String,
    val phone: String,
)
data class AttendanceRow(val student: Student, val status: Int, val notified: Boolean)
data class StudentStats(val student: Student, val present: Int, val absent: Int, val late: Int, val excused: Int)
data class MessageLog(val id: Long, val studentName: String?, val phone: String, val body: String, val ts: Long, val ok: Boolean, val kind: String)

const val DEFAULT_SCHOOL = "ثانوية حي النفط للبنين"

val DEFAULT_CLASSES = listOf(
    "الأول المتوسط",
    "الثاني المتوسط",
    "الثالث المتوسط",
    "الرابع العلمي",
    "الرابع الأدبي",
    "الخامس العلمي",
    "الخامس الأدبي",
    "السادس العلمي",
    "السادس الأدبي",
)

class Db(context: Context) : SQLiteOpenHelper(context, NAME, null, 1) {

    companion object {
        const val NAME = "attendance.db"
        private const val STUDENT_COLS = "st.id, st.school_id, st.class_id, c.name, st.name, st.phone"
    }

    override fun onConfigure(db: SQLiteDatabase) {
        db.setForeignKeyConstraintsEnabled(true)
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE schools(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, created INTEGER NOT NULL)")
        db.execSQL(
            "CREATE TABLE classes(id INTEGER PRIMARY KEY AUTOINCREMENT, " +
                "school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE, name TEXT NOT NULL)"
        )
        db.execSQL(
            "CREATE TABLE students(id INTEGER PRIMARY KEY AUTOINCREMENT, " +
                "school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE, " +
                "class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE, " +
                "name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '')"
        )
        db.execSQL(
            "CREATE TABLE attendance(student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE, " +
                "date TEXT NOT NULL, status INTEGER NOT NULL, notified INTEGER NOT NULL DEFAULT 0, " +
                "PRIMARY KEY(student_id, date))"
        )
        db.execSQL(
            "CREATE TABLE messages(id INTEGER PRIMARY KEY AUTOINCREMENT, " +
                "school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE, " +
                "student_name TEXT, phone TEXT NOT NULL, body TEXT NOT NULL, ts INTEGER NOT NULL, " +
                "ok INTEGER NOT NULL, kind TEXT NOT NULL)"
        )
        db.execSQL("CREATE INDEX idx_classes_school ON classes(school_id)")
        db.execSQL("CREATE INDEX idx_students_class ON students(class_id)")
        db.execSQL("CREATE INDEX idx_students_school ON students(school_id)")
        db.execSQL("CREATE INDEX idx_attendance_date ON attendance(date)")
        db.execSQL("CREATE INDEX idx_messages_school ON messages(school_id, ts)")
        insertSchool(db, DEFAULT_SCHOOL, withClasses = true)
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {}

    private val w: SQLiteDatabase get() = writableDatabase

    private inline fun <T> query(sql: String, vararg args: Any?, row: (Cursor) -> T): List<T> =
        w.rawQuery(sql, args.map { it?.toString() }.toTypedArray()).use { c ->
            val out = ArrayList<T>(c.count)
            while (c.moveToNext()) out.add(row(c))
            out
        }

    private fun studentOf(c: Cursor) = Student(
        id = c.getLong(0),
        schoolId = c.getLong(1),
        classId = c.getLong(2),
        className = c.getString(3),
        name = c.getString(4),
        phone = c.getString(5),
    )

    // ---------- Schools ----------

    private fun insertSchool(db: SQLiteDatabase, name: String, withClasses: Boolean): Long {
        val id = db.insertOrThrow("schools", null, ContentValues().apply {
            put("name", name)
            put("created", System.currentTimeMillis())
        })
        if (withClasses) DEFAULT_CLASSES.forEach { cls ->
            db.insertOrThrow("classes", null, ContentValues().apply {
                put("school_id", id)
                put("name", cls)
            })
        }
        return id
    }

    fun schools(): List<School> = query(
        "SELECT s.id, s.name, (SELECT COUNT(*) FROM students st WHERE st.school_id = s.id) FROM schools s ORDER BY s.id"
    ) { School(it.getLong(0), it.getString(1), it.getInt(2)) }

    fun school(id: Long): School? = schools().firstOrNull { it.id == id }

    fun addSchool(name: String, withClasses: Boolean): Long {
        val db = w
        db.beginTransaction()
        try {
            val id = insertSchool(db, name, withClasses)
            db.setTransactionSuccessful()
            return id
        } finally {
            db.endTransaction()
        }
    }

    fun renameSchool(id: Long, name: String) {
        w.update("schools", ContentValues().apply { put("name", name) }, "id = ?", arrayOf(id.toString()))
    }

    fun deleteSchool(id: Long) {
        w.delete("schools", "id = ?", arrayOf(id.toString()))
    }

    // ---------- Classes ----------

    fun classes(schoolId: Long): List<SchoolClass> = query(
        "SELECT c.id, c.school_id, c.name, (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id) " +
            "FROM classes c WHERE c.school_id = ? ORDER BY c.id",
        schoolId,
    ) { SchoolClass(it.getLong(0), it.getLong(1), it.getString(2), it.getInt(3)) }

    fun addClass(schoolId: Long, name: String): Long =
        w.insertOrThrow("classes", null, ContentValues().apply {
            put("school_id", schoolId)
            put("name", name)
        })

    fun renameClass(id: Long, name: String) {
        w.update("classes", ContentValues().apply { put("name", name) }, "id = ?", arrayOf(id.toString()))
    }

    fun deleteClass(id: Long) {
        w.delete("classes", "id = ?", arrayOf(id.toString()))
    }

    // ---------- Students ----------

    fun students(schoolId: Long, classId: Long?, search: String = ""): List<Student> {
        val sql = StringBuilder(
            "SELECT $STUDENT_COLS FROM students st JOIN classes c ON c.id = st.class_id WHERE st.school_id = ?"
        )
        val args = mutableListOf<Any?>(schoolId)
        if (classId != null) {
            sql.append(" AND st.class_id = ?")
            args.add(classId)
        }
        if (search.isNotBlank()) {
            sql.append(" AND (st.name LIKE ? OR st.phone LIKE ?)")
            args.add("%${search.trim()}%")
            args.add("%${search.trim()}%")
        }
        sql.append(" ORDER BY c.id, st.id")
        return query(sql.toString(), *args.toTypedArray()) { studentOf(it) }
    }

    fun student(id: Long?): Student? {
        if (id == null) return null
        return query(
            "SELECT $STUDENT_COLS FROM students st JOIN classes c ON c.id = st.class_id WHERE st.id = ?", id
        ) { studentOf(it) }.firstOrNull()
    }

    fun addStudent(schoolId: Long, classId: Long, name: String, phone: String): Long =
        w.insertOrThrow("students", null, ContentValues().apply {
            put("school_id", schoolId)
            put("class_id", classId)
            put("name", name)
            put("phone", phone)
        })

    fun updateStudent(id: Long, classId: Long, name: String, phone: String) {
        w.update("students", ContentValues().apply {
            put("class_id", classId)
            put("name", name)
            put("phone", phone)
        }, "id = ?", arrayOf(id.toString()))
    }

    fun deleteStudent(id: Long) {
        w.delete("students", "id = ?", arrayOf(id.toString()))
    }

    /** Adds the students to the class, skipping names already in it. Returns how many were added. */
    fun importStudents(schoolId: Long, classId: Long, list: List<ParsedStudent>): Int {
        val db = w
        val existing = query("SELECT name FROM students WHERE class_id = ?", classId) { it.getString(0) }
            .toMutableSet()
        var added = 0
        db.beginTransaction()
        try {
            for (p in list) {
                if (!existing.add(p.name)) continue
                addStudent(schoolId, classId, p.name, p.phone)
                added++
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
        return added
    }

    // ---------- Attendance ----------

    fun attendance(classId: Long, date: String): List<AttendanceRow> = query(
        "SELECT $STUDENT_COLS, IFNULL(a.status, 0), IFNULL(a.notified, 0) FROM students st " +
            "JOIN classes c ON c.id = st.class_id " +
            "LEFT JOIN attendance a ON a.student_id = st.id AND a.date = ? " +
            "WHERE st.class_id = ? ORDER BY st.id",
        date, classId,
    ) { AttendanceRow(studentOf(it), it.getInt(6), it.getInt(7) == 1) }

    fun setStatus(studentId: Long, date: String, status: Int) {
        val db = w
        if (status == Status.NONE) {
            db.delete("attendance", "student_id = ? AND date = ?", arrayOf(studentId.toString(), date))
            return
        }
        db.execSQL(
            "INSERT OR IGNORE INTO attendance(student_id, date, status, notified) VALUES(?, ?, ?, 0)",
            arrayOf<Any>(studentId, date, status),
        )
        db.execSQL(
            "UPDATE attendance SET status = ? WHERE student_id = ? AND date = ?",
            arrayOf<Any>(status, studentId, date),
        )
    }

    fun markNotified(studentId: Long, date: String) {
        w.execSQL(
            "UPDATE attendance SET notified = 1 WHERE student_id = ? AND date = ?",
            arrayOf<Any>(studentId, date),
        )
    }

    /** Marks every student of the class who has no record for the date as present. */
    fun markAllPresent(classId: Long, date: String) {
        w.execSQL(
            "INSERT OR IGNORE INTO attendance(student_id, date, status, notified) " +
                "SELECT id, ?, ${Status.PRESENT}, 0 FROM students WHERE class_id = ?",
            arrayOf<Any>(date, classId),
        )
    }

    /** Count of records per status for the school on the date, plus the total under [Status.NONE]. */
    fun daySummary(schoolId: Long, date: String): Map<Int, Int> {
        val out = mutableMapOf<Int, Int>()
        query(
            "SELECT a.status, COUNT(*) FROM attendance a JOIN students st ON st.id = a.student_id " +
                "WHERE st.school_id = ? AND a.date = ? GROUP BY a.status",
            schoolId, date,
        ) { out[it.getInt(0)] = it.getInt(1) }
        out[Status.NONE] = query("SELECT COUNT(*) FROM students WHERE school_id = ?", schoolId) { it.getInt(0) }
            .first()
        return out
    }

    /** Students of the school who were not present on the date. */
    fun dayList(schoolId: Long, date: String): List<AttendanceRow> = query(
        "SELECT $STUDENT_COLS, a.status, a.notified FROM attendance a " +
            "JOIN students st ON st.id = a.student_id JOIN classes c ON c.id = st.class_id " +
            "WHERE st.school_id = ? AND a.date = ? AND a.status <> ${Status.PRESENT} ORDER BY c.id, st.id",
        schoolId, date,
    ) { AttendanceRow(studentOf(it), it.getInt(6), it.getInt(7) == 1) }

    fun stats(schoolId: Long, classId: Long?, fromDate: String?): List<StudentStats> {
        val sql = StringBuilder(
            "SELECT $STUDENT_COLS, " +
                "SUM(CASE WHEN a.status = ${Status.PRESENT} THEN 1 ELSE 0 END), " +
                "SUM(CASE WHEN a.status = ${Status.ABSENT} THEN 1 ELSE 0 END), " +
                "SUM(CASE WHEN a.status = ${Status.LATE} THEN 1 ELSE 0 END), " +
                "SUM(CASE WHEN a.status = ${Status.EXCUSED} THEN 1 ELSE 0 END) " +
                "FROM students st JOIN classes c ON c.id = st.class_id " +
                "LEFT JOIN attendance a ON a.student_id = st.id AND a.date >= ? " +
                "WHERE st.school_id = ?"
        )
        val args = mutableListOf<Any?>(fromDate ?: "0000-00-00", schoolId)
        if (classId != null) {
            sql.append(" AND st.class_id = ?")
            args.add(classId)
        }
        sql.append(" GROUP BY st.id ORDER BY 8 DESC, 9 DESC, c.id, st.id")
        return query(sql.toString(), *args.toTypedArray()) {
            StudentStats(studentOf(it), it.getInt(6), it.getInt(7), it.getInt(8), it.getInt(9))
        }
    }

    /** Every non-present day of the student, newest first. */
    fun history(studentId: Long): List<Pair<String, Int>> = query(
        "SELECT date, status FROM attendance WHERE student_id = ? AND status <> ${Status.PRESENT} ORDER BY date DESC",
        studentId,
    ) { it.getString(0) to it.getInt(1) }

    // ---------- Messages ----------

    fun logMessage(schoolId: Long, studentName: String?, phone: String, body: String, ok: Boolean, kind: String) {
        if (school(schoolId) == null) return
        w.insert("messages", null, ContentValues().apply {
            put("school_id", schoolId)
            put("student_name", studentName)
            put("phone", phone)
            put("body", body)
            put("ts", System.currentTimeMillis())
            put("ok", if (ok) 1 else 0)
            put("kind", kind)
        })
    }

    fun messages(schoolId: Long, limit: Int = 100): List<MessageLog> = query(
        "SELECT id, student_name, phone, body, ts, ok, kind FROM messages WHERE school_id = ? ORDER BY ts DESC LIMIT ?",
        schoolId, limit,
    ) { MessageLog(it.getLong(0), it.getString(1), it.getString(2), it.getString(3), it.getLong(4), it.getInt(5) == 1, it.getString(6)) }
}
