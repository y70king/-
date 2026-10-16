package com.hayalnaft.attendance

import android.app.Application
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.net.Uri
import android.widget.Toast
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.setValue
import com.hayalnaft.attendance.data.DEFAULT_SCHOOL
import com.hayalnaft.attendance.data.Db
import com.hayalnaft.attendance.data.Status
import com.hayalnaft.attendance.data.Student
import com.hayalnaft.attendance.util.Phone
import com.hayalnaft.attendance.util.Prefs
import com.hayalnaft.attendance.util.Templates
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

class App : Application() {
    val state by lazy { AppState(this) }
}

sealed interface Screen {
    data object Home : Screen
    data object Students : Screen
    data class Import(val classId: Long?) : Screen
    data object Attendance : Screen
    data class Messages(val studentId: Long? = null) : Screen
    data object Reports : Screen
    data class StudentDetail(val studentId: Long) : Screen
    data object Schools : Screen
    data object Settings : Screen
}

data class OutMsg(
    val schoolId: Long,
    val phone: String,
    val body: String,
    val studentName: String?,
    val kind: String,
    val onSent: (() -> Unit)? = null,
)

class AppState(context: Context) {
    val ctx: Context = context.applicationContext
    val db = Db(ctx)
    val prefs = Prefs(ctx)
    private val scope = MainScope()

    var schoolId by mutableLongStateOf(0L)
        private set

    /** Bumped after every data change so screens re-read from the database. */
    var version by mutableIntStateOf(0)
        private set

    val stack = mutableStateListOf<Screen>(Screen.Home)

    /** Set by the activity: asks for the SMS permission, then runs the action if granted. */
    var smsPermissionRequester: ((() -> Unit) -> Unit)? = null

    var queued by mutableIntStateOf(0)
        private set
    var done by mutableIntStateOf(0)
        private set
    private var failed = 0
    private var lastName: String? = null
    private val queue = Channel<OutMsg>(Channel.UNLIMITED)

    init {
        ensureSchool()
        scope.launch {
            for (m in queue) {
                val ok = withContext(Dispatchers.IO) { Phone.sendSms(ctx, m.phone, m.body) }
                db.logMessage(m.schoolId, m.studentName, m.phone, m.body, ok, m.kind)
                if (ok) m.onSent?.invoke() else failed++
                lastName = m.studentName
                done++
                changed()
                if (done >= queued) finishBatch()
                delay(300)
            }
        }
    }

    private fun finishBatch() {
        val total = queued
        val msg = when {
            failed == total -> "تعذر إرسال الرسائل. تأكد من وجود شريحة ورصيد في الهاتف"
            total == 1 -> "تم إرسال التبليغ إلى ولي أمر ${lastName ?: ""}"
            failed > 0 -> "تم إرسال ${total - failed} رسالة، وتعذر إرسال $failed"
            else -> "تم إرسال $total رسالة بنجاح"
        }
        queued = 0
        done = 0
        failed = 0
        toast(msg)
    }

    fun ensureSchool() {
        val schools = db.schools()
        val saved = prefs.schoolId
        schoolId = when {
            schools.any { it.id == saved } -> saved
            schools.isNotEmpty() -> schools.first().id
            else -> db.addSchool(DEFAULT_SCHOOL, withClasses = true)
        }
        prefs.schoolId = schoolId
    }

    fun selectSchool(id: Long) {
        schoolId = id
        prefs.schoolId = id
        changed()
    }

    fun schoolName(): String = db.school(schoolId)?.name ?: ""

    fun changed() {
        version++
    }

    fun go(screen: Screen) {
        stack.add(screen)
    }

    fun back() {
        if (stack.size > 1) stack.removeAt(stack.lastIndex)
    }

    fun toast(msg: String) = Toast.makeText(ctx, msg, Toast.LENGTH_LONG).show()

    fun withSms(action: () -> Unit) {
        if (Phone.hasSmsPermission(ctx)) action()
        else smsPermissionRequester?.invoke(action) ?: toast("يجب السماح للتطبيق بإرسال الرسائل")
    }

    fun send(items: List<OutMsg>) {
        if (items.isEmpty()) return
        withSms {
            queued += items.size
            items.forEach { queue.trySend(it) }
        }
    }

    /** Sends the absence / lateness message to the student's parent and marks the day as notified. */
    fun notifyStatus(student: Student, date: String, status: Int) {
        if (student.phone.isBlank()) {
            toast("لا يوجد رقم هاتف لولي أمر ${student.name}")
            return
        }
        send(listOf(statusMessage(student, date, status)))
    }

    fun statusMessage(student: Student, date: String, status: Int): OutMsg {
        val late = status == Status.LATE
        val body = Templates.fill(if (late) prefs.lateTemplate else prefs.absentTemplate, student, schoolName(), date)
        return OutMsg(student.schoolId, student.phone, body, student.name, if (late) "تأخر" else "غياب") {
            db.markNotified(student.id, date)
        }
    }

    // ---------- Backup ----------

    fun backup(uri: Uri): Boolean = try {
        db.close()
        val file = ctx.getDatabasePath(Db.NAME)
        ctx.contentResolver.openOutputStream(uri, "w")!!.use { out -> file.inputStream().use { it.copyTo(out) } }
        true
    } catch (e: Exception) {
        false
    }

    fun restore(uri: Uri): String? {
        val tmp = File(ctx.cacheDir, "restore.db")
        try {
            ctx.contentResolver.openInputStream(uri)!!.use { input -> tmp.outputStream().use { input.copyTo(it) } }
            val header = tmp.inputStream().use { s -> ByteArray(16).also { s.read(it) } }
            if (!String(header, Charsets.US_ASCII).startsWith("SQLite format 3")) return "الملف ليس نسخة احتياطية صحيحة"
            val valid = SQLiteDatabase.openDatabase(tmp.path, null, SQLiteDatabase.OPEN_READONLY).use { d ->
                d.rawQuery("SELECT COUNT(*) FROM schools", null).use { it.moveToFirst() }
            }
            if (!valid) return "الملف ليس نسخة احتياطية صحيحة"
            db.close()
            val target = ctx.getDatabasePath(Db.NAME)
            File(target.path + "-wal").delete()
            File(target.path + "-shm").delete()
            File(target.path + "-journal").delete()
            tmp.copyTo(target, overwrite = true)
            ensureSchool()
            changed()
            return null
        } catch (e: Exception) {
            return "الملف ليس نسخة احتياطية صحيحة"
        } finally {
            tmp.delete()
        }
    }
}
