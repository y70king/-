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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.PersonOff
import androidx.compose.material.icons.filled.Sms
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.hayalnaft.attendance.AppState
import com.hayalnaft.attendance.Screen
import com.hayalnaft.attendance.util.Dates
import com.hayalnaft.attendance.util.Phone

@Composable
fun StudentDetailScreen(app: AppState, studentId: Long) {
    val ctx = LocalContext.current
    val v = app.version
    val student = remember(v, studentId) { app.db.student(studentId) }
    val history = remember(v, studentId) { app.db.history(studentId) }
    val stats = remember(v, student) { student?.let { s -> app.db.stats(s.schoolId, s.classId, null).firstOrNull { it.student.id == s.id } } }
    val classes = remember(v, student?.schoolId) { student?.let { app.db.classes(it.schoolId) } ?: emptyList() }
    var editing by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            AppTopBar("بيانات الطالب", student?.className, app::back) {
                if (student != null) IconButton(onClick = { editing = true }) { Icon(Icons.Filled.Edit, "تعديل") }
            }
        },
    ) { pad ->
        if (student == null) {
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
                        Text(student.className, color = Navy)
                        Text(
                            if (student.phone.isBlank()) "لا يوجد رقم ولي أمر" else "ولي الأمر: ${student.phone}",
                            color = if (student.phone.isBlank()) AbsentRed else Color.Gray,
                            style = MaterialTheme.typography.bodySmall,
                        )
                        Spacer(Modifier.height(10.dp))
                        if (stats != null) {
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                CountBadge("حضور", stats.present, PresentGreen)
                                CountBadge("غياب", stats.absent, AbsentRed)
                                CountBadge("تأخر", stats.late, LateOrange)
                                CountBadge("إجازة", stats.excused, ExcusedBlue)
                            }
                        }
                        if (student.phone.isNotBlank()) {
                            Spacer(Modifier.height(12.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Button(onClick = { Phone.dial(ctx, student.phone) }, modifier = Modifier.weight(1f), contentPadding = PaddingValues(horizontal = 8.dp)) {
                                    Icon(Icons.Filled.Call, null)
                                    Spacer(Modifier.width(4.dp))
                                    Text("اتصال", maxLines = 1, softWrap = false)
                                }
                                OutlinedButton(onClick = { app.go(Screen.Messages(student.id)) }, modifier = Modifier.weight(1f), contentPadding = PaddingValues(horizontal = 8.dp)) {
                                    Icon(Icons.Filled.Sms, null)
                                    Spacer(Modifier.width(4.dp))
                                    Text("تبليغ", maxLines = 1, softWrap = false)
                                }
                                OutlinedButton(
                                    onClick = { Phone.whatsapp(ctx, student.phone, "", app.prefs.countryCode) },
                                    modifier = Modifier.weight(1f),
                                    contentPadding = PaddingValues(horizontal = 8.dp),
                                ) {
                                    Icon(Icons.Filled.Chat, null)
                                    Spacer(Modifier.width(4.dp))
                                    Text("واتساب", maxLines = 1, softWrap = false)
                                }
                            }
                        }
                    }
                }
            }
            item { SectionTitle("سجل الغياب والتأخر") }
            if (history.isEmpty()) {
                item { EmptyState(Icons.Filled.EmojiEvents, "لا توجد غيابات مسجلة", "ممتاز! الطالب ملتزم بالدوام") }
            }
            items(history, key = { it.first }) { (date, status) ->
                Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(12.dp)) {
                    Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(StatusUi.icon(status), null, tint = StatusUi.color(status))
                        Spacer(Modifier.width(10.dp))
                        Text(Dates.pretty(date), modifier = Modifier.weight(1f))
                        Tag(StatusUi.label(status), StatusUi.color(status))
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
}
