@file:OptIn(ExperimentalMaterial3Api::class)

package com.hayalnaft.attendance.ui

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
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.EditNote
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.NoteAlt
import androidx.compose.material.icons.filled.PersonOff
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.ThumbDown
import androidx.compose.material.icons.filled.ThumbUp
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
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
import com.hayalnaft.attendance.AppState
import com.hayalnaft.attendance.Screen
import com.hayalnaft.attendance.data.EventType
import com.hayalnaft.attendance.util.Dates
import com.hayalnaft.attendance.util.Phone
import com.hayalnaft.attendance.util.Reports
import java.io.File

@Composable
fun StudentDetailScreen(app: AppState, studentId: Long) {
    val ctx = LocalContext.current
    val v = app.version
    val student = remember(v, studentId) { app.db.student(studentId) }
    val school = remember(v, student?.schoolId) { student?.let { app.db.school(it.schoolId) } }
    val classes = remember(v, student?.schoolId) { student?.let { app.db.classes(it.schoolId) } ?: emptyList() }
    val cls = classes.firstOrNull { it.id == student?.classId }
    val history = remember(v, studentId) { app.db.history(studentId) }
    val events = remember(v, studentId) { app.db.events(studentId) }
    val stats = remember(v, studentId) { app.db.studentStats(studentId) }
    val totals = remember(v, studentId) { app.db.eventTotals(studentId) }
    val subjects = remember(v, student?.schoolId) { student?.let { app.db.subjects(it.schoolId) } ?: emptyList() }
    val grades = remember(v, studentId) { app.db.studentGrades(studentId) }
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var editing by remember { mutableStateOf(false) }
    var addNote by remember { mutableStateOf(false) }
    var reportMenu by remember { mutableStateOf(false) }
    var pdf by remember { mutableStateOf<Pair<File, String>?>(null) }

    Scaffold(
        topBar = {
            AppTopBar("بيانات الطالب", student?.className, app::back) {
                if (student != null) {
                    IconButton(onClick = { editing = true }) { Icon(Icons.Filled.Edit, "تعديل") }
                    IconButton(onClick = {
                        app.guard {
                            app.db.deleteStudent(student.id)
                            app.changed()
                            app.back()
                        }
                    }) { Icon(Icons.Filled.Delete, "حذف") }
                }
            }
        },
    ) { pad ->
        if (student == null || school == null || cls == null) {
            Column(Modifier.padding(pad)) { EmptyState(Icons.Filled.PersonOff, "الطالب غير موجود") }
            return@Scaffold
        }
        LazyColumn(
            Modifier.fillMaxSize().padding(pad),
            contentPadding = PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item {
                Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) {
                    Column(Modifier.fillMaxWidth().padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Avatar(student.name)
                        Spacer(Modifier.height(8.dp))
                        Text(student.name, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        Text(cls.title + if (cls.room.isNotBlank()) " • قاعة ${cls.room}" else "", color = Navy)
                        Text(
                            if (student.phone.isBlank()) "لا يوجد رقم ولي أمر" else "ولي الأمر: ${student.phone}",
                            color = if (student.phone.isBlank()) AbsentRed else Color.Gray,
                            style = MaterialTheme.typography.bodySmall,
                        )
                        Spacer(Modifier.height(10.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            CountBadge("غياب", stats?.absent ?: 0, AbsentRed)
                            CountBadge("تأخر", stats?.late ?: 0, LateOrange)
                            CountBadge("نقاط", totals.points, Color(0xFF8A5A00))
                            CountBadge("جيد", totals.good, PresentGreen)
                            CountBadge("مشاغب", totals.bad, AbsentRed)
                        }
                        Spacer(Modifier.height(12.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (student.phone.isNotBlank()) {
                                Button(
                                    onClick = { Phone.dial(ctx, student.phone) },
                                    modifier = Modifier.weight(1f),
                                    contentPadding = PaddingValues(horizontal = 8.dp),
                                ) {
                                    Icon(Icons.Filled.Call, null)
                                    Spacer(Modifier.width(4.dp))
                                    Text("اتصال", maxLines = 1, softWrap = false)
                                }
                            }
                            OutlinedButton(
                                onClick = { reportMenu = true },
                                modifier = Modifier.weight(1.4f),
                                contentPadding = PaddingValues(horizontal = 8.dp),
                            ) {
                                Icon(Icons.Filled.Description, null)
                                Spacer(Modifier.width(4.dp))
                                Text("تقرير لولي الأمر", maxLines = 1, softWrap = false)
                            }
                            OutlinedButton(
                                onClick = { addNote = true },
                                modifier = Modifier.weight(1f),
                                contentPadding = PaddingValues(horizontal = 8.dp),
                            ) {
                                Icon(Icons.Filled.EditNote, null)
                                Spacer(Modifier.width(4.dp))
                                Text("ملاحظة", maxLines = 1, softWrap = false)
                            }
                        }
                    }
                }
            }
            item {
                TabRow(selectedTabIndex = tab, containerColor = Color.White, contentColor = Navy) {
                    Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("الحضور") })
                    Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("السلوك والنشاط") })
                    Tab(selected = tab == 2, onClick = { tab = 2 }, text = { Text("الدرجات") })
                }
            }
            when (tab) {
                0 -> {
                    if (history.isEmpty()) item { EmptyState(Icons.Filled.EmojiEvents, "لا يوجد سجل حضور بعد") }
                    items(history.size) { i ->
                        val h = history[i]
                        Card(colors = CardDefaults.cardColors(containerColor = StatusUi.color(h.status).copy(alpha = 0.07f)), shape = RoundedCornerShape(12.dp)) {
                            Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                Icon(StatusUi.icon(h.status), null, tint = StatusUi.color(h.status))
                                Spacer(Modifier.width(10.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(Dates.pretty(h.date))
                                    Text(h.subjectName?.let { "حصة $it" } ?: "التعداد اليومي", style = MaterialTheme.typography.labelSmall, color = Color.Gray)
                                }
                                Tag(StatusUi.label(h.status), StatusUi.color(h.status))
                            }
                        }
                    }
                }
                1 -> {
                    if (events.isEmpty()) item { EmptyState(Icons.Filled.NoteAlt, "لا توجد ملاحظات أو نقاط بعد") }
                    items(events, key = { it.id }) { e ->
                        val (icon, color) = when (e.type) {
                            EventType.POINTS -> Icons.Filled.Star to Color(0xFF8A5A00)
                            EventType.GOOD -> Icons.Filled.ThumbUp to PresentGreen
                            EventType.BAD -> Icons.Filled.ThumbDown to AbsentRed
                            else -> Icons.Filled.NoteAlt to Navy
                        }
                        Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(12.dp)) {
                            Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                Icon(icon, null, tint = color)
                                Spacer(Modifier.width(10.dp))
                                Column(Modifier.weight(1f)) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text(Reports.eventLabel(e.type, e.points), fontWeight = FontWeight.Bold, color = color)
                                        if (e.type != EventType.POINTS && e.points > 0) Text("  \u200E+${e.points}", color = Color(0xFF8A5A00))
                                    }
                                    if (e.note.isNotBlank()) Text(e.note)
                                    Text(Dates.pretty(e.date), style = MaterialTheme.typography.labelSmall, color = Color.Gray)
                                }
                                IconButton(onClick = {
                                    app.guard {
                                        app.db.deleteEvent(e.id)
                                        app.changed()
                                    }
                                }, modifier = Modifier.size(32.dp)) { Icon(Icons.Filled.Delete, "حذف", tint = Color.Gray) }
                            }
                        }
                    }
                }
                else -> {
                    if (subjects.isEmpty()) item { EmptyState(Icons.Filled.MenuBook, "لم تُضف مواد دراسية") }
                    items(subjects, key = { it.id }) { sub ->
                        val r = Reports.result(grades[sub.id], school, cls)
                        Card(colors = CardDefaults.cardColors(containerColor = if (r.exempt) Gold.copy(alpha = 0.12f) else Color.White), shape = RoundedCornerShape(12.dp)) {
                            Column(Modifier.fillMaxWidth().padding(12.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(sub.name, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                                    if (r.status.isNotBlank()) Tag(r.status, if (r.status == "مكمل") AbsentRed else PresentGreen)
                                }
                                Spacer(Modifier.height(6.dp))
                                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Tag("ف1: ${r.semester1 ?: "-"}", Navy)
                                    Tag("نصف: ${grades[sub.id]?.get("mid")?.let { fmtGrade(it) } ?: "-"}", Navy)
                                    Tag("ف2: ${r.semester2 ?: "-"}", Navy)
                                    Tag("السعي: ${r.annual ?: "-"}", ExcusedBlue)
                                    r.finalGrade?.let { Tag("النهائية: $it", PresentGreen) }
                                }
                            }
                        }
                    }
                    item {
                        TextButton(onClick = { app.go(Screen.Grades) }) { Text("فتح دفتر الدرجات") }
                    }
                }
            }
        }
    }

    if (editing && student != null) {
        StudentDialog(classes, student, student.classId, onDismiss = { editing = false }) { name, phone, cid ->
            app.db.updateStudent(student.id, cid, name, phone)
            app.changed()
        }
    }
    if (addNote && student != null) {
        QuickNoteDialog(student, onDismiss = { addNote = false }) { type, points, note ->
            app.db.addEvent(student.id, Dates.today(), type, points, note)
            app.changed()
        }
    }
    if (reportMenu && student != null && school != null && cls != null) {
        AlertDialog(
            onDismissRequest = { reportMenu = false },
            title = { Text("تقرير الطالب لولي الأمر") },
            text = { Text("تقرير شامل عن الحضور والسلوك والنشاط والدرجات.") },
            confirmButton = {
                Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Button(
                        enabled = student.phone.isNotBlank(),
                        onClick = {
                            reportMenu = false
                            Phone.whatsapp(ctx, student.phone, Reports.studentText(app.db, school, cls, student), app.prefs.countryCode)
                        },
                    ) {
                        Icon(Icons.Filled.Chat, null)
                        Spacer(Modifier.width(6.dp))
                        Text("رسالة نصية عبر واتساب")
                    }
                    OutlinedButton(onClick = {
                        reportMenu = false
                        pdf = Reports.studentReport(ctx, app.db, school, cls, student) to "تقرير ${student.name}"
                    }) { Text("ملف PDF") }
                    TextButton(onClick = { reportMenu = false }) { Text("إلغاء") }
                }
            },
        )
    }
    pdf?.let { (file, title) -> PdfDialog(app, file, title, student?.phone, onDismiss = { pdf = null }) }
}

private fun fmtGrade(d: Double) = if (d == Math.floor(d)) d.toLong().toString() else d.toString()
