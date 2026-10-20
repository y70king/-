@file:OptIn(ExperimentalMaterial3Api::class)

package com.hayalnaft.attendance.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DeleteSweep
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material.icons.filled.TableView
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
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
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hayalnaft.attendance.AppState
import com.hayalnaft.attendance.Screen
import com.hayalnaft.attendance.data.GradeField
import com.hayalnaft.attendance.data.GradeResult
import com.hayalnaft.attendance.data.Student
import com.hayalnaft.attendance.util.Reports
import java.io.File

private const val ALL_FIELDS = "all"

@Composable
fun GradesScreen(app: AppState, initialClassId: Long? = null) {
    val ctx = LocalContext.current
    val v = app.version
    val sid = app.schoolId
    val school = remember(v, sid) { app.db.school(sid) } ?: return
    val classes = remember(v, sid) { app.db.classes(sid) }
    val subjects = remember(v, sid) { app.db.subjects(sid) }
    var classSel by rememberSaveable { mutableStateOf(initialClassId) }
    var subjectSel by rememberSaveable { mutableStateOf<Long?>(null) }
    var field by rememberSaveable { mutableStateOf(GradeField.M1) }
    var daily by rememberSaveable { mutableStateOf(false) }
    val cls = classes.firstOrNull { it.id == classSel } ?: classes.firstOrNull { it.count > 0 } ?: classes.firstOrNull()
    val subject = subjects.firstOrNull { it.id == subjectSel } ?: subjects.firstOrNull()
    val students = remember(v, cls?.id) { cls?.let { app.db.students(sid, it.id) } ?: emptyList() }
    val grades = remember(v, cls?.id) { cls?.let { app.db.classGrades(it.id) } ?: emptyMap() }
    var menu by remember { mutableStateOf(false) }
    var pdf by remember { mutableStateOf<Pair<File, String>?>(null) }
    var export by remember { mutableStateOf<Pair<String, () -> com.hayalnaft.attendance.util.ReportDoc>?>(null) }

    Scaffold(
        topBar = {
            AppTopBar("دفتر الدرجات", school.name, app::back) {
                if (cls != null && subject != null) {
                    Box {
                        IconButton(onClick = { menu = true }) { Icon(Icons.Filled.MoreVert, "المزيد") }
                        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                            DropdownMenuItem(
                                text = { Text("كشف مادة ${subject.name} (PDF / Word / Excel)") },
                                leadingIcon = { Icon(Icons.Filled.PictureAsPdf, null) },
                                onClick = {
                                    menu = false
                                    export = "كشف مادة ${subject.name}" to { Reports.subjectSheetDoc(app.db, school, cls, subject) }
                                },
                            )
                            DropdownMenuItem(
                                text = { Text("كشف الدرجات اليومية لمادة ${subject.name}") },
                                leadingIcon = { Icon(Icons.Filled.TableView, null) },
                                onClick = {
                                    menu = false
                                    export = "الدرجات اليومية — ${subject.name}" to { Reports.dailySheetDoc(app.db, school, cls, subject) }
                                },
                            )
                            DropdownMenuItem(
                                text = { Text("الكشف الشامل لكل المواد (PDF / Word / Excel)") },
                                leadingIcon = { Icon(Icons.Filled.TableView, null) },
                                onClick = {
                                    menu = false
                                    export = "الكشف الشامل ${cls.title}" to { Reports.classSheetDoc(app.db, school, cls) }
                                },
                            )
                            DropdownMenuItem(
                                text = { Text("مسح درجات المادة لهذا الصف", color = AbsentRed) },
                                leadingIcon = { Icon(Icons.Filled.DeleteSweep, null, tint = AbsentRed) },
                                onClick = {
                                    menu = false
                                    app.guard {
                                        app.db.clearGrades(cls.id, subject.id)
                                        app.changed()
                                        app.toast("تم مسح درجات ${subject.name} لصف ${cls.title}")
                                    }
                                },
                            )
                        }
                    }
                }
            }
        },
    ) { pad ->
        Column(Modifier.fillMaxSize().padding(pad)) {
            if (subjects.isEmpty()) {
                EmptyState(Icons.Filled.MenuBook, "لم تُضف أي مادة دراسية بعد", "أضف المواد التي تدرّسها لتبدأ بإدخال الدرجات") {
                    Button(onClick = { app.go(Screen.Subjects) }) { Text("إدارة المواد الدراسية") }
                }
                return@Column
            }
            Spacer(Modifier.height(8.dp))
            ClassChips(classes, cls?.id, { classSel = it })
            Spacer(Modifier.height(6.dp))
            SubjectChips(subjects, subject?.id, { subjectSel = it })
            Spacer(Modifier.height(6.dp))
            TabRow(selectedTabIndex = if (daily) 1 else 0, containerColor = CardBg, contentColor = Ink) {
                Tab(selected = !daily, onClick = { daily = false }, text = { Text("الدرجات الشهرية") })
                Tab(selected = daily, onClick = { daily = true }, text = { Text("الدرجات اليومية") })
            }
            Spacer(Modifier.height(6.dp))
            if (daily) {
                if (cls == null || subject == null || students.isEmpty()) {
                    EmptyState(Icons.Filled.MenuBook, "لا يوجد طلاب في هذا الصف")
                } else {
                    DailyGradesPanel(app, school, cls, subject, students)
                }
                return@Column
            }
            OptionChips(GradeField.inputs + ALL_FIELDS, field, { if (it == ALL_FIELDS) "كل الدرجات" else GradeField.label(it) }) { field = it }
            if (cls != null) {
                Text(
                    "الدرجة العظمى ${school.maxMark} • درجة الإعفاء ${school.exemptMark}" +
                        if (cls.ministerial) " • صف وزاري (بدون إعفاء)" else "",
                    style = MaterialTheme.typography.labelMedium,
                    color = Muted,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                )
            }
            if (cls == null || subject == null || students.isEmpty()) {
                EmptyState(Icons.Filled.MenuBook, "لا يوجد طلاب في هذا الصف")
                return@Column
            }
            LazyColumn(
                contentPadding = PaddingValues(start = 12.dp, end = 12.dp, bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                itemsIndexed(students, key = { _, s -> s.id }) { i, s ->
                    val values = grades[s.id]?.get(subject.id) ?: emptyMap()
                    val r = Reports.result(values, school, cls)
                    GradeCard(i + 1, s, values, r, field, school.maxMark,
                        onChange = { f, value ->
                            app.db.setGrade(s.id, subject.id, f, value)
                            app.changed()
                        },
                        onCertificate = {
                            val exempt = subjects.mapNotNull { sub ->
                                val rr = Reports.result(grades[s.id]?.get(sub.id), school, cls)
                                if (rr.exempt) sub.name to (rr.annual ?: 0) else null
                            }
                            pdf = Reports.certificate(ctx, school, cls, s, exempt) to "شهادة تقديرية — ${s.name}"
                        },
                    )
                }
            }
        }
    }

    pdf?.let { (file, title) -> PdfDialog(app, file, title, onDismiss = { pdf = null }) }
    export?.let { (title, doc) -> ExportDialog(app, school, title, onDismiss = { export = null }, doc = doc) }
}

