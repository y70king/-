@file:OptIn(ExperimentalMaterial3Api::class)

package com.hayalnaft.attendance.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.DoneAll
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.MarkChatRead
import androidx.compose.material.icons.filled.PhoneDisabled
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.hayalnaft.attendance.AppState
import com.hayalnaft.attendance.Screen
import com.hayalnaft.attendance.data.AttendanceRow
import com.hayalnaft.attendance.data.Status
import com.hayalnaft.attendance.util.Dates

@Composable
fun AttendanceScreen(app: AppState) {
    val v = app.version
    val sid = app.schoolId
    val classes = remember(v, sid) { app.db.classes(sid) }
    var selected by rememberSaveable { mutableStateOf<Long?>(null) }
    val classId = classes.firstOrNull { it.id == selected }?.id
        ?: (classes.firstOrNull { it.count > 0 } ?: classes.firstOrNull())?.id
    var date by rememberSaveable { mutableStateOf(Dates.today()) }
    val rows = remember(v, classId, date) { classId?.let { app.db.attendance(it, date) } ?: emptyList() }
    var showDate by remember { mutableStateOf(false) }
    var confirmSend by remember { mutableStateOf(false) }

    val notifyLate = app.prefs.notifyLate
    fun needsNotice(r: AttendanceRow) =
        !r.notified && r.student.phone.isNotBlank() &&
            (r.status == Status.ABSENT || (notifyLate && r.status == Status.LATE))
    val pending = rows.filter(::needsNotice)

    fun mark(r: AttendanceRow, status: Int) {
        val newStatus = if (r.status == status) Status.NONE else status
        app.db.setStatus(r.student.id, date, newStatus)
        app.changed()
        val notify = newStatus == Status.ABSENT || (notifyLate && newStatus == Status.LATE)
        if (app.prefs.autoSend && notify && !r.notified) app.notifyStatus(r.student, date, newStatus)
    }

    Scaffold(
        topBar = {
            AppTopBar(
                title = "الحضور والغياب",
                subtitle = Dates.pretty(date),
                onBack = app::back,
                actions = {
                    IconButton(onClick = { showDate = true }) { Icon(Icons.Filled.CalendarMonth, "اختيار التاريخ") }
                },
            )
        },
        bottomBar = {
            if (rows.isNotEmpty()) {
                Surface(Modifier.fillMaxWidth(), shadowElevation = 8.dp, color = Color.White) {
                    Column(Modifier.navigationBarsPadding().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            StatusUi.order.forEach { s -> CountBadge(StatusUi.label(s), rows.count { it.status == s }, StatusUi.color(s)) }
                            CountBadge("لم يُسجّل", rows.count { it.status == Status.NONE }, StatusUi.color(Status.NONE))
                        }
                        if (pending.isNotEmpty()) {
                            Button(
                                onClick = { confirmSend = true },
                                modifier = Modifier.fillMaxWidth().height(48.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = AbsentRed),
                            ) {
                                Icon(Icons.Filled.Send, null)
                                Spacer(Modifier.width(8.dp))
                                Text("تبليغ أولياء أمور الغائبين (${pending.size})", fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }
        },
    ) { pad ->
        Column(Modifier.fillMaxSize().padding(pad)) {
            if (classes.isEmpty()) {
                EmptyState(Icons.Filled.Groups, "لا توجد صفوف بعد", "أضف الصفوف والطلاب أولاً") {
                    Button(onClick = { app.go(Screen.Students) }) { Text("إدارة الطلاب والصفوف") }
                }
                return@Column
            }
            Spacer(Modifier.height(10.dp))
            ClassChips(classes, classId, { selected = it })
            if (rows.isEmpty()) {
                EmptyState(Icons.Filled.Groups, "لا يوجد طلاب في هذا الصف", "استورد أسماء الطلاب من Excel أو Word أو الصقها") {
                    Button(onClick = { app.go(Screen.Import(classId)) }) { Text("استيراد الطلاب") }
                }
                return@Column
            }
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    if (app.prefs.autoSend) "التبليغ الفوري مفعّل" else "التبليغ الفوري متوقف",
                    color = if (app.prefs.autoSend) PresentGreen else Color.Gray,
                    style = MaterialTheme.typography.labelMedium,
                    modifier = Modifier.weight(1f),
                )
                OutlinedButton(
                    onClick = {
                        classId?.let { app.db.markAllPresent(it, date) }
                        app.changed()
                    },
                    border = BorderStroke(1.dp, PresentGreen),
                    contentPadding = PaddingValues(horizontal = 12.dp),
                ) {
                    Icon(Icons.Filled.DoneAll, null, tint = PresentGreen, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("الباقون حاضرون", color = PresentGreen)
                }
            }
            LazyColumn(
                contentPadding = PaddingValues(start = 12.dp, end = 12.dp, bottom = 16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                itemsIndexed(rows, key = { _, r -> r.student.id }) { i, r ->
                    AttendanceItem(i + 1, r, onOpen = { app.go(Screen.StudentDetail(r.student.id)) }) { mark(r, it) }
                }
            }
        }
    }

    if (showDate) {
        val state = rememberDatePickerState(initialSelectedDateMillis = Dates.toUtcMillis(date))
        DatePickerDialog(
            onDismissRequest = { showDate = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { date = Dates.fromUtcMillis(it) }
                    showDate = false
                }) { Text("تم") }
            },
            dismissButton = { TextButton(onClick = { showDate = false }) { Text("إلغاء") } },
        ) { DatePicker(state) }
    }

    if (confirmSend) {
        ConfirmDialog(
            title = "إرسال التبليغات",
            text = "سيتم إرسال رسالة SMS إلى ${pending.size} ولي أمر لإبلاغهم بغياب أبنائهم.",
            confirmText = "إرسال",
            onDismiss = { confirmSend = false },
        ) { app.send(pending.map { app.statusMessage(it.student, date, it.status) }) }
    }
}

@Composable
private fun AttendanceItem(index: Int, r: AttendanceRow, onOpen: () -> Unit, onMark: (Int) -> Unit) {
    val color = StatusUi.color(r.status)
    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Row(Modifier.height(IntrinsicSize.Min)) {
            Box(Modifier.width(6.dp).fillMaxHeight().background(color))
            Column(Modifier.padding(10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.clickable(onClick = onOpen)) {
                    Box(
                        Modifier.size(28.dp).clip(CircleShape).background(color.copy(alpha = 0.15f)),
                        contentAlignment = Alignment.Center,
                    ) { Text("$index", color = color, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold) }
                    Spacer(Modifier.width(8.dp))
                    Text(
                        r.student.name,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.weight(1f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    if (r.notified) {
                        Icon(Icons.Filled.MarkChatRead, "تم التبليغ", tint = PresentGreen, modifier = Modifier.size(20.dp))
                    } else if (r.student.phone.isBlank()) {
                        Icon(Icons.Filled.PhoneDisabled, "لا يوجد رقم", tint = Color.Gray, modifier = Modifier.size(18.dp))
                    }
                }
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    StatusUi.order.forEach { s ->
                        StatusButton(s, selected = r.status == s, modifier = Modifier.weight(1f)) { onMark(s) }
                    }
                }
            }
        }
    }
}

@Composable
private fun StatusButton(status: Int, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val color = StatusUi.color(status)
    Surface(
        onClick = onClick,
        modifier = modifier.height(40.dp),
        shape = RoundedCornerShape(10.dp),
        color = if (selected) color else color.copy(alpha = 0.08f),
        contentColor = if (selected) Color.White else color,
    ) {
        Row(horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
            Icon(StatusUi.icon(status), null, modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(3.dp))
            Text(StatusUi.label(status), style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, maxLines = 1)
        }
    }
}
