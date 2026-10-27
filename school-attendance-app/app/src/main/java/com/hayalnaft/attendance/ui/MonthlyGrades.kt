@file:OptIn(ExperimentalMaterial3Api::class)

package com.hayalnaft.attendance.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Grading
import androidx.compose.material.icons.filled.PlaylistAdd
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import com.hayalnaft.attendance.data.GradeColumn
import com.hayalnaft.attendance.data.GradeResult
import com.hayalnaft.attendance.data.GradeRole
import com.hayalnaft.attendance.data.School
import com.hayalnaft.attendance.data.SchoolClass
import com.hayalnaft.attendance.data.Student
import com.hayalnaft.attendance.data.Subject
import com.hayalnaft.attendance.data.gradePresets
import com.hayalnaft.attendance.util.NameSearch
import com.hayalnaft.attendance.util.ReportDoc
import com.hayalnaft.attendance.util.Reports

private const val ALL_COLUMNS = 0L
private const val ADD_COLUMN = -1L

private fun fmt(d: Double) = if (d == Math.floor(d)) d.toLong().toString() else d.toString()

/**
 * Monthly grades of a class in a subject. The teacher adds each month, the mid-year exam and the final as columns,
 * each with its own maximum; marks are scaled to the school maximum for the Iraqi calculation.
 */
