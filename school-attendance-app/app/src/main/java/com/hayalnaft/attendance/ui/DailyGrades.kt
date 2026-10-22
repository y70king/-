@file:OptIn(ExperimentalMaterial3Api::class)

package com.hayalnaft.attendance.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.FactCheck
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.hayalnaft.attendance.AppState
import com.hayalnaft.attendance.util.NameSearch
import com.hayalnaft.attendance.data.DailyTest
import com.hayalnaft.attendance.data.School
import com.hayalnaft.attendance.data.SchoolClass
import com.hayalnaft.attendance.data.Student
import com.hayalnaft.attendance.data.Subject
import com.hayalnaft.attendance.data.dailyAverage
import com.hayalnaft.attendance.util.Dates

private fun fmt(d: Double) = if (d == Math.floor(d)) d.toLong().toString() else d.toString()

/**
 * Daily grades of a class in a subject, apart from the monthly grades: the teacher adds as many daily assessments
 * as needed (quiz, oral check, homework…), each with its own date and maximum, then marks every student.
 */
@Composable
fun DailyGradesPanel(app: AppState, school: School, cls: SchoolClass, subject: Subject, students: List<Student>) {
    val v = app.version
    val tests = remember(v, cls.id, subject.id) { app.db.dailyTests(cls.id, subject.id) }
    val marks = remember(v, cls.id, subject.id) { app.db.dailyMarks(cls.id, subject.id) }
    var selected by rememberSaveable(cls.id, subject.id) { mutableStateOf<Long?>(null) }
    val test = tests.firstOrNull { it.id == selected } ?: tests.lastOrNull()
    var editing by remember { mutableStateOf<DailyTest?>(null) }
    var search by rememberSaveable { mutableStateOf("") }
    var exporting by remember { mutableStateOf<DailyTest?>(null) }

    fun average(studentId: Long): Int? = dailyAverage(
        tests.mapNotNull { t -> marks[t.id]?.get(studentId)?.takeIf { t.maxMark > 0 }?.let { it / t.maxMark } },
        school.maxMark,
    )

    Column {
        OptionChips(tests.map { it.id } + -1L, test?.id, { id ->
            if (id == -1L) "+ درجة يومية جديدة"
            else tests.first { it.id == id }.let { t -> (t.title.ifBlank { "درجة يومية" }) + " • " + Dates.short(t.date) }
        }, Modifier.padding(vertical = 4.dp)) { id ->
            if (id == -1L) editing = DailyTest(0, cls.id, subject.id, Dates.today(), "", 10.0) else selected = id
        }

        if (test == null) {
            EmptyState(
                Icons.Filled.FactCheck,
                "لا توجد درجات يومية بعد",
                "أضف درجة يومية (اختبار قصير، مشاركة، واجب…) وحدد درجتها العظمى، ويمكن إضافة أكثر من درجة لكل مادة",
            ) {
                Button(onClick = { editing = DailyTest(0, cls.id, subject.id, Dates.today(), "", 10.0) }) {
                    Icon(Icons.Filled.Add, null)
                    Spacer(Modifier.width(6.dp))
                    Text("إضافة درجة يومية")
                }
            }
        } else {
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(test.title.ifBlank { "درجة يومية" }, fontWeight = FontWeight.Bold)
                    Text(
                        "${Dates.pretty(test.date)} • من ${fmt(test.maxMark)} • ${tests.size} درجة يومية",
                        style = MaterialTheme.typography.labelSmall,
                        color = Muted,
                    )
                }
                IconButton(onClick = { exporting = test }) { Icon(Icons.Filled.Share, "إرسال كشف هذه الدرجة", tint = PresentGreen) }
                IconButton(onClick = { editing = test }) { Icon(Icons.Filled.Edit, "تعديل", tint = Muted) }
                IconButton(onClick = {
                    app.guard {
                        app.db.deleteDailyTest(test.id)
                        selected = null
                        app.changed()
                    }
                }) { Icon(Icons.Filled.Delete, "حذف", tint = AbsentRed) }
            }
            SearchField(search, { search = it }, Modifier.padding(horizontal = 12.dp, vertical = 4.dp))
            val shown = students.withIndex().filter { NameSearch.matches(it.value.name, search) }
            if (shown.isEmpty()) NoSearchResults(search)
            LazyColumn(
                contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 6.dp, bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(shown, key = { it.value.id }) { (i, s) ->
                    val avg = average(s.id)
                    val count = tests.count { marks[it.id]?.containsKey(s.id) == true }
                    Card(colors = CardDefaults.cardColors(containerColor = CardBg), shape = RoundedCornerShape(14.dp)) {
                        Row(Modifier.fillMaxWidth().padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text("${i + 1}.", color = Muted, modifier = Modifier.width(28.dp))
                            Column(Modifier.weight(1f)) {
                                Text(s.name, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                if (avg != null) {
                                    Text(
                                        "المعدل اليومي $avg من ${school.maxMark} • $count درجة",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = if (avg >= school.maxMark / 2.0) PresentGreen else AbsentRed,
                                    )
                                }
                            }
                            GradeInput(marks[test.id]?.get(s.id), test.maxMark, Modifier.width(84.dp)) {
                                app.db.setDailyMark(test.id, s.id, it)
                                app.changed()
                            }
                        }
                    }
                }
            }
        }
    }

    exporting?.let { t ->
        ExportDialog(app, school, "كشف ${t.title.ifBlank { "الدرجة اليومية" }} — ${subject.name}", onDismiss = { exporting = null }) {
            com.hayalnaft.attendance.util.Reports.dailyTestDoc(app.db, school, cls, subject, t)
        }
    }

    editing?.let { t ->
        DailyTestDialog(t, onDismiss = { editing = null }) {
            selected = app.db.saveDailyTest(it)
            app.changed()
        }
    }
}