@Composable
private fun GradeCard(
    index: Int,
    s: Student,
    values: Map<String, Double>,
    r: GradeResult,
    field: String,
    maxMark: Int,
    onChange: (String, Double?) -> Unit,
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
                if (field != ALL_FIELDS) {
                    GradeInput(values[field], maxMark.toDouble(), Modifier.width(84.dp)) { onChange(field, it) }
                }
            }
            if (field == ALL_FIELDS) {
                Spacer(Modifier.height(6.dp))
                GradeField.inputs.chunked(3).forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(vertical = 3.dp)) {
                        row.forEach { f ->
                            GradeInput(values[f], maxMark.toDouble(), Modifier.weight(1f), GradeField.label(f)) { onChange(f, it) }
                        }
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

@Composable
internal fun GradeInput(value: Double?, maxMark: Double, modifier: Modifier, label: String? = null, onValue: (Double?) -> Unit) {
    var text by remember(value) { mutableStateOf(value?.let { if (it == Math.floor(it)) it.toLong().toString() else it.toString() } ?: "") }
    var error by remember { mutableStateOf(false) }
    OutlinedTextField(
        value = text,
        onValueChange = { t ->
            val clean = t.filter { it.isDigit() || it == '.' }.take(5)
            text = clean
            val d = clean.toDoubleOrNull()
            error = d != null && d > maxMark
            if (!error && (clean.isEmpty() || d != null)) onValue(d)
        },
        modifier = modifier,
        label = label?.let { { Text(it, maxLines = 1, fontSize = 11.sp) } },
        isError = error,
        singleLine = true,
        textStyle = TextStyle(textAlign = TextAlign.Center, fontWeight = FontWeight.Bold, fontSize = 16.sp),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
        shape = RoundedCornerShape(10.dp),
    )
}
