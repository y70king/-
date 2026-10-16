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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.hayalnaft.attendance.AppState
import com.hayalnaft.attendance.OutMsg
import com.hayalnaft.attendance.util.Dates
import com.hayalnaft.attendance.util.Phone
import com.hayalnaft.attendance.util.Templates

private enum class Target(val label: String) { STUDENT("طالب محدد"), CLASS("صف كامل"), ALL("جميع الطلاب") }

private val quickTemplates = listOf(
    "اجتماع أولياء الأمور" to "السلام عليكم، تدعوكم إدارة {المدرسة} لحضور اجتماع أولياء الأمور يوم ... الساعة ... ، حضوركم يهمنا.",
    "مراجعة الإدارة" to "ولي أمر الطالب {الطالب} المحترم، يرجى مراجعة إدارة {المدرسة} في أقرب وقت ممكن.",
    "الامتحانات" to "السلام عليكم، نعلمكم بأن الامتحانات ستبدأ يوم ... ، نرجو متابعة ابنكم {الطالب} والاهتمام بدراسته. إدارة {المدرسة}",
    "عطلة" to "السلام عليكم، تعلن إدارة {المدرسة} عن تعطيل الدوام يوم ... ويستأنف الدوام يوم ... .",
    "تهنئة" to "تتقدم إدارة {المدرسة} بالتهنئة لولي أمر الطالب {الطالب} بمناسبة تفوق ابنكم، متمنين له دوام النجاح.",
)

