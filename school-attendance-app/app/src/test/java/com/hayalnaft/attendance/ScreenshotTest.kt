package com.hayalnaft.attendance

import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.core.app.ApplicationProvider
import com.hayalnaft.attendance.data.Status
import com.hayalnaft.attendance.util.Dates
import com.hayalnaft.attendance.util.Importer
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

/** Renders the main screens to build/screenshots so the layout can be reviewed without a phone. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w400dp-h860dp-xxhdpi")
class ScreenshotTest {
    @get:Rule
    val rule = createAndroidComposeRule<MainActivity>()

    @Test
    fun screens() {
        val app = ApplicationProvider.getApplicationContext<App>().state
        val sid = app.schoolId
        val classId = app.db.classes(sid)[3].id
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
        app.db.importStudents(sid, classId, names)
        val today = Dates.today()
        val ids = app.db.students(sid, classId).map { it.id }
        app.db.setStatus(ids[0], today, Status.PRESENT)
        app.db.setStatus(ids[1], today, Status.ABSENT)
        app.db.markNotified(ids[1], today)
        app.db.setStatus(ids[2], today, Status.LATE)
        app.db.setStatus(ids[3], today, Status.PRESENT)
        app.db.setStatus(ids[4], today, Status.EXCUSED)
        app.changed()

        shot("01-home")
        go(app, Screen.Attendance); shot("02-attendance")
        go(app, Screen.Students); shot("03-students")
        go(app, Screen.Import(classId)); shot("04-import")
        go(app, Screen.Messages()); shot("05-messages")
        go(app, Screen.Reports); shot("06-reports")
        go(app, Screen.StudentDetail(ids[1])); shot("07-student")
        go(app, Screen.Schools); shot("08-schools")
        go(app, Screen.Settings); shot("09-settings")
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
