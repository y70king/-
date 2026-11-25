package com.school.attendance

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

data class Teacher(val id: Long, val name: String, val address: String)
data class Record(val teacherId: Long, val day: String, val firstSeen: Long, val lastSeen: Long)

/** قاعدة بيانات محلية على التلفون: المدرسين + سجل الحضور اليومي. */
class Db private constructor(ctx: Context) : SQLiteOpenHelper(ctx, "attendance.db", null, 1) {

    companion object {
        @Volatile private var inst: Db? = null
        fun get(ctx: Context): Db =
            inst ?: synchronized(this) { inst ?: Db(ctx.applicationContext).also { inst = it } }
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            "CREATE TABLE teachers(id INTEGER PRIMARY KEY AUTOINCREMENT, " +
                "name TEXT NOT NULL, address TEXT NOT NULL UNIQUE)"
        )
        db.execSQL(
            "CREATE TABLE attendance(teacher_id INTEGER NOT NULL, day TEXT NOT NULL, " +
                "first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL, PRIMARY KEY(teacher_id, day))"
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {}

    fun teachers(): List<Teacher> =
        readableDatabase.rawQuery("SELECT id, name, address FROM teachers ORDER BY name", null).use { c ->
            buildList { while (c.moveToNext()) add(Teacher(c.getLong(0), c.getString(1), c.getString(2))) }
        }

    /** يرجع false إذا الجهاز مسجل مسبقاً لمدرس ثاني. */
    fun addTeacher(name: String, address: String): Boolean {
        val v = ContentValues().apply {
            put("name", name.trim())
            put("address", address.uppercase())
        }
        return writableDatabase.insertWithOnConflict("teachers", null, v, SQLiteDatabase.CONFLICT_IGNORE) != -1L
    }

    fun renameTeacher(id: Long, name: String) {
        val v = ContentValues().apply { put("name", name.trim()) }
        writableDatabase.update("teachers", v, "id=?", arrayOf(id.toString()))
    }

    fun deleteTeacher(id: Long) {
        val db = writableDatabase
        db.delete("attendance", "teacher_id=?", arrayOf(id.toString()))
        db.delete("teachers", "id=?", arrayOf(id.toString()))
    }

    /** أول ظهور باليوم = وقت الحضور، وآخر ظهور يتحدث كل ما ينشاف الجهاز. */
    fun markSeen(teacherId: Long, day: String, time: Long) {
        val db = writableDatabase
        db.execSQL(
            "INSERT OR IGNORE INTO attendance(teacher_id, day, first_seen, last_seen) VALUES(?,?,?,?)",
            arrayOf<Any>(teacherId, day, time, time)
        )
        db.execSQL(
            "UPDATE attendance SET last_seen=? WHERE teacher_id=? AND day=? AND last_seen<?",
            arrayOf<Any>(time, teacherId, day, time)
        )
    }

    fun recordsForDay(day: String): Map<Long, Record> =
        readableDatabase.rawQuery(
            "SELECT teacher_id, day, first_seen, last_seen FROM attendance WHERE day=?", arrayOf(day)
        ).use { c ->
            buildMap { while (c.moveToNext()) put(c.getLong(0), Record(c.getLong(0), c.getString(1), c.getLong(2), c.getLong(3))) }
        }

    fun days(): List<String> =
        readableDatabase.rawQuery("SELECT DISTINCT day FROM attendance ORDER BY day", null).use { c ->
            buildList { while (c.moveToNext()) add(c.getString(0)) }
        }
}
