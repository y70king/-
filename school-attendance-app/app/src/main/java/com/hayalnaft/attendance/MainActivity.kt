package com.hayalnaft.attendance

import android.Manifest
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
import com.hayalnaft.attendance.ui.HomeScreen
import com.hayalnaft.attendance.ui.ImportScreen
import com.hayalnaft.attendance.ui.MessagesScreen
import com.hayalnaft.attendance.ui.ReportsScreen
import com.hayalnaft.attendance.ui.SchoolsScreen
import com.hayalnaft.attendance.ui.SendingBanner
import com.hayalnaft.attendance.ui.SettingsScreen
import com.hayalnaft.attendance.ui.StudentDetailScreen
import com.hayalnaft.attendance.ui.StudentsScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT))
        super.onCreate(savedInstanceState)
        val app = (application as App).state
        setContent {
            AppTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    AppRoot(app)
                }
            }
        }
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
                Screen.Attendance -> AttendanceScreen(app)
                is Screen.Messages -> MessagesScreen(app, screen.studentId)
                Screen.Reports -> ReportsScreen(app)
                is Screen.StudentDetail -> StudentDetailScreen(app, screen.studentId)
                Screen.Schools -> SchoolsScreen(app)
                Screen.Settings -> SettingsScreen(app)
            }
        }
        SendingBanner(app, Modifier.align(Alignment.BottomCenter))
    }
}
