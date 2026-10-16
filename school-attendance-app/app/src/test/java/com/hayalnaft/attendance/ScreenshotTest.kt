package com.hayalnaft.attendance

import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import com.hayalnaft.attendance.data.EventType
import com.hayalnaft.attendance.data.GradeField
import com.hayalnaft.attendance.data.LessonPlan
import com.hayalnaft.attendance.data.Period
import com.hayalnaft.attendance.data.Status
import com.hayalnaft.attendance.util.Dates
import com.hayalnaft.attendance.util.Importer
import com.hayalnaft.attendance.util.LessonTemplates
import com.hayalnaft.attendance.util.PageSink
import com.hayalnaft.attendance.util.PdfBuilder
import com.hayalnaft.attendance.util.Reports
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.util.Calendar

/** Renders the main screens and PDF reports to build/ so the layout can be reviewed without a phone. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w400dp-h860dp-xxhdpi")
class ScreenshotTest {
    @get:Rule
    val rule = createAndroidComposeRule<MainActivity>()

    @Test
    fun screens() {
        val ctx = ApplicationProvider.getApplicationContext<App>()
        val app = ctx.state
        val sid = app.schoolId
        val school = app.db.school(sid)!!.copy(directorate = "البصرة", principal = "أ. علي حسن", teacher = "أ. محمد كاظم")
        app.db.updateSchool(school)
        val cls = app.db.classes(sid).first { it.name == "الرابع العلمي" }
        val names = Importer.fromText(
            """
            أحمد محمد علي	07701234567
            علي حسين كاظم	07801234567
            مصطفى كريم جاسم
            حسن عباس فاضل	07709876543
            محمد جواد كاظم	07711112222
            كرار عادل سالم	07501112233
            سجاد ماجد حميد	07721112233
            """.trimIndent()
        )
        app.db.importStudents(sid, cls.id, names)
        listOf("اللغة العربية", "الرياضيات", "الفيزياء", "الكيمياء", "اللغة الإنكليزية").forEach { app.db.addSubject(sid, it) }
        val subjects = app.db.subjects(sid)
        val math = subjects[1]
        val today = Dates.today()
        val ids = app.db.students(sid, cls.id).map { it.id }
        app.db.setStatus(ids[0], today, math.id, Status.PRESENT)
        app.db.setStatus(ids[1], today, math.id, Status.ABSENT)
        app.db.markNotified(ids[1], today, math.id)
        app.db.setStatus(ids[2], today, math.id, Status.LATE)
        app.db.setStatus(ids[3], today, math.id, Status.PRESENT)
        app.db.setStatus(ids[4], today, math.id, Status.EXCUSED)
        for (d in 1..6) {
            val day = Dates.fromUtcMillis(Dates.toUtcMillis(today) - d * 86_400_000L)
            ids.forEachIndexed { i, id -> app.db.setStatus(id, day, 0, if ((i + d) % 5 == 0) Status.ABSENT else if ((i + d) % 7 == 0) Status.LATE else Status.PRESENT) }
        }
        app.db.addEvent(ids[0], today, EventType.POINTS, 5)
        app.db.addEvent(ids[0], today, EventType.GOOD, 0, "شارك بفاعلية في حل التمارين")
        app.db.addEvent(ids[2], today, EventType.BAD, 0, "كثير الحديث أثناء الشرح")
        val marks = listOf(
            listOf(95.0, 92.0, 94.0, 96.0, 90.0, null),
            listOf(70.0, 75.0, 60.0, 80.0, 81.0, 65.0),
            listOf(40.0, 45.0, 38.0, 50.0, 42.0, 44.0),
            listOf(85.0, 88.0, 80.0, 90.0, 86.0, 82.0),
            listOf(60.0, 66.0, 58.0, 70.0, 72.0, 61.0),
        )
        for ((i, row) in marks.withIndex()) for (sub in subjects) for ((j, f) in GradeField.inputs.withIndex()) {
            val m = row[j] ?: continue
            app.db.setGrade(ids[i], sub.id, f, (m - sub.id % 3 * 2).coerceAtLeast(0.0))
        }
        val day = Calendar.getInstance().get(Calendar.DAY_OF_WEEK)
        listOf(8 * 60 to math, 8 * 60 + 35 to subjects[2], 9 * 60 + 10 to subjects[0], 23 * 60 + 30 to subjects[3]).forEach { (t, s) ->
            app.db.savePeriod(Period(0, sid, day, t, 30, cls.id, s.id))
        }
        val t = LessonTemplates.all[2]
        val planId = app.db.savePlan(
            LessonPlan(
                schoolId = sid, date = today, classId = cls.id, subjectId = math.id, title = "حل المعادلات من الدرجة الثانية",
                cognitive = t.cognitive, affective = t.affective, psychomotor = t.psychomotor, aids = t.aids, steps = t.steps,
                homework = t.homework,
            )
        )
        app.changed()

        shot("01-home")
        go(app, Screen.Classes); shot("02-classes")
        go(app, Screen.Sections(cls.name)); shot("03-sections")
        go(app, Screen.ClassPage(cls.id)); shot("04-class-students")
        rule.onNodeWithText("الدرجات").performClick(); shot("05-class-grades")
        rule.onNodeWithText("التقرير").performClick(); shot("06-class-report")
        go(app, Screen.Attendance()); shot("07-attendance-pick")
        go(app, Screen.Attendance(cls.id, math.id)); shot("08-attendance-one")
        go(app, Screen.Attendance(cls.id)); shot("08b-daily-card")
        rule.onNodeWithText("غائب").performClick()
        // Marking absent asks before contacting the parent.
        rule.onNodeWithText("نعم، بلّغ ولي الأمر").assertExists()
        rule.onNodeWithText("لا").performClick()
        shot("08c-undo-banner")
        // A wrong tap can be undone: back to the first student, absence removed.
        rule.onNodeWithText("تراجع").performClick()
        rule.waitForIdle()
        org.junit.Assert.assertEquals(Status.NONE, app.db.attendance(cls.id, today, 0).first().status)
        rule.onNodeWithText("أحمد محمد علي").assertExists()
        go(app, Screen.Import(null)); shot("08d-import-pick")
        rule.onNodeWithText(cls.name).performClick(); shot("08e-import-picked")
        go(app, Screen.Grades(cls.id)); shot("09-grades")
        go(app, Screen.StudentDetail(ids[0])); shot("10-student")
        go(app, Screen.Timetable); shot("11-timetable")
        go(app, Screen.PlanEditor(planId)); shot("12-plan")
        go(app, Screen.Settings); shot("13-settings")
        rule.runOnIdle { app.theme = "dark" }
        go(app, Screen.Home); shot("14-dark-home")
        go(app, Screen.Attendance(cls.id, math.id)); shot("15-dark-attendance")
        go(app, Screen.ClassPage(cls.id)); shot("16-dark-class")
        rule.runOnIdle { app.theme = "system"; app.prefs.pin = "1234"; app.locked = true }
        shot("17-lock")
        rule.runOnIdle { app.locked = false }

        val s = app.db.school(sid)!!
        val c = app.db.classes(sid).first { it.id == cls.id }
        val out = File("build/pdfs").apply { mkdirs() }
        var tag = ""
        // PdfDocument has no native implementation under Robolectric, so pages are captured as images.
        PdfBuilder.sinkFactory = {
            object : PageSink {
                val pages = mutableListOf<Bitmap>()
                override fun start(width: Int, height: Int, number: Int): Canvas {
                    val b = Bitmap.createBitmap(width * 2, height * 2, Bitmap.Config.ARGB_8888)
                    pages.add(b)
                    return Canvas(b).apply { scale(2f, 2f) }
                }
                override fun finish() {}
                override fun write(file: File) {
                    pages.forEachIndexed { i, b ->
                        File(out, "$tag-${i + 1}.png").outputStream().use { b.compress(Bitmap.CompressFormat.PNG, 100, it) }
                    }
                    file.writeText("")
                }
            }
        }
        tag = "subject"; Reports.subjectSheet(ctx, app.db, s, c, math)
        tag = "class"; Reports.classSheet(ctx, app.db, s, c)
        tag = "student"; Reports.studentReport(ctx, app.db, s, c, app.db.student(ids[0])!!)
        tag = "certificate"; Reports.certificate(ctx, s, c, app.db.student(ids[0])!!, listOf("الرياضيات" to 94))
        tag = "plan"; Reports.lessonPlan(ctx, s, app.db.plan(planId)!!)
        val month = com.hayalnaft.attendance.util.Periods.options(s.year)[2]
        tag = "class-report"; Reports.classReport(ctx, app.db, s, c, month)
        tag = "student-month"; Reports.studentReport(ctx, app.db, s, c, app.db.student(ids[2])!!, month)
        File(out, "student.txt").writeText(Reports.studentText(app.db, s, c, app.db.student(ids[0])!!))
    }

    private fun go(app: AppState, screen: Screen) = rule.runOnIdle {
        while (app.stack.size > 1) app.back()
        app.go(screen)
    }

    private fun shot(name: String) {
        rule.waitForIdle()
        val view = rule.activity.window.decorView
        val bmp = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
        rule.runOnIdle { view.draw(Canvas(bmp)) }
        val file = File("build/screenshots/$name.png")
        file.parentFile!!.mkdirs()
        file.outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }
}