@Composable
private fun DailyTestDialog(initial: DailyTest, onDismiss: () -> Unit, onSave: (DailyTest) -> Unit) {
    var title by remember { mutableStateOf(initial.title) }
    var max by remember { mutableStateOf(fmt(initial.maxMark)) }
    var date by remember { mutableStateOf(initial.date) }
    var pickDate by remember { mutableStateOf(false) }
    val maxValue = max.toDoubleOrNull()?.takeIf { it > 0 }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (initial.id == 0L) "درجة يومية جديدة" else "تعديل الدرجة اليومية") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = title, onValueChange = { title = it }, singleLine = true,
                    label = { Text("الوصف (اختياري)") }, placeholder = { Text("اختبار قصير، مشاركة، واجب…") },
                    modifier = Modifier.fillMaxWidth(),
                )
                OptionChips(listOf("اختبار قصير", "مشاركة", "واجب", "شفهي", "تقرير"), title, { it }) { title = it }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = max, onValueChange = { v -> max = v.filter { it.isDigit() || it == '.' }.take(5) },
                        singleLine = true, label = { Text("الدرجة العظمى") }, isError = maxValue == null,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.weight(1f),
                    )
                    OutlinedButton(onClick = { pickDate = true }) {
                        Icon(Icons.Filled.CalendarMonth, null)
                        Spacer(Modifier.width(4.dp))
                        Text(Dates.display(date))
                    }
                }
                OptionChips(listOf("5", "10", "20", "100"), max, { "من $it" }) { max = it }
            }
        },
        confirmButton = {
            Button(enabled = maxValue != null, onClick = {
                onSave(initial.copy(title = title.trim(), maxMark = maxValue!!, date = date))
                onDismiss()
            }) { Text("حفظ") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("إلغاء") } },
    )
    if (pickDate) {
        val state = rememberDatePickerState(initialSelectedDateMillis = Dates.toUtcMillis(date))
        DatePickerDialog(
            onDismissRequest = { pickDate = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { date = Dates.fromUtcMillis(it) }
                    pickDate = false
                }) { Text("تم") }
            },
            dismissButton = { TextButton(onClick = { pickDate = false }) { Text("إلغاء") } },
        ) { DatePicker(state) }
    }
}