@Composable
fun MessagesScreen(app: AppState, initialStudentId: Long?) {
    val ctx = LocalContext.current
    val v = app.version
    val sid = app.schoolId
    val schoolName = remember(v, sid) { app.schoolName() }
    val classes = remember(v, sid) { app.db.classes(sid) }

    var target by rememberSaveable { mutableStateOf(if (initialStudentId != null) Target.STUDENT else Target.ALL) }
    var studentId by rememberSaveable { mutableStateOf(initialStudentId) }
    var classId by rememberSaveable { mutableStateOf<Long?>(null) }
    var body by rememberSaveable { mutableStateOf("") }
    var search by rememberSaveable { mutableStateOf("") }
    var confirm by remember { mutableStateOf(false) }

    val student = remember(v, studentId) { app.db.student(studentId) }
    val cls = classes.firstOrNull { it.id == classId } ?: classes.firstOrNull()
    val recipients = remember(v, sid, target, student, cls?.id) {
        when (target) {
            Target.STUDENT -> listOfNotNull(student)
            Target.CLASS -> cls?.let { app.db.students(sid, it.id) } ?: emptyList()
            Target.ALL -> app.db.students(sid, null)
        }
    }
    val withPhone = recipients.filter { it.phone.isNotBlank() }
    val matches = remember(v, sid, search) { if (search.isBlank()) emptyList() else app.db.students(sid, null, search).take(20) }
    val logs = remember(v, sid) { app.db.messages(sid) }

    Scaffold(topBar = { AppTopBar("التبليغات", "رسائل SMS لأولياء الأمور", app::back) }) { pad ->
        LazyColumn(
            Modifier.fillMaxSize().padding(pad),
            contentPadding = PaddingValues(vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            item {
                SectionTitle("إرسال إلى")
                Row(Modifier.padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Target.entries.forEach { t ->
                        FilterChip(selected = target == t, onClick = { target = t }, label = { Text(t.label) }, colors = chipColors())
                    }
                }
            }
            when (target) {
                Target.STUDENT -> {
                    if (student != null) {
                        item {
                            Card(
                                Modifier.fillMaxWidth().padding(horizontal = 12.dp),
                                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
                            ) {
                                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Avatar(student.name)
                                    Spacer(Modifier.width(10.dp))
                                    Column(Modifier.weight(1f)) {
                                        Text(student.name, fontWeight = FontWeight.Bold)
                                        Text(
                                            "${student.className} • ${student.phone.ifBlank { "لا يوجد رقم" }}",
                                            style = MaterialTheme.typography.bodySmall,
                                        )
                                    }
                                    IconButton(onClick = { studentId = null }) { Icon(Icons.Filled.Close, "تغيير") }
                                }
                            }
                        }
                    } else {
                        item {
                            OutlinedTextField(
                                value = search,
                                onValueChange = { search = it },
                                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
                                placeholder = { Text("اكتب اسم الطالب للبحث") },
                                leadingIcon = { Icon(Icons.Filled.Search, null) },
                                singleLine = true,
                                shape = RoundedCornerShape(14.dp),
                            )
                        }
                        items(matches, key = { it.id }) { s ->
                            Card(
                                onClick = { studentId = s.id; search = "" },
                                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
                                colors = CardDefaults.cardColors(containerColor = Color.White),
                            ) {
                                Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Avatar(s.name)
                                    Spacer(Modifier.width(10.dp))
                                    Column {
                                        Text(s.name, fontWeight = FontWeight.Bold)
                                        Text(s.className, style = MaterialTheme.typography.bodySmall, color = Color.Gray)
                                    }
                                }
                            }
                        }
                    }
                }
                Target.CLASS -> item { ClassChips(classes, cls?.id, { classId = it }) }
                Target.ALL -> {}
            }
            item {
                SectionTitle("نص التبليغ")
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(quickTemplates) { (title, text) ->
                        AssistChip(onClick = { body = text }, label = { Text(title) })
                    }
                }
                Spacer(Modifier.height(6.dp))
                OutlinedTextField(
                    value = body,
                    onValueChange = { body = it },
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
                    minLines = 4,
                    placeholder = { Text("اكتب نص التبليغ هنا…") },
                    shape = RoundedCornerShape(14.dp),
                    supportingText = {
                        Text("{الطالب} يُستبدل باسم كل طالب، و{المدرسة} باسم المدرسة • ${body.length} حرف")
                    },
                )
            }
            item {
                Column(Modifier.padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = { confirm = true },
                        enabled = body.isNotBlank() && withPhone.isNotEmpty(),
                        modifier = Modifier.fillMaxWidth().height(50.dp),
                    ) {
                        Icon(Icons.Filled.Send, null)
                        Spacer(Modifier.width(8.dp))
                        Text("إرسال إلى ${withPhone.size} ولي أمر", fontWeight = FontWeight.Bold)
                    }
                    val missing = recipients.size - withPhone.size
                    if (missing > 0) {
                        Text("$missing طالب بدون رقم هاتف لن تصلهم الرسالة", color = AbsentRed, style = MaterialTheme.typography.bodySmall)
                    }
                    if (target == Target.STUDENT && student != null && student.phone.isNotBlank()) {
                        OutlinedButton(
                            onClick = {
                                Phone.whatsapp(ctx, student.phone, Templates.fill(body, student, schoolName, Dates.today()), app.prefs.countryCode)
                            },
                            enabled = body.isNotBlank(),
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text("إرسال عبر واتساب (يحتاج إنترنت)") }
                    }
                }
            }
            item { SectionTitle("سجل الرسائل") }
            if (logs.isEmpty()) {
                item { EmptyState(Icons.Filled.Campaign, "لم يتم إرسال أي رسالة بعد") }
            }
            items(logs, key = { it.id }) { m ->
                Card(
                    Modifier.fillMaxWidth().padding(horizontal = 12.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                ) {
                    Column(Modifier.padding(12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                if (m.ok) Icons.Filled.CheckCircle else Icons.Filled.Error,
                                null,
                                tint = if (m.ok) PresentGreen else AbsentRed,
                                modifier = Modifier.size(18.dp),
                            )
                            Spacer(Modifier.width(6.dp))
                            Text(m.studentName ?: m.phone, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                            Tag(m.kind, Navy)
                        }
                        Text(m.body, style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        Text("${Dates.time(m.ts)} • ${m.phone}", style = MaterialTheme.typography.labelSmall, color = Color.Gray)
                    }
                }
            }
        }
    }

    if (confirm) {
        ConfirmDialog(
            "تأكيد الإرسال",
            "سيتم إرسال الرسالة إلى ${withPhone.size} ولي أمر عبر SMS من شريحة هاتفك. هل تريد المتابعة؟",
            "إرسال",
            onDismiss = { confirm = false },
        ) {
            val today = Dates.today()
            app.send(withPhone.map { s -> OutMsg(sid, s.phone, Templates.fill(body, s, schoolName, today), s.name, "تبليغ") })
        }
    }
}
