package com.hayalnaft.attendance.data

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.hayalnaft.attendance.util.ParsedStudent

class Db(context: Context) : SQLiteOpenHelper(context, NAME, null, VERSION) {

    companion object {
        const val NAME = "attendance.db"
        const val VERSION = 2
        private const val CLASS_TITLE = "(c.name || CASE WHEN c.section <> '' THEN ' - ' || c.section ELSE '' END)"
        private const val STUDENT_COLS = "st.id, st.school_id, st.class_id, $CLASS_TITLE, st.name, st.phone"
        private const val SCHOOL_COLS =
            "s.id, s.name, (SELECT COUNT(*) FROM students st WHERE st.school_id = s.id), " +
                "s.stage, s.shift, s.year, s.directorate, s.principal, s.teacher, s.max_mark, s.exempt_mark"
    }

    override fun onConfigure(db: SQLiteDatabase) {
        db.setForeignKeyConstraintsEnabled(true)
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            "CREATE TABLE schools(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, created INTEGER NOT NULL, " +
                "stage TEXT NOT NULL DEFAULT '${Stages.SECONDARY}', shift TEXT NOT NULL DEFAULT '${Shifts.MORNING}', " +
                "year TEXT NOT NULL DEFAULT '', directorate TEXT NOT NULL DEFAULT '', principal TEXT NOT NULL DEFAULT '', " +
                "teacher TEXT NOT NULL DEFAULT '', max_mark INTEGER NOT NULL DEFAULT 100, exempt_mark INTEGER NOT NULL DEFAULT 90)"
        )
        db.execSQL(
            "CREATE TABLE classes(id INTEGER PRIMARY KEY AUTOINCREMENT, " +
                "school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE, name TEXT NOT NULL, " +
                "section TEXT NOT NULL DEFAULT '', room TEXT NOT NULL DEFAULT '', ministerial INTEGER NOT NULL DEFAULT 0)"
        )
        db.execSQL(
            "CREATE TABLE students(id INTEGER PRIMARY KEY AUTOINCREMENT, " +
                "school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE, " +
                "class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE, " +
                "name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '')"
        )
        createAttendance(db)
        db.execSQL(
            "CREATE TABLE messages(id INTEGER PRIMARY KEY AUTOINCREMENT, " +
                "school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE, " +
                "student_name TEXT, phone TEXT NOT NULL, body TEXT NOT NULL, ts INTEGER NOT NULL, " +
                "ok INTEGER NOT NULL, kind TEXT NOT NULL)"
        )
        db.execSQL("CREATE INDEX idx_classes_school ON classes(school_id)")
        db.execSQL("CREATE INDEX idx_students_class ON students(class_id)")
        db.execSQL("CREATE INDEX idx_students_school ON students(school_id)")
        db.execSQL("CREATE INDEX idx_messages_school ON messages(school_id, ts)")
        createV2Tables(db)
        insertSchool(db, School(0, DEFAULT_SCHOOL), withClasses = true)
    }

    private fun createAttendance(db: SQLiteDatabase) {
        // subject_id 0 is the general daily roll call; other values are per-lesson roll calls.
        db.execSQL(
            "CREATE TABLE attendance(student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE, " +
                "date TEXT NOT NULL, subject_id INTEGER NOT NULL DEFAULT 0, status INTEGER NOT NULL, " +
                "notified INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(student_id, date, subject_id))"
        )
        db.execSQL("CREATE INDEX idx_attendance_date ON attendance(date)")
    }

    private fun createV2Tables(db: SQLiteDatabase) {
        db.execSQL(
            "CREATE TABLE subjects(id INTEGER PRIMARY KEY AUTOINCREMENT, " +
                "school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE, name TEXT NOT NULL)"
        )
        db.execSQL(
            "CREATE TABLE events(id INTEGER PRIMARY KEY AUTOINCREMENT, " +
                "student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE, date TEXT NOT NULL, " +
                "ts INTEGER NOT NULL, type INTEGER NOT NULL, points INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '')"
        )
        db.execSQL("CREATE INDEX idx_events_student ON events(student_id, date)")
        db.execSQL(
            "CREATE TABLE grades(student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE, " +
                "subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE, field TEXT NOT NULL, " +
                "value REAL NOT NULL, PRIMARY KEY(student_id, subject_id, field))"
        )
        db.execSQL(
            "CREATE TABLE periods(id INTEGER PRIMARY KEY AUTOINCREMENT, " +
                "school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE, day INTEGER NOT NULL, " +
                "start_min INTEGER NOT NULL, duration INTEGER NOT NULL, " +
                "class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE, " +
                "subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE)"
        )
        db.execSQL(
            "CREATE TABLE plans(id INTEGER PRIMARY KEY AUTOINCREMENT, " +
                "school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE, date TEXT NOT NULL, " +
                "class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL, " +
                "subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL, title TEXT NOT NULL, " +
                "cognitive TEXT NOT NULL, affective TEXT NOT NULL, psychomotor TEXT NOT NULL, aids TEXT NOT NULL, " +
                "steps TEXT NOT NULL, homework TEXT NOT NULL, notes TEXT NOT NULL)"
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 2) {
            db.execSQL("ALTER TABLE schools ADD COLUMN stage TEXT NOT NULL DEFAULT '${Stages.SECONDARY}'")
            db.execSQL("ALTER TABLE schools ADD COLUMN shift TEXT NOT NULL DEFAULT '${Shifts.MORNING}'")
            db.execSQL("ALTER TABLE schools ADD COLUMN year TEXT NOT NULL DEFAULT '${defaultYear()}'")
            db.execSQL("ALTER TABLE schools ADD COLUMN directorate TEXT NOT NULL DEFAULT ''")
            db.execSQL("ALTER TABLE schools ADD COLUMN principal TEXT NOT NULL DEFAULT ''")
            db.execSQL("ALTER TABLE schools ADD COLUMN teacher TEXT NOT NULL DEFAULT ''")
            db.execSQL("ALTER TABLE schools ADD COLUMN max_mark INTEGER NOT NULL DEFAULT 100")
            db.execSQL("ALTER TABLE schools ADD COLUMN exempt_mark INTEGER NOT NULL DEFAULT 90")
            db.execSQL("ALTER TABLE classes ADD COLUMN section TEXT NOT NULL DEFAULT ''")
            db.execSQL("ALTER TABLE classes ADD COLUMN room TEXT NOT NULL DEFAULT ''")
            db.execSQL("ALTER TABLE classes ADD COLUMN ministerial INTEGER NOT NULL DEFAULT 0")
            db.execSQL("UPDATE classes SET ministerial = 1 WHERE name LIKE 'السادس%' OR name = 'الثالث المتوسط'")
            db.execSQL("ALTER TABLE attendance RENAME TO attendance_v1")
            db.execSQL("DROP INDEX IF EXISTS idx_attendance_date")
            createAttendance(db)
            db.execSQL(
                "INSERT INTO attendance(student_id, date, subject_id, status, notified) " +
                    "SELECT student_id, date, 0, status, notified FROM attendance_v1"
            )
            db.execSQL("DROP TABLE attendance_v1")
            createV2Tables(db)
        }
    }

    private val w: SQLiteDatabase get() = writableDatabase

    private inline fun <T> query(sql: String, vararg args: Any?, row: (Cursor) -> T): List<T> =
        w.rawQuery(sql, args.map { it?.toString() }.toTypedArray()).use { c ->
            val out = ArrayList<T>(c.count)
            while (c.moveToNext()) out.add(row(c))
            out
        }

    private inline fun <T> tx(block: (SQLiteDatabase) -> T): T {
        val db = w
        db.beginTransaction()
        try {
            val r = block(db)
            db.setTransactionSuccessful()
            return r
        } finally {
            db.endTransaction()
        }
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

    private fun schoolValues(s: School) = ContentValues().apply {
        put("name", s.name)
        put("stage", s.stage)
        put("shift", s.shift)
        put("year", s.year)
        put("directorate", s.directorate)
        put("principal", s.principal)
        put("teacher", s.teacher)
        put("max_mark", s.maxMark)
        put("exempt_mark", s.exemptMark)
    }

    private fun insertSchool(db: SQLiteDatabase, s: School, withClasses: Boolean): Long {
        val id = db.insertOrThrow("schools", null, schoolValues(s).apply { put("created", System.currentTimeMillis()) })
        if (withClasses) Stages.grades(s.stage).forEach { grade ->
            db.insertOrThrow("classes", null, classValues(id, grade, "أ", "", Stages.isMinisterial(grade)))
        }
        return id
    }

    fun schools(): List<School> = query("SELECT $SCHOOL_COLS FROM schools s ORDER BY s.id") {
        School(
            it.getLong(0), it.getString(1), it.getInt(2), it.getString(3), it.getString(4), it.getString(5),
            it.getString(6), it.getString(7), it.getString(8), it.getInt(9), it.getInt(10),
        )
    }

    fun school(id: Long): School? = schools().firstOrNull { it.id == id }

    fun addSchool(s: School, withClasses: Boolean): Long = tx { insertSchool(it, s, withClasses) }

    fun updateSchool(s: School) {
        w.update("schools", schoolValues(s), "id = ?", arrayOf(s.id.toString()))
    }

    fun deleteSchool(id: Long) {
        w.delete("schools", "id = ?", arrayOf(id.toString()))
    }

    // ---------- Classes ----------

    private fun classValues(schoolId: Long, name: String, section: String, room: String, ministerial: Boolean) =
        ContentValues().apply {
            put("school_id", schoolId)
            put("name", name)
            put("section", section)
            put("room", room)
            put("ministerial", if (ministerial) 1 else 0)
        }

    fun classes(schoolId: Long): List<SchoolClass> = query(
        "SELECT c.id, c.school_id, c.name, c.section, c.room, c.ministerial, " +
            "(SELECT COUNT(*) FROM students s WHERE s.class_id = c.id) " +
            "FROM classes c WHERE c.school_id = ? ORDER BY c.id",
        schoolId,
    ) { SchoolClass(it.getLong(0), it.getLong(1), it.getString(2), it.getString(3), it.getString(4), it.getInt(5) == 1, it.getInt(6)) }

    fun addClass(schoolId: Long, name: String, section: String = "", room: String = "", ministerial: Boolean = Stages.isMinisterial(name)): Long =
        w.insertOrThrow("classes", null, classValues(schoolId, name, section, room, ministerial))

    fun updateClass(c: SchoolClass) {
        w.update("classes", classValues(c.schoolId, c.name, c.section, c.room, c.ministerial), "id = ?", arrayOf(c.id.toString()))
    }

    fun deleteClass(id: Long) {
        w.delete("classes", "id = ?", arrayOf(id.toString()))
    }

    /** Copies the names and phone numbers of every student of one class into another. Returns how many were added. */
    fun copyStudents(fromClassId: Long, toClassId: Long): Int {
        val target = query("SELECT school_id FROM classes WHERE id = ?", toClassId) { it.getLong(0) }.firstOrNull() ?: return 0
        val list = query("SELECT name, phone FROM students WHERE class_id = ? ORDER BY id", fromClassId) {
            ParsedStudent(it.getString(0), it.getString(1))
        }
        return importStudents(target, toClassId, list)
    }

    // ---------- Subjects ----------

    fun subjects(schoolId: Long): List<Subject> =
        query("SELECT id, school_id, name FROM subjects WHERE school_id = ? ORDER BY id", schoolId) {
            Subject(it.getLong(0), it.getLong(1), it.getString(2))
        }

    fun addSubject(schoolId: Long, name: String): Long =
        w.insertOrThrow("subjects", null, ContentValues().apply {
            put("school_id", schoolId)
            put("name", name)
        })

    fun renameSubject(id: Long, name: String) {
        w.update("subjects", ContentValues().apply { put("name", name) }, "id = ?", arrayOf(id.toString()))
    }

    fun deleteSubject(id: Long) {
        tx {
            it.delete("attendance", "subject_id = ?", arrayOf(id.toString()))
            it.delete("subjects", "id = ?", arrayOf(id.toString()))
        }
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
        val existing = query("SELECT name FROM students WHERE class_id = ?", classId) { it.getString(0) }.toMutableSet()
        return tx {
            var added = 0
            for (p in list) {
                if (!existing.add(p.name)) continue
                addStudent(schoolId, classId, p.name, p.phone)
                added++
            }
            added
        }
    }

    // ---------- Attendance ----------

    fun attendance(classId: Long, date: String, subjectId: Long): List<AttendanceRow> = query(
        "SELECT $STUDENT_COLS, IFNULL(a.status, 0), IFNULL(a.notified, 0) FROM students st " +
            "JOIN classes c ON c.id = st.class_id " +
            "LEFT JOIN attendance a ON a.student_id = st.id AND a.date = ? AND a.subject_id = ? " +
            "WHERE st.class_id = ? ORDER BY st.id",
        date, subjectId, classId,
    ) { AttendanceRow(studentOf(it), it.getInt(6), it.getInt(7) == 1) }

    fun setStatus(studentId: Long, date: String, subjectId: Long, status: Int) {
        val db = w
        if (status == Status.NONE) {
            db.delete(
                "attendance", "student_id = ? AND date = ? AND subject_id = ?",
                arrayOf(studentId.toString(), date, subjectId.toString()),
            )
            return
        }
        db.execSQL(
            "INSERT OR IGNORE INTO attendance(student_id, date, subject_id, status, notified) VALUES(?, ?, ?, ?, 0)",
            arrayOf<Any>(studentId, date, subjectId, status),
        )
        db.execSQL(
            "UPDATE attendance SET status = ? WHERE student_id = ? AND date = ? AND subject_id = ?",
            arrayOf<Any>(status, studentId, date, subjectId),
        )
    }

    fun markNotified(studentId: Long, date: String, subjectId: Long) {
        w.execSQL(
            "UPDATE attendance SET notified = 1 WHERE student_id = ? AND date = ? AND subject_id = ?",
            arrayOf<Any>(studentId, date, subjectId),
        )
    }

    /** Marks every student of the class who has no record for the session as present. */
    fun markAllPresent(classId: Long, date: String, subjectId: Long) {
        w.execSQL(
            "INSERT OR IGNORE INTO attendance(student_id, date, subject_id, status, notified) " +
                "SELECT id, ?, ?, ${Status.PRESENT}, 0 FROM students WHERE class_id = ?",
            arrayOf<Any>(date, subjectId, classId),
        )
    }

    /**
     * Students per status for the school on the date; a student recorded in several lessons counts once,
     * under the most serious status. The total number of students is under [Status.NONE].
     */
    fun daySummary(schoolId: Long, date: String): Map<Int, Int> {
        val out = mutableMapOf<Int, Int>()
        query(
            "SELECT MAX(CASE a.status WHEN ${Status.ABSENT} THEN 4 WHEN ${Status.LATE} THEN 3 " +
                "WHEN ${Status.EXCUSED} THEN 2 ELSE 1 END) FROM attendance a " +
                "JOIN students st ON st.id = a.student_id WHERE st.school_id = ? AND a.date = ? GROUP BY a.student_id",
            schoolId, date,
        ) { it.getInt(0) }.forEach { sev ->
            val s = when (sev) {
                4 -> Status.ABSENT
                3 -> Status.LATE
                2 -> Status.EXCUSED
                else -> Status.PRESENT
            }
            out[s] = (out[s] ?: 0) + 1
        }
        out[Status.NONE] = query("SELECT COUNT(*) FROM students WHERE school_id = ?", schoolId) { it.getInt(0) }.first()
        return out
    }

    /** Every non-present record of the school on the date. */
    fun dayList(schoolId: Long, date: String): List<DayAbsence> = query(
        "SELECT $STUDENT_COLS, sub.name, a.status, a.notified FROM attendance a " +
            "JOIN students st ON st.id = a.student_id JOIN classes c ON c.id = st.class_id " +
            "LEFT JOIN subjects sub ON sub.id = a.subject_id " +
            "WHERE st.school_id = ? AND a.date = ? AND a.status <> ${Status.PRESENT} ORDER BY c.id, st.id, a.subject_id",
        schoolId, date,
    ) { DayAbsence(studentOf(it), it.getString(6), it.getInt(7), it.getInt(8) == 1) }

    fun stats(schoolId: Long, classId: Long?, range: DateRange = DateRange.ALL): List<StudentStats> {
        val sql = StringBuilder(
            "SELECT $STUDENT_COLS, " +
                "SUM(CASE WHEN a.status = ${Status.PRESENT} THEN 1 ELSE 0 END), " +
                "SUM(CASE WHEN a.status = ${Status.ABSENT} THEN 1 ELSE 0 END), " +
                "SUM(CASE WHEN a.status = ${Status.LATE} THEN 1 ELSE 0 END), " +
                "SUM(CASE WHEN a.status = ${Status.EXCUSED} THEN 1 ELSE 0 END) " +
                "FROM students st JOIN classes c ON c.id = st.class_id " +
                "LEFT JOIN attendance a ON a.student_id = st.id AND a.date BETWEEN ? AND ? " +
                "WHERE st.school_id = ?"
        )
        val args = mutableListOf<Any?>(range.from, range.to, schoolId)
        if (classId != null) {
            sql.append(" AND st.class_id = ?")
            args.add(classId)
        }
        sql.append(" GROUP BY st.id ORDER BY 8 DESC, 9 DESC, c.id, st.id")
        return query(sql.toString(), *args.toTypedArray()) {
            StudentStats(studentOf(it), it.getInt(6), it.getInt(7), it.getInt(8), it.getInt(9))
        }
    }

    fun studentStats(studentId: Long, range: DateRange = DateRange.ALL): StudentStats? {
        val s = student(studentId) ?: return null
        return stats(s.schoolId, s.classId, range).firstOrNull { it.student.id == studentId }
    }

    /** Number of different days on which the student was recorded absent. */
    fun absentDays(studentId: Long): Int = query(
        "SELECT COUNT(DISTINCT date) FROM attendance WHERE student_id = ? AND status = ${Status.ABSENT}", studentId,
    ) { it.getInt(0) }.first()

    /** Every recorded session of the student, newest first. */
    fun history(studentId: Long, range: DateRange = DateRange.ALL): List<HistoryRow> = query(
        "SELECT a.date, sub.name, a.status FROM attendance a LEFT JOIN subjects sub ON sub.id = a.subject_id " +
            "WHERE a.student_id = ? AND a.date BETWEEN ? AND ? ORDER BY a.date DESC, a.subject_id",
        studentId, range.from, range.to,
    ) { HistoryRow(it.getString(0), it.getString(1), it.getInt(2)) }

    // ---------- Points, behaviour and notes ----------

    fun addEvent(studentId: Long, date: String, type: Int, points: Int = 0, note: String = ""): Long =
        w.insertOrThrow("events", null, ContentValues().apply {
            put("student_id", studentId)
            put("date", date)
            put("ts", System.currentTimeMillis())
            put("type", type)
            put("points", points)
            put("note", note)
        })

    fun deleteEvent(id: Long) {
        w.delete("events", "id = ?", arrayOf(id.toString()))
    }

    fun events(studentId: Long, range: DateRange = DateRange.ALL): List<StudentEvent> = query(
        "SELECT id, student_id, date, ts, type, points, note FROM events " +
            "WHERE student_id = ? AND date BETWEEN ? AND ? ORDER BY date DESC, ts DESC",
        studentId, range.from, range.to,
    ) { StudentEvent(it.getLong(0), it.getLong(1), it.getString(2), it.getLong(3), it.getInt(4), it.getInt(5), it.getString(6)) }

    fun dayActivity(classId: Long, date: String): Map<Long, DayActivity> = query(
        "SELECT e.student_id, SUM(e.points), SUM(e.type = ${EventType.GOOD}), SUM(e.type = ${EventType.BAD}) " +
            "FROM events e JOIN students st ON st.id = e.student_id WHERE st.class_id = ? AND e.date = ? GROUP BY e.student_id",
        classId, date,
    ) { it.getLong(0) to DayActivity(it.getInt(1), it.getInt(2), it.getInt(3)) }.toMap()

    private val totalsCols =
        "IFNULL(SUM(points), 0), IFNULL(SUM(type = ${EventType.GOOD}), 0), IFNULL(SUM(type = ${EventType.BAD}), 0), " +
            "IFNULL(SUM(type = ${EventType.NOTE}), 0)"

    fun eventTotals(studentId: Long, range: DateRange = DateRange.ALL): EventTotals = query(
        "SELECT $totalsCols FROM events WHERE student_id = ? AND date BETWEEN ? AND ?",
        studentId, range.from, range.to,
    ) { EventTotals(it.getInt(0), it.getInt(1), it.getInt(2), it.getInt(3)) }.first()

    /** Points and behaviour totals of every student of a class over a period. */
    fun classEventTotals(classId: Long, range: DateRange = DateRange.ALL): Map<Long, EventTotals> = query(
        "SELECT student_id, $totalsCols FROM events WHERE date BETWEEN ? AND ? " +
            "AND student_id IN (SELECT id FROM students WHERE class_id = ?) GROUP BY student_id",
        range.from, range.to, classId,
    ) { it.getLong(0) to EventTotals(it.getInt(1), it.getInt(2), it.getInt(3), it.getInt(4)) }.toMap()

    // ---------- Grades ----------

    fun setGrade(studentId: Long, subjectId: Long, field: String, value: Double?) {
        if (value == null) {
            w.delete(
                "grades", "student_id = ? AND subject_id = ? AND field = ?",
                arrayOf(studentId.toString(), subjectId.toString(), field),
            )
        } else {
            w.execSQL(
                "INSERT OR REPLACE INTO grades(student_id, subject_id, field, value) VALUES(?, ?, ?, ?)",
                arrayOf<Any>(studentId, subjectId, field, value),
            )
        }
    }

    /** Grades of the class: student id → subject id → field → value. */
    fun classGrades(classId: Long): Map<Long, Map<Long, Map<String, Double>>> {
        val out = mutableMapOf<Long, MutableMap<Long, MutableMap<String, Double>>>()
        query(
            "SELECT g.student_id, g.subject_id, g.field, g.value FROM grades g " +
                "JOIN students st ON st.id = g.student_id WHERE st.class_id = ?",
            classId,
        ) {
            out.getOrPut(it.getLong(0)) { mutableMapOf() }.getOrPut(it.getLong(1)) { mutableMapOf() }[it.getString(2)] = it.getDouble(3)
        }
        return out
    }

    fun studentGrades(studentId: Long): Map<Long, Map<String, Double>> {
        val out = mutableMapOf<Long, MutableMap<String, Double>>()
        query("SELECT subject_id, field, value FROM grades WHERE student_id = ?", studentId) {
            out.getOrPut(it.getLong(0)) { mutableMapOf() }[it.getString(1)] = it.getDouble(2)
        }
        return out
    }

    fun clearGrades(classId: Long, subjectId: Long) {
        w.execSQL(
            "DELETE FROM grades WHERE subject_id = ? AND student_id IN (SELECT id FROM students WHERE class_id = ?)",
            arrayOf<Any>(subjectId, classId),
        )
    }

    // ---------- Timetable ----------

    private fun periodOf(c: Cursor) = Period(
        c.getLong(0), c.getLong(1), c.getInt(2), c.getInt(3), c.getInt(4), c.getLong(5), c.getLong(6), c.getString(7), c.getString(8),
    )

    private val periodSelect =
        "SELECT p.id, p.school_id, p.day, p.start_min, p.duration, p.class_id, p.subject_id, $CLASS_TITLE, sub.name " +
            "FROM periods p JOIN classes c ON c.id = p.class_id JOIN subjects sub ON sub.id = p.subject_id"

    fun periods(schoolId: Long): List<Period> =
        query("$periodSelect WHERE p.school_id = ? ORDER BY p.day, p.start_min", schoolId) { periodOf(it) }

    fun allPeriods(): List<Period> = query("$periodSelect ORDER BY p.day, p.start_min") { periodOf(it) }

    fun period(id: Long): Period? = query("$periodSelect WHERE p.id = ?", id) { periodOf(it) }.firstOrNull()

    fun savePeriod(p: Period): Long {
        val v = ContentValues().apply {
            put("school_id", p.schoolId)
            put("day", p.day)
            put("start_min", p.startMin)
            put("duration", p.duration)
            put("class_id", p.classId)
            put("subject_id", p.subjectId)
        }
        return if (p.id == 0L) w.insertOrThrow("periods", null, v)
        else {
            w.update("periods", v, "id = ?", arrayOf(p.id.toString()))
            p.id
        }
    }

    fun deletePeriod(id: Long) {
        w.delete("periods", "id = ?", arrayOf(id.toString()))
    }

    // ---------- Lesson plans ----------

    private val planSelect =
        "SELECT p.id, p.school_id, p.date, p.class_id, p.subject_id, p.title, p.cognitive, p.affective, p.psychomotor, " +
            "p.aids, p.steps, p.homework, p.notes, IFNULL($CLASS_TITLE, ''), IFNULL(sub.name, '') FROM plans p " +
            "LEFT JOIN classes c ON c.id = p.class_id LEFT JOIN subjects sub ON sub.id = p.subject_id"

    private fun planOf(c: Cursor) = LessonPlan(
        id = c.getLong(0), schoolId = c.getLong(1), date = c.getString(2),
        classId = if (c.isNull(3)) null else c.getLong(3), subjectId = if (c.isNull(4)) null else c.getLong(4),
        title = c.getString(5), cognitive = c.getString(6), affective = c.getString(7), psychomotor = c.getString(8),
        aids = c.getString(9), steps = c.getString(10), homework = c.getString(11), notes = c.getString(12),
        classTitle = c.getString(13), subjectName = c.getString(14),
    )

    fun plans(schoolId: Long): List<LessonPlan> =
        query("$planSelect WHERE p.school_id = ? ORDER BY p.date DESC, p.id DESC", schoolId) { planOf(it) }

    fun plan(id: Long): LessonPlan? = query("$planSelect WHERE p.id = ?", id) { planOf(it) }.firstOrNull()

    fun savePlan(p: LessonPlan): Long {
        val v = ContentValues().apply {
            put("school_id", p.schoolId)
            put("date", p.date)
            if (p.classId == null) putNull("class_id") else put("class_id", p.classId)
            if (p.subjectId == null) putNull("subject_id") else put("subject_id", p.subjectId)
            put("title", p.title)
            put("cognitive", p.cognitive)
            put("affective", p.affective)
            put("psychomotor", p.psychomotor)
            put("aids", p.aids)
            put("steps", p.steps)
            put("homework", p.homework)
            put("notes", p.notes)
        }
        return if (p.id == 0L) w.insertOrThrow("plans", null, v)
        else {
            w.update("plans", v, "id = ?", arrayOf(p.id.toString()))
            p.id
        }
    }

    fun deletePlan(id: Long) {
        w.delete("plans", "id = ?", arrayOf(id.toString()))
    }

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
