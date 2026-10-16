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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.hayalnaft.attendance.data.DEFAULT_SCHOOL
import com.hayalnaft.attendance.data.Db
import com.hayalnaft.attendance.data.School
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
    data object Classes : Screen
    data class Sections(val grade: String) : Screen
    data class ClassPage(val classId: Long) : Screen
    data class Import(val classId: Long?) : Screen
    data class Attendance(val classId: Long? = null, val subjectId: Long? = null) : Screen
    data class Messages(val studentId: Long? = null) : Screen
    data object Reports : Screen
    data class StudentDetail(val studentId: Long) : Screen
    data object Settings : Screen
    data object Subjects : Screen
    data class Grades(val classId: Long? = null) : Screen
    data object Timetable : Screen
    data object Plans : Screen
    data class PlanEditor(val planId: Long?) : Screen
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

    /** The app serves a single school (Hay Al-Naft secondary by default, renameable); it is created on first run. */
    fun ensureSchool() {
        val schools = db.schools()
        // The saved school keeps working after it is renamed.
        schoolId = (schools.firstOrNull { it.id == prefs.schoolId } ?: schools.firstOrNull { it.name == DEFAULT_SCHOOL }
            ?: schools.firstOrNull())?.id
            ?: db.addSchool(School(0, DEFAULT_SCHOOL), withClasses = true)
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

    /** True while the PIN lock screen covers the app. */
    var locked by mutableStateOf(prefs.lockApp && prefs.pin.isNotBlank())

    private var stoppedAt = 0L

    fun onAppStopped() {
        stoppedAt = System.currentTimeMillis()
    }

    /** Locks again when the app comes back after more than two minutes away (not after a quick trip to WhatsApp). */
    fun onAppStarted() {
        if (prefs.lockApp && prefs.pin.isNotBlank() && stoppedAt > 0 && System.currentTimeMillis() - stoppedAt > 120_000) locked = true
    }

    /** Bumped when the school logo changes. */
    var logoVersion by mutableIntStateOf(0)

    /** Light / dark choice, observed by the theme. */
    var theme by mutableStateOf(prefs.theme)

    /**
     * Warns the parent once when the student's absence days reach the configured limit.
     * Called after an absence is recorded.
     */
    fun checkAbsenceLimit(student: Student) {
        val limit = prefs.absenceLimit
        if (limit <= 0 || student.phone.isBlank() || prefs.limitWarned(student.id)) return
        val days = db.absentDays(student.id)
        if (days < limit) return
        val body = Templates.fill(prefs.limitTemplate, student, schoolName(), com.hayalnaft.attendance.util.Dates.today())
            .replace("{العدد}", "$days")
        prefs.markLimitWarned(student.id)
        toast("بلغ غياب ${student.name} $days يوماً — تم تنبيه ولي الأمر")
        if (whatsappChannel) {
            Phone.whatsapp(ctx, student.phone, body, prefs.countryCode)
            db.logMessage(student.schoolId, student.name, student.phone, body, true, "تنبيه غياب (واتساب)")
        } else {
            send(listOf(OutMsg(student.schoolId, student.phone, body, student.name, "تنبيه غياب")))
        }
    }

    /** An action waiting for the PIN to be entered; shown as a dialog by the root composable. */
    var pendingGuard by mutableStateOf<(() -> Unit)?>(null)

    /** Runs a destructive action, asking for the PIN first when one is set. */
    fun guard(action: () -> Unit) {
        if (prefs.pin.isBlank()) action() else pendingGuard = action
    }

    val whatsappChannel: Boolean get() = prefs.channel == Prefs.CHANNEL_WHATSAPP

    /**
     * Notifies the student's parent of an absence or lateness: by SMS straight from the SIM, or by opening
     * WhatsApp with the message ready, depending on the chosen channel.
     */
    fun notifyStatus(student: Student, date: String, subjectId: Long, status: Int) {
        if (student.phone.isBlank()) {
            toast("لا يوجد رقم هاتف لولي أمر ${student.name}")
            return
        }
        val msg = statusMessage(student, date, subjectId, status)
        if (whatsappChannel) {
            Phone.whatsapp(ctx, msg.phone, msg.body, prefs.countryCode)
            db.logMessage(msg.schoolId, msg.studentName, msg.phone, msg.body, true, msg.kind + " (واتساب)")
            msg.onSent?.invoke()
            changed()
        } else {
            send(listOf(msg))
        }
    }

    fun statusMessage(student: Student, date: String, subjectId: Long, status: Int): OutMsg {
        val late = status == Status.LATE
        val subject = if (subjectId == 0L) "" else db.subjects(student.schoolId).firstOrNull { it.id == subjectId }?.name.orEmpty()
        var tpl = if (late) prefs.lateTemplate else prefs.absentTemplate
        if (subject.isNotBlank() && "{المادة}" !in tpl) tpl = tpl.replace("عن الدوام", "عن حصة $subject")
        val body = Templates.fill(tpl, student, schoolName(), date, subject)
        return OutMsg(student.schoolId, student.phone, body, student.name, if (late) "تأخر" else "غياب") {
            db.markNotified(student.id, date, subjectId)
        }
    }

    /** Opens the roll call of a lesson, e.g. from the timetable alarm. */
    fun openAttendance(schoolId: Long, classId: Long, subjectId: Long) {
        if (schoolId != this.schoolId && db.school(schoolId) != null) selectSchool(schoolId)
        while (stack.size > 1) back()
        go(Screen.Attendance(classId, subjectId))
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
            Alarms.reschedule(ctx)
            return null
        } catch (e: Exception) {
            return "الملف ليس نسخة احتياطية صحيحة"
        } finally {
            tmp.delete()
        }
    }
}