@Composable
fun MonthlyGradesPanel(
    app: AppState,
    school: School,
    cls: SchoolClass,
    subject: Subject,
    students: List<Student>,
    onExport: (String, () -> ReportDoc) -> Unit,
    onCertificate: (Student) -> Unit,
) {
    val v = app.version
    val g = remember(v, cls.id, subject.id) { app.db.subjectGrades(cls.id, subject.id) }
    var selected by rememberSaveable(cls.id, subject.id) { mutableStateOf<Long?>(null) }
    val showAll = selected == ALL_COLUMNS
    val current = if (showAll) null else g.columns.firstOrNull { it.id == selected } ?: g.columns.firstOrNull()
    var editing by remember { mutableStateOf<GradeColumn?>(null) }
    var addStandard by remember { mutableStateOf(false) }
    var search by rememberSaveable { mutableStateOf("") }

    fun newColumn() = GradeColumn(0, cls.id, subject.id, "", GradeRole.S1, school.maxMark.toDouble(), 0)

    Column {
        if (g.columns.isEmpty()) {
            EmptyState(
                Icons.Filled.Grading,
                "لم تُضف درجات شهرية بعد",
                "أضف الشهر الأول والثاني ونصف السنة وغيرها، وحدد الدرجة العظمى لكل واحدة (مثلاً من 20 أو من 50)",
            ) {
                Button(onClick = { editing = newColumn() }) {
                    Icon(Icons.Filled.Add, null)
                    Spacer(Modifier.width(6.dp))
                    Text("إضافة شهر أو امتحان")
                }
                OutlinedButton(onClick = { addStandard = true }) {
                    Icon(Icons.Filled.PlaylistAdd, null)
                    Spacer(Modifier.width(6.dp))
                    Text("إضافة الأشهر المعتادة دفعة واحدة")
                }
            }
        } else {
            OptionChips(g.columns.map { it.id } + ALL_COLUMNS + ADD_COLUMN, if (showAll) ALL_COLUMNS else current?.id, { id ->
                when (id) {
                    ALL_COLUMNS -> "كل الدرجات"
                    ADD_COLUMN -> "+ إضافة شهر / امتحان"
                    else -> g.columns.first { it.id == id }.let { "${it.title} (${fmt(it.maxMark)})" }
                }
            }, Modifier.padding(vertical = 4.dp)) { id ->
                if (id == ADD_COLUMN) editing = newColumn() else selected = id
            }
            Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                if (current != null) {
                    Column(Modifier.weight(1f)) {
                        Text(current.title, fontWeight = FontWeight.Bold)
                        Text(
                            "${GradeRole.label(current.role)} • من ${fmt(current.maxMark)}" + if (cls.ministerial) " • صف وزاري" else "",
                            style = MaterialTheme.typography.labelSmall,
                            color = Muted,
                        )
                    }
                    IconButton(onClick = {
                        onExport("كشف ${current.title} — ${subject.name}") { Reports.gradeColumnDoc(app.db, school, cls, subject, current) }
                    }) { Icon(Icons.Filled.Share, "إرسال كشف ${current.title}", tint = PresentGreen) }
                    IconButton(onClick = { editing = current }) { Icon(Icons.Filled.Edit, "تعديل", tint = Muted) }
                    IconButton(onClick = {
                        app.guard {
                            app.db.deleteGradeColumn(current.id)
                            selected = null
                            app.changed()
                        }
                    }) { Icon(Icons.Filled.Delete, "حذف", tint = AbsentRed) }
                } else {
                    Text(
                        "الدرجات تُحوَّل إلى ${school.maxMark} للحساب • الإعفاء ${school.exemptMark}",
                        style = MaterialTheme.typography.labelSmall,
                        color = Muted,
                        modifier = Modifier.weight(1f),
                    )
                    TextButton(onClick = {
                        onExport("كشف مادة ${subject.name}") { Reports.subjectSheetDoc(app.db, school, cls, subject) }
                    }) {
                        Icon(Icons.Filled.Share, null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("إرسال كشف المادة")
                    }
                }
            }
            SearchField(search, { search = it }, Modifier.padding(horizontal = 12.dp, vertical = 4.dp))
            val shown = students.withIndex().filter { NameSearch.matches(it.value.name, search) }
            if (shown.isEmpty()) NoSearchResults(search)
            LazyColumn(
                contentPadding = PaddingValues(start = 12.dp, end = 12.dp, bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(shown, key = { it.value.id }) { (i, s) ->
                    val marks = g.of(s.id)
                    MonthlyCard(
                        i + 1, s, g.columns, marks, Reports.result(g, s.id, school, cls), current,
                        onChange = { colId, value ->
                            app.db.setColumnMark(colId, s.id, value)
                            app.changed()
                        },
                        onCertificate = { onCertificate(s) },
                    )
                }
            }
        }
    }

    editing?.let { c ->
        GradeColumnDialog(c, onDismiss = { editing = null }) {
            selected = app.db.saveGradeColumn(it)
            app.changed()
        }
    }
    if (addStandard) {
        StandardColumnsDialog(school.maxMark.toDouble(), onDismiss = { addStandard = false }) { max ->
            app.db.addStandardColumns(cls.id, subject.id, max)
            app.changed()
        }
    }
}

@Composable
private fun MonthlyCard(
    index: Int,
    s: Student,
    columns: List<GradeColumn>,
    marks: Map<Long, Double>,
    r: GradeResult,
    current: GradeColumn?,
    onChange: (Long, Double?) -> Unit,
    onCertificate: () -> Unit,
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = if (r.exempt) Gold.copy(alpha = 0.12f) else CardBg),
        shape = RoundedCornerShape(14.dp),
    ) {
        Column(Modifier.padding(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("$index.", color = Muted, modifier = Modifier.width(28.dp))
                Text(s.name, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (current != null) {
                    GradeInput(marks[current.id], current.maxMark, Modifier.width(84.dp)) { onChange(current.id, it) }
                }
            }
            if (current == null) {
                Spacer(Modifier.height(6.dp))
                columns.chunked(3).forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(vertical = 3.dp)) {
                        row.forEach { c ->
                            GradeInput(marks[c.id], c.maxMark, Modifier.weight(1f), "${c.title} /${fmt(c.maxMark)}") { onChange(c.id, it) }
                        }
                        repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
                    }
                }
            }
            Spacer(Modifier.height(6.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                r.semester1?.let { Tag("ف1: $it", Ink) }
                r.semester2?.let { Tag("ف2: $it", Ink) }
                r.annual?.let { Tag("السعي: $it", ExcusedBlue) }
                r.finalGrade?.let { Tag("النهائية: $it", PresentGreen) }
                if (r.status.isNotBlank()) {
                    Tag(r.status, when (r.status) {
                        "مكمل" -> AbsentRed
                        "معفى" -> LateOrange
                        else -> PresentGreen
                    })
                }
                Spacer(Modifier.weight(1f))
                if (r.exempt) {
                    IconButton(onClick = onCertificate, modifier = Modifier.size(32.dp)) {
                        Icon(Icons.Filled.EmojiEvents, "شهادة تقديرية", tint = LateOrange)
                    }
                }
            }
        }
    }
}

