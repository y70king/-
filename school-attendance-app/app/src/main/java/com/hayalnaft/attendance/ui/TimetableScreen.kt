@file:OptIn(ExperimentalMaterial3Api::class)

package com.hayalnaft.attendance.ui

import android.Manifest
import android.app.TimePickerDialog
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Alarm
import androidx.compose.material.icons.filled.AlarmOff
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.EditCalendar
import androidx.compose.material.icons.filled.HowToReg
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.hayalnaft.attendance.Alarms
import com.hayalnaft.attendance.AppState
import com.hayalnaft.attendance.Screen
import com.hayalnaft.attendance.data.Period
import com.hayalnaft.attendance.data.SchoolClass
import com.hayalnaft.attendance.data.Subject
import com.hayalnaft.attendance.util.Dates
import java.util.Calendar

@Composable
fun TimetableScreen(app: AppState) {
    val ctx = LocalContext.current
    val v = app.version
    val sid = app.schoolId
    val periods = remember(v, sid) { app.db.periods(sid) }
    val classes = remember(v, sid) { app.db.classes(sid) }
    val subjects = remember(v, sid) { app.db.subjects(sid) }
    var day by rememberSaveable { mutableIntStateOf(Calendar.getInstance().get(Calendar.DAY_OF_WEEK)) }
    var editing by remember { mutableStateOf<Period?>(null) }
    var alarms by remember { mutableStateOf(app.prefs.alarmsEnabled) }
    var lead by remember { mutableIntStateOf(app.prefs.alarmLead) }

    val notifPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (!granted) app.toast("بدون إذن الإشعارات لن يظهر منبه الحصص")
    }
    LaunchedEffect(alarms) {
        if (alarms && Build.VERSION.SDK_INT >= 33) notifPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    fun changed() {
        app.changed()
        Alarms.reschedule(ctx)
    }

    Scaffold(
        topBar = { AppTopBar("جدول الحصص", "الجدول الأسبوعي ومنبه الحصص", app::back) },
        floatingActionButton = {
            if (classes.isNotEmpty() && subjects.isNotEmpty()) {
                ExtendedFloatingActionButton(
                    onClick = { editing = Period(0, sid, day, 8 * 60, 45, classes.first().id, subjects.first().id) },
                    icon = { Icon(Icons.Filled.Add, null) },
                    text = { Text("إضافة حصة") },
                    containerColor = Gold,
                    contentColor = NavyDark,
                )
            }
        },
    ) { pad ->
        LazyColumn(
            Modifier.fillMaxSize().padding(pad),
            contentPadding = PaddingValues(bottom = 96.dp, top = 10.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item {
                Card(
                    Modifier.fillMaxWidth().padding(horizontal = 12.dp),
                    colors = CardDefaults.cardColors(containerColor = if (alarms) Gold.copy(alpha = 0.15f) else CardBg),
                ) {
                    Column(Modifier.padding(12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(if (alarms) Icons.Filled.Alarm else Icons.Filled.AlarmOff, null, tint = if (alarms) Color(0xFF8A5A00) else Muted)
                            Spacer(Modifier.width(8.dp))
                            Column(Modifier.weight(1f)) {
                                Text("منبه الحصص", fontWeight = FontWeight.Bold)
                                Text(
                                    if (alarms) "يرن قبل كل حصة بـ $lead دقائق، مع زر للانتقال للتعداد" else "المنبه متوقف",
                                    style = MaterialTheme.typography.bodySmall,
                                )
                            }
                            Switch(checked = alarms, onCheckedChange = {
                                alarms = it
                                app.prefs.alarmsEnabled = it
                                Alarms.reschedule(ctx)
                            })
                        }
                        if (alarms) {
                            Spacer(Modifier.height(6.dp))
                            OptionChips(listOf(0, 2, 5, 10, 15), lead, { if (it == 0) "عند البدء" else "قبل $it د" }) {
                                lead = it
                                app.prefs.alarmLead = it
                                Alarms.reschedule(ctx)
                            }
                        }
                    }
                }
            }
            item {
                OptionChips(Alarms.weekDays.map { it.first }, day, { Alarms.dayName(it) }) { day = it }
            }
            if (classes.isEmpty() || subjects.isEmpty()) {
                item {
                    EmptyState(Icons.Filled.EditCalendar, "أضف الصفوف والمواد أولاً", "يحتاج الجدول إلى صفوف ومواد دراسية") {
                        Button(onClick = { app.go(if (subjects.isEmpty()) Screen.Subjects else Screen.Students) }) {
                            Text(if (subjects.isEmpty()) "إضافة المواد" else "إضافة الصفوف")
                        }
                    }
                }
            }
            val dayPeriods = periods.filter { it.day == day }
            if (dayPeriods.isEmpty() && classes.isNotEmpty() && subjects.isNotEmpty()) {
                item { EmptyState(Icons.Filled.Schedule, "لا توجد حصص يوم ${Alarms.dayName(day)}", "اضغط «إضافة حصة» لإضافة حصص هذا اليوم") }
            }
            items(dayPeriods, key = { it.id }) { p ->
                Card(
                    onClick = { editing = p },
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
                    colors = CardDefaults.cardColors(containerColor = CardBg),
                    shape = RoundedCornerShape(14.dp),
                ) {
                    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(76.dp)) {
                            Text(Dates.clock(p.startMin), fontWeight = FontWeight.Bold, color = Ink)
                            Text(Dates.clock(p.startMin + p.duration), style = MaterialTheme.typography.labelSmall, color = Muted)
                        }
                        Spacer(Modifier.width(10.dp))
                        Column(Modifier.weight(1f)) {
                            Text(p.subjectName, fontWeight = FontWeight.Bold)
                            Text("${p.classTitle} • ${p.duration} دقيقة", style = MaterialTheme.typography.bodySmall, color = Muted)
                        }
                        IconButton(onClick = { app.go(Screen.Attendance(p.classId, p.subjectId)) }) {
                            Icon(Icons.Filled.HowToReg, "أخذ الحضور", tint = PresentGreen)
                        }
                        IconButton(onClick = { app.guard { app.db.deletePeriod(p.id); changed() } }) {
                            Icon(Icons.Filled.Delete, "حذف", tint = Muted)
                        }
                    }
                }
            }
        }
    }

    editing?.let { p ->
        PeriodDialog(p, classes, subjects, onDismiss = { editing = null }) {
            app.db.savePeriod(it)
            day = it.day
            changed()
        }
    }
}

