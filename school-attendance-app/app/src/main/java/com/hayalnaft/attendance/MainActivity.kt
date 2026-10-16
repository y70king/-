package com.hayalnaft.attendance

import android.Manifest
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import com.hayalnaft.attendance.ui.AppTheme
import com.hayalnaft.attendance.ui.AttendanceScreen
import com.hayalnaft.attendance.ui.GradesScreen
import com.hayalnaft.attendance.ui.HomeScreen
import com.hayalnaft.attendance.ui.ImportScreen
import com.hayalnaft.attendance.ui.MessagesScreen
import com.hayalnaft.attendance.ui.PinDialog
import com.hayalnaft.attendance.ui.PlanEditorScreen
import com.hayalnaft.attendance.ui.PlansScreen
import com.hayalnaft.attendance.ui.ReportsScreen
import com.hayalnaft.attendance.ui.SendingBanner
import com.hayalnaft.attendance.ui.SettingsScreen
import com.hayalnaft.attendance.ui.StudentDetailScreen
import com.hayalnaft.attendance.ui.StudentsScreen
import com.hayalnaft.attendance.ui.SubjectsScreen
import com.hayalnaft.attendance.ui.TimetableScreen

class MainActivity : ComponentActivity() {
    private val app get() = (application as App).state

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT))
        super.onCreate(savedInstanceState)
        if (savedInstanceState == null) handleAlarm(intent)
        Alarms.reschedule(this)
        setContent {
            AppTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    AppRoot(app)
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleAlarm(intent)
    }

    /** Opens the lesson's roll call when launched from the timetable alarm. */
    private fun handleAlarm(intent: Intent?) {
        val classId = intent?.getLongExtra(Alarms.EXTRA_CLASS, 0) ?: 0
        if (classId == 0L) return
        Alarms.stop(this)
        app.openAttendance(
            intent!!.getLongExtra(Alarms.EXTRA_SCHOOL, app.schoolId),
            classId,
            intent.getLongExtra(Alarms.EXTRA_SUBJECT, 0),
        )
    }
}

@Composable
private fun AppRoot(app: AppState) {
    val pending = remember { arrayOfNulls<() -> Unit>(1) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        val action = pending[0]
        pending[0] = null
        if (granted) action?.invoke()
        else app.toast("لم يتم السماح بإرسال الرسائل. فعّل إذن الرسائل SMS من إعدادات الهاتف")
    }
    SideEffect {
        app.smsPermissionRequester = { action ->
            pending[0] = action
            launcher.launch(Manifest.permission.SEND_SMS)
        }
    }

    BackHandler(enabled = app.stack.size > 1) { app.back() }

    val holder = rememberSaveableStateHolder()
    val index = app.stack.lastIndex
    val screen = app.stack.last()
    val key = "$index:$screen"
    // Forget the state of screens that were popped off the stack.
    val known = remember { mutableSetOf<String>() }
    val live = app.stack.mapIndexed { i, s -> "$i:$s" }.toSet()
    SideEffect {
        (known - live).forEach { holder.removeState(it) }
        known.retainAll(live)
        known.add(key)
    }

    Box(Modifier.fillMaxSize()) {
        holder.SaveableStateProvider(key) {
            when (screen) {
                Screen.Home -> HomeScreen(app)
                Screen.Students -> StudentsScreen(app)
                is Screen.Import -> ImportScreen(app, screen.classId)
                is Screen.Attendance -> AttendanceScreen(app, screen.classId, screen.subjectId)
                is Screen.Messages -> MessagesScreen(app, screen.studentId)
                Screen.Reports -> ReportsScreen(app)
                is Screen.StudentDetail -> StudentDetailScreen(app, screen.studentId)
                Screen.Settings -> SettingsScreen(app)
                Screen.Subjects -> SubjectsScreen(app)
                Screen.Grades -> GradesScreen(app)
                Screen.Timetable -> TimetableScreen(app)
                Screen.Plans -> PlansScreen(app)
                is Screen.PlanEditor -> PlanEditorScreen(app, screen.planId)
            }
        }
        SendingBanner(app, Modifier.align(Alignment.BottomCenter))
    }

    app.pendingGuard?.let { action ->
        PinDialog(
            expected = app.prefs.pin,
            onDismiss = { app.pendingGuard = null },
            onSuccess = {
                app.pendingGuard = null
                action()
            },
        )
    }
}