/** Add or edit a month / exam: its name, where it counts, and its maximum mark. */
@Composable
private fun GradeColumnDialog(initial: GradeColumn, onDismiss: () -> Unit, onSave: (GradeColumn) -> Unit) {
    var title by remember { mutableStateOf(initial.title) }
    var role by remember { mutableStateOf(initial.role) }
    var max by remember { mutableStateOf(fmt(initial.maxMark)) }
    val maxValue = max.toDoubleOrNull()?.takeIf { it > 0 }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (initial.id == 0L) "إضافة شهر أو امتحان" else "تعديل ${initial.title}") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OptionChips(gradePresets.map { it.first }, title, { it }) { t ->
                    title = t
                    role = gradePresets.first { it.first == t }.second
                }
                OutlinedTextField(
                    value = title, onValueChange = { title = it }, singleLine = true,
                    label = { Text("الاسم") }, placeholder = { Text("مثال: الشهر الأول") },
                    modifier = Modifier.fillMaxWidth(),
                )
                Text("يُحسب ضمن", style = MaterialTheme.typography.labelLarge)
                OptionChips(GradeRole.all, role, { GradeRole.label(it) }) { role = it }
                OutlinedTextField(
                    value = max, onValueChange = { v -> max = v.filter { it.isDigit() || it == '.' }.take(5) },
                    singleLine = true, label = { Text("الدرجة العظمى (من كم)") }, isError = maxValue == null,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth(),
                )
                OptionChips(listOf("10", "20", "25", "30", "50", "100"), max, { "من $it" }) { max = it }
            }
        },
        confirmButton = {
            Button(enabled = title.isNotBlank() && maxValue != null, onClick = {
                onSave(initial.copy(title = title.trim(), role = role, maxMark = maxValue!!))
                onDismiss()
            }) { Text("حفظ") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("إلغاء") } },
    )
}

/** Adds the usual two months per semester, mid-year and final in one go, all out of the chosen maximum. */
@Composable
private fun StandardColumnsDialog(defaultMax: Double, onDismiss: () -> Unit, onSave: (Double) -> Unit) {
    var max by remember { mutableStateOf(fmt(defaultMax)) }
    val maxValue = max.toDoubleOrNull()?.takeIf { it > 0 }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("إضافة الأشهر المعتادة") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    "سيتم إضافة: الشهر الأول، الشهر الثاني، نصف السنة، الشهر الأول - ف2، الشهر الثاني - ف2، الامتحان النهائي. " +
                        "يمكنك بعدها تعديل الدرجة العظمى لأي واحدة أو حذفها.",
                    style = MaterialTheme.typography.bodySmall,
                )
                OutlinedTextField(
                    value = max, onValueChange = { v -> max = v.filter { it.isDigit() || it == '.' }.take(5) },
                    singleLine = true, label = { Text("الدرجة العظمى لكل منها") }, isError = maxValue == null,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth(),
                )
                OptionChips(listOf("10", "20", "50", "100"), max, { "من $it" }) { max = it }
            }
        },
        confirmButton = {
            Button(enabled = maxValue != null, onClick = {
                onSave(maxValue!!)
                onDismiss()
            }) { Text("إضافة") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("إلغاء") } },
    )
}