@Composable
private fun PeriodDialog(
    initial: Period,
    classes: List<SchoolClass>,
    subjects: List<Subject>,
    onDismiss: () -> Unit,
    onSave: (Period) -> Unit,
) {
    val ctx = LocalContext.current
    var p by remember { mutableStateOf(initial) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (initial.id == 0L) "حصة جديدة" else "تعديل الحصة") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("اليوم", style = MaterialTheme.typography.labelLarge)
                OptionChips(Alarms.weekDays.map { it.first }, p.day, { Alarms.dayName(it) }) { p = p.copy(day = it) }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("وقت البدء", style = MaterialTheme.typography.labelLarge, modifier = Modifier.weight(1f))
                    OutlinedButton(onClick = {
                        TimePickerDialog(ctx, { _, h, m -> p = p.copy(startMin = h * 60 + m) }, p.startMin / 60, p.startMin % 60, false).show()
                    }) {
                        Icon(Icons.Filled.Schedule, null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(Dates.clock(p.startMin))
                    }
                }
                Text("مدة الحصة", style = MaterialTheme.typography.labelLarge)
                OptionChips(listOf(35, 40, 45, 50, 60), p.duration, { "$it د" }) { p = p.copy(duration = it) }
                Text("الصف", style = MaterialTheme.typography.labelLarge)
                OptionChips(classes.map { it.id }, p.classId, { id -> classes.first { it.id == id }.title }) { p = p.copy(classId = it) }
                Text("المادة", style = MaterialTheme.typography.labelLarge)
                OptionChips(subjects.map { it.id }, p.subjectId, { id -> subjects.first { it.id == id }.name }) { p = p.copy(subjectId = it) }
            }
        },
        confirmButton = {
            Button(onClick = {
                onSave(p)
                onDismiss()
            }) { Text("حفظ") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("إلغاء") } },
    )
}
