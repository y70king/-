@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)

package com.hayalnaft.attendance.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Grading
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.HowToReg
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material.icons.filled.School
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.TableView
import androidx.compose.material.icons.filled.UploadFile
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DateRangePicker
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDateRangePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.hayalnaft.attendance.AppState
import com.hayalnaft.attendance.Screen
import com.hayalnaft.attendance.data.DateRange
import com.hayalnaft.attendance.data.Grades
import com.hayalnaft.attendance.data.School
import com.hayalnaft.attendance.data.SchoolClass
import com.hayalnaft.attendance.data.Stages
import com.hayalnaft.attendance.data.Student
import com.hayalnaft.attendance.data.StudentStats
import com.hayalnaft.attendance.util.Dates
import com.hayalnaft.attendance.util.NameSearch
import com.hayalnaft.attendance.util.Periods
import com.hayalnaft.attendance.util.Phone
import com.hayalnaft.attendance.util.Reports
import java.io.File

private val sectionLetters = listOf("أ", "ب", "ج", "د", "هـ", "و", "ز", "ح", "ط", "ي")

/** Grades of the school in curriculum order (first primary … sixth preparatory), then any custom ones. */
private fun gradeOrder(name: String): Int = Stages.allGrades.indexOf(name).let { if (it < 0) 1000 else it }

// ---------- Grades (الصفوف) ----------

@Composable
fun ClassesScreen(app: AppState) {
    val v = app.version
    val sid = app.schoolId
    val school = remember(v, sid) { app.db.school(sid) }
    val classes = remember(v, sid) { app.db.classes(sid) }
    val grades = classes.groupBy { it.name }.toList().sortedBy { gradeOrder(it.first) }
    var adding by remember { mutableStateOf(false) }
    var renaming by remember { mutableStateOf<String?>(null) }
    var deleting by remember { mutableStateOf<String?>(null) }

    Scaffold(
        topBar = {
            AppTopBar("الصفوف", "${grades.size} صف • ${classes.size} شعبة • ${classes.sumOf { it.count }} طالب", app::back) {
                IconButton(onClick = { app.go(Screen.Students) }) { Icon(Icons.Filled.Search, "البحث عن طالب") }
            }
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { adding = true },
                icon = { Icon(Icons.Filled.Add, null) },
                text = { Text("إضافة صف") },
                containerColor = Gold,
                contentColor = NavyDark,
            )
        },
    ) { pad ->
        LazyColumn(
            Modifier.fillMaxSize().padding(pad),
            contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 12.dp, bottom = 96.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (grades.isEmpty()) item { EmptyState(Icons.Filled.School, "لا توجد صفوف", "اضغط «إضافة صف» لإنشاء أول صف") }
            items(grades, key = { it.first }) { (grade, sections) ->
                var menu by remember { mutableStateOf(false) }
                Card(
                    onClick = { app.go(Screen.Sections(grade)) },
                    colors = CardDefaults.cardColors(containerColor = CardBg),
                    shape = RoundedCornerShape(16.dp),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                ) {
                    Row(Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            Modifier.size(50.dp).clip(RoundedCornerShape(14.dp)).background(Ink.copy(alpha = 0.12f)),
                            contentAlignment = Alignment.Center,
                        ) { Icon(Icons.Filled.School, null, tint = Ink) }
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(grade, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                            Text(
                                "${sections.size} شعبة • ${sections.sumOf { it.count }} طالب",
                                color = Muted,
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                        if (sections.any { it.ministerial }) Tag("وزاري", LateOrange)
                        Box {
                            IconButton(onClick = { menu = true }) { Icon(Icons.Filled.MoreVert, "المزيد") }
                            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                                DropdownMenuItem(
                                    text = { Text("تعديل اسم الصف") },
                                    leadingIcon = { Icon(Icons.Filled.Edit, null) },
                                    onClick = { menu = false; renaming = grade },
                                )
                                DropdownMenuItem(
                                    text = { Text("حذف الصف بكل شعبه", color = AbsentRed) },
                                    leadingIcon = { Icon(Icons.Filled.Delete, null, tint = AbsentRed) },
                                    onClick = { menu = false; deleting = grade },
                                )
                            }
                        }
                        Icon(Icons.Filled.ChevronLeft, null, tint = Muted)
                    }
                }
            }
        }
    }

    if (adding) {
        ClassDialog(null, school?.stage ?: "", "صف جديد", onDismiss = { adding = false }) { name, section, room, ministerial ->
            app.db.addClass(sid, name, section, room, ministerial)
            app.changed()
        }
    }
    renaming?.let { grade ->
        TextInputDialog("تعديل اسم الصف", "اسم الصف", grade, onDismiss = { renaming = null }) { name ->
            classes.filter { it.name == grade }.forEach { app.db.updateClass(it.copy(name = name)) }
            app.changed()
        }
    }
    deleting?.let { grade ->
        val sections = classes.filter { it.name == grade }
        ConfirmDialog(
            "حذف الصف",
            "سيتم حذف $grade بجميع شعبه (${sections.size}) وطلابه (${sections.sumOf { it.count }}) وسجلاتهم ودرجاتهم. هل أنت متأكد؟",
            "حذف", danger = true, onDismiss = { deleting = null },
        ) {
            app.guard {
                sections.forEach { app.db.deleteClass(it.id) }
                app.changed()
            }
        }
    }
}

// ---------- Sections (الشعب) ----------

@Composable
fun SectionsScreen(app: AppState, grade: String) {
    val v = app.version
    val sid = app.schoolId
    val school = remember(v, sid) { app.db.school(sid) }
    val sections = remember(v, sid, grade) { app.db.classes(sid).filter { it.name == grade } }
    var adding by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<SchoolClass?>(null) }
    var deleting by remember { mutableStateOf<SchoolClass?>(null) }

    Scaffold(
        topBar = { AppTopBar(grade, "${sections.size} شعبة • ${sections.sumOf { it.count }} طالب", app::back) },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { adding = true },
                icon = { Icon(Icons.Filled.Add, null) },
                text = { Text("إضافة شعبة") },
                containerColor = Gold,
                contentColor = NavyDark,
            )
        },
    ) { pad ->
        LazyColumn(
            Modifier.fillMaxSize().padding(pad),
            contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 12.dp, bottom = 96.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (sections.isEmpty()) item { EmptyState(Icons.Filled.Groups, "لا توجد شعب", "اضغط «إضافة شعبة»") }
            items(sections, key = { it.id }) { c ->
                Card(
                    onClick = { app.go(Screen.ClassPage(c.id)) },
                    colors = CardDefaults.cardColors(containerColor = CardBg),
                    shape = RoundedCornerShape(16.dp),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                ) {
                    Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            Modifier.size(52.dp).clip(CircleShape).background(Gold),
                            contentAlignment = Alignment.Center,
                        ) { Text(c.section.ifBlank { "-" }, fontWeight = FontWeight.Bold, color = NavyDark, style = MaterialTheme.typography.titleLarge) }
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text("شعبة ${c.section.ifBlank { "-" }}", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                            Text(
                                listOfNotNull("${c.count} طالب", c.room.takeIf { it.isNotBlank() }?.let { "قاعة $it" }).joinToString(" • "),
                                color = Muted,
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                        IconButton(onClick = { app.go(Screen.Attendance(c.id)) }) { Icon(Icons.Filled.HowToReg, "أخذ الحضور", tint = PresentGreen) }
                        IconButton(onClick = { editing = c }) { Icon(Icons.Filled.Edit, "تعديل", tint = Muted) }
                        IconButton(onClick = { deleting = c }) { Icon(Icons.Filled.Delete, "حذف", tint = AbsentRed) }
                    }
                }
            }
        }
    }

    if (adding) {
        val used = sections.map { it.section }.toSet()
        val next = sectionLetters.firstOrNull { it !in used } ?: ""
        ClassDialog(
            SchoolClass(0, sid, grade, next, "", Stages.isMinisterial(grade), 0), school?.stage ?: "", "شعبة جديدة",
            onDismiss = { adding = false },
        ) { name, section, room, ministerial ->
            app.db.addClass(sid, name, section, room, ministerial)
            app.changed()
        }
    }
    editing?.let { c ->
        ClassDialog(c, school?.stage ?: "", "تعديل الشعبة", onDismiss = { editing = null }) { name, section, room, ministerial ->
            app.db.updateClass(c.copy(name = name, section = section, room = room, ministerial = ministerial))
            app.changed()
        }
    }
    deleting?.let { c ->
        ConfirmDialog(
            "حذف الشعبة",
            "سيتم حذف ${c.title} مع طلابها (${c.count}) وسجلاتهم ودرجاتهم. هل أنت متأكد؟",
            "حذف", danger = true, onDismiss = { deleting = null },
        ) {
            app.guard {
                app.db.deleteClass(c.id)
                app.changed()
                if (sections.size <= 1) app.back()
            }
        }
    }
}

// ---------- Class page ----------

@Composable
fun ClassPageScreen(app: AppState, classId: Long) {
    val ctx = LocalContext.current
    val v = app.version
    val sid = app.schoolId
    val school = remember(v, sid) { app.db.school(sid) }
    val cls = remember(v, classId) { app.db.classes(sid).firstOrNull { it.id == classId } }
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var search by rememberSaveable { mutableStateOf("") }
    var adding by remember { mutableStateOf(false) }
    var editingStudent by remember { mutableStateOf<Student?>(null) }
    var deletingStudent by remember { mutableStateOf<Student?>(null) }
    var editingClass by remember { mutableStateOf(false) }
    var rangeIndex by rememberSaveable { mutableIntStateOf(2) }
    var customFrom by rememberSaveable { mutableStateOf<String?>(null) }
    var customTo by rememberSaveable { mutableStateOf<String?>(null) }
    var pickRange by remember { mutableStateOf(false) }
    var pdf by remember { mutableStateOf<Pair<File, String>?>(null) }
    var pdfPhone by remember { mutableStateOf<String?>(null) }
    var export by remember { mutableStateOf<Pair<String, () -> com.hayalnaft.attendance.util.ReportDoc>?>(null) }
    var reportFor by remember { mutableStateOf<Student?>(null) }

    if (cls == null || school == null) {
        Scaffold(topBar = { AppTopBar("الصف", onBack = app::back) }) { pad ->
            Column(Modifier.padding(pad)) { EmptyState(Icons.Filled.Groups, "الصف غير موجود") }
        }
        return
    }
    val periods = Periods.options(school.year)
    val custom = if (customFrom != null && customTo != null) DateRange(customFrom!!, customTo!!, "فترة مخصصة") else null
    val range = if (rangeIndex >= periods.size) custom ?: periods[2] else periods[rangeIndex]

    val students = remember(v, classId, search) { app.db.students(sid, classId, search) }
    val subjects = remember(v, sid) { app.db.subjects(sid) }
    val grades = remember(v, classId) { app.db.classGrades(classId) }
    val stats = remember(v, classId, range) { app.db.stats(sid, classId, range).sortedBy { it.student.id } }
    val totals = remember(v, classId, range) { app.db.classEventTotals(classId, range) }

    Scaffold(
        topBar = {
            AppTopBar(
                cls.title,
                listOfNotNull("${cls.count} طالب", cls.room.takeIf { it.isNotBlank() }?.let { "قاعة $it" }, "وزاري".takeIf { cls.ministerial })
                    .joinToString(" • "),
                app::back,
            ) {
                IconButton(onClick = { editingClass = true }) { Icon(Icons.Filled.Edit, "تعديل الشعبة") }
            }
        },
        floatingActionButton = {
            if (tab == 0) {
                ExtendedFloatingActionButton(
                    onClick = { adding = true },
                    icon = { Icon(Icons.Filled.PersonAdd, null) },
                    text = { Text("إضافة طالب") },
                    containerColor = Gold,
                    contentColor = NavyDark,
                )
            }
        },
    ) { pad ->
        LazyColumn(
            Modifier.fillMaxSize().padding(pad),
            contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 12.dp, bottom = 96.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = { app.go(Screen.Attendance(classId)) },
                        modifier = Modifier.weight(1f).height(52.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = PresentGreen, contentColor = Color.White),
                        contentPadding = PaddingValues(horizontal = 6.dp),
                    ) {
                        Icon(Icons.Filled.HowToReg, null)
                        Spacer(Modifier.width(4.dp))
                        Text("أخذ الحضور", fontWeight = FontWeight.Bold, maxLines = 1)
                    }
                    OutlinedButton(
                        onClick = { app.go(Screen.Grades(classId)) },
                        modifier = Modifier.weight(1f).height(52.dp),
                        contentPadding = PaddingValues(horizontal = 6.dp),
                    ) {
                        Icon(Icons.Filled.Grading, null)
                        Spacer(Modifier.width(4.dp))
                        Text("إدخال الدرجات", maxLines = 1)
                    }
                }
            }
            item {
                TabRow(selectedTabIndex = tab, containerColor = CardBg, contentColor = Ink) {
                    Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("الطلاب") })
                    Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("الدرجات") })
                    Tab(selected = tab == 2, onClick = { tab = 2 }, text = { Text("التقرير") })
                }
            }
            when (tab) {
                0 -> {
                    item {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            OutlinedTextField(
                                value = search,
                                onValueChange = { search = it },
                                modifier = Modifier.weight(1f),
                                placeholder = { Text("بحث في الشعبة") },
                                leadingIcon = { Icon(Icons.Filled.Search, null) },
                                trailingIcon = { if (search.isNotEmpty()) IconButton(onClick = { search = "" }) { Icon(Icons.Filled.Clear, "مسح") } },
                                singleLine = true,
                                shape = RoundedCornerShape(14.dp),
                            )
                            IconButton(onClick = { app.go(Screen.Import(classId)) }) { Icon(Icons.Filled.UploadFile, "استيراد", tint = Ink) }
                        }
                    }
                    if (students.isEmpty()) {
                        item {
                            EmptyState(Icons.Filled.Groups, if (search.isBlank()) "لا يوجد طلاب في هذه الشعبة" else "لا توجد نتائج") {
                                if (search.isBlank()) Button(onClick = { app.go(Screen.Import(classId)) }) { Text("استيراد الطلاب") }
                            }
                        }
                    }
                    items(students, key = { it.id }) { s ->
                        StudentCard(app, s, showClass = false, onEdit = { editingStudent = s }, onDelete = { deletingStudent = s })
                    }
                }
                1 -> {
                    item {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(onClick = {
                                export = "الكشف الشامل ${cls.title}" to { Reports.classSheetDoc(app.db, school, cls) }
                            }, modifier = Modifier.weight(1f)) {
                                Icon(Icons.Filled.TableView, null)
                                Spacer(Modifier.width(4.dp))
                                Text("تصدير الكشف الشامل", maxLines = 1)
                            }
                        }
                    }
                    if (subjects.isEmpty()) {
                        item {
                            EmptyState(Icons.Filled.Grading, "لم تُضف مواد دراسية") {
                                Button(onClick = { app.go(Screen.Subjects) }) { Text("إضافة المواد") }
                            }
                        }
                    }
                    val all = app.db.students(sid, classId, search)
                    if (subjects.isNotEmpty()) item { SearchField(search, { search = it }) }
                    if (subjects.isNotEmpty() && all.isEmpty() && search.isNotBlank()) item { NoSearchResults(search) }
                    if (subjects.isNotEmpty()) items(all, key = { it.id }) { s ->
                        GradeSummaryCard(school, s, subjects.map { sub -> sub.name to Reports.result(grades[sub.id], s.id, school, cls) }) {
                            app.go(Screen.StudentDetail(s.id))
                        }
                    }
                }
                else -> {
                    item {
                        OptionChips(periods.indices.toList() + periods.size, rangeIndex, {
                            if (it < periods.size) periods[it].label else "فترة مخصصة"
                        }, Modifier.padding(vertical = 2.dp)) {
                            if (it == periods.size) pickRange = true else rangeIndex = it
                        }
                        Text(Periods.describe(range), style = MaterialTheme.typography.labelMedium, color = Muted, modifier = Modifier.padding(4.dp))
                    }
                    item { ClassReportSummary(stats, totals.values.sumOf { it.points }) }
                    item {
                        Button(
                            onClick = { export = "تقرير ${cls.title} — ${range.label}" to { Reports.classReportDoc(app.db, school, cls, range) } },
                            modifier = Modifier.fillMaxWidth().height(50.dp),
                        ) {
                            Icon(Icons.Filled.PictureAsPdf, null)
                            Spacer(Modifier.width(6.dp))
                            Text("تصدير تقرير الصف (${range.label})", fontWeight = FontWeight.Bold)
                        }
                        Text(
                            "اضغط على أي طالب لإصدار تقريره الفردي لنفس الفترة",
                            style = MaterialTheme.typography.labelSmall,
                            color = Muted,
                            modifier = Modifier.padding(top = 6.dp),
                        )
                    }
                    item { SearchField(search, { search = it }) }
                    val shownStats = stats.filter { NameSearch.matches(it.student.name, search, it.student.phone) }
                    if (shownStats.isEmpty() && search.isNotBlank()) item { NoSearchResults(search) }
                    items(shownStats, key = { it.student.id }) { st ->
                        StudentPeriodRow(st, totals[st.student.id]?.points ?: 0) { reportFor = st.student }
                    }
                }
            }
        }
    }

    if (adding || editingStudent != null) {
        StudentDialog(app.db.classes(sid), editingStudent, classId, onDismiss = { adding = false; editingStudent = null }) { name, phone, cid ->
            val e = editingStudent
            if (e == null) app.db.addStudent(sid, cid, name, phone) else app.db.updateStudent(e.id, cid, name, phone)
            app.changed()
        }
    }
    deletingStudent?.let { s ->
        ConfirmDialog("حذف طالب", "هل تريد حذف الطالب ${s.name} وكل سجلاته ودرجاته؟", "حذف", danger = true, onDismiss = { deletingStudent = null }) {
            app.guard { app.db.deleteStudent(s.id); app.changed() }
        }
    }
    if (editingClass) {
        ClassDialog(cls, school.stage, "تعديل الشعبة", onDismiss = { editingClass = false }) { name, section, room, ministerial ->
            app.db.updateClass(cls.copy(name = name, section = section, room = room, ministerial = ministerial))
            app.changed()
        }
    }
    if (pickRange) {
        val state = rememberDateRangePickerState()
        DatePickerDialog(
            onDismissRequest = { pickRange = false },
            confirmButton = {
                TextButton(enabled = state.selectedStartDateMillis != null, onClick = {
                    val from = state.selectedStartDateMillis!!
                    customFrom = Dates.fromUtcMillis(from)
                    customTo = Dates.fromUtcMillis(state.selectedEndDateMillis ?: from)
                    rangeIndex = periods.size
                    pickRange = false
                }) { Text("تم") }
            },
            dismissButton = { TextButton(onClick = { pickRange = false }) { Text("إلغاء") } },
        ) { DateRangePicker(state, modifier = Modifier.height(480.dp)) }
    }
    reportFor?.let { s ->
        StudentReportDialog(app, school, cls, s, range, onDismiss = { reportFor = null })
    }
    pdf?.let { (file, title) -> PdfDialog(app, file, title, pdfPhone, onDismiss = { pdf = null; pdfPhone = null }) }
    export?.let { (title, doc) -> ExportDialog(app, school, title, onDismiss = { export = null }, doc = doc) }
}

@Composable
private fun GradeSummaryCard(school: School, s: Student, results: List<Pair<String, com.hayalnaft.attendance.data.GradeResult>>, onClick: () -> Unit) {
    val pass = Grades.roundUp(school.maxMark / 2.0)
    val marks = results.mapNotNull { (_, r) -> r.finalGrade ?: r.annual }
    val avg = if (marks.isEmpty()) null else Grades.roundUp(marks.sum().toDouble() / marks.size)
    Card(onClick = onClick, colors = CardDefaults.cardColors(containerColor = CardBg), shape = RoundedCornerShape(14.dp)) {
        Column(Modifier.fillMaxWidth().padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(s.name, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (avg != null) Tag("المعدل $avg", if (avg >= pass) PresentGreen else AbsentRed)
            }
            Spacer(Modifier.height(6.dp))
            val shown = results.filter { (_, r) -> (r.finalGrade ?: r.annual ?: r.semester1) != null }
            if (shown.isEmpty()) {
                Text("لا توجد درجات بعد", color = Muted, style = MaterialTheme.typography.bodySmall)
            } else {
                androidx.compose.foundation.layout.FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    shown.forEach { (name, r) ->
                        val g = r.finalGrade ?: r.annual ?: r.semester1!!
                        Tag(
                            "$name: $g" + if (r.exempt) " ★" else "",
                            when {
                                r.exempt -> LateOrange
                                g < pass -> AbsentRed
                                else -> Ink
                            },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ClassReportSummary(stats: List<StudentStats>, points: Int) {
    val recorded = stats.sumOf { it.recorded }
    val rate = if (recorded == 0) null else Math.round(stats.sumOf { it.present + it.late + it.excused } * 100f / recorded)
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        SummaryTile("نسبة الحضور", rate?.let { "$it%" } ?: "-", rateColor(rate), Modifier.weight(1f))
        SummaryTile("الغيابات", "${stats.sumOf { it.absent }}", AbsentRed, Modifier.weight(1f))
        SummaryTile("التأخر", "${stats.sumOf { it.late }}", LateOrange, Modifier.weight(1f))
        SummaryTile("النقاط", "$points", Color(0xFFB07A00), Modifier.weight(1f))
    }
}

@Composable
private fun SummaryTile(label: String, value: String, color: Color, modifier: Modifier) {
    Card(modifier = modifier, colors = CardDefaults.cardColors(containerColor = color.copy(alpha = 0.12f)), shape = RoundedCornerShape(14.dp)) {
        Column(Modifier.fillMaxWidth().padding(vertical = 10.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(value, color = color, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleLarge)
            Text(label, color = Muted, style = MaterialTheme.typography.labelSmall)
        }
    }
}

fun rateColor(rate: Int?): Color = when {
    rate == null -> Color(0xFF9AA5B1)
    rate >= 90 -> PresentGreen
    rate >= 75 -> LateOrange
    else -> AbsentRed
}

@Composable
private fun StudentPeriodRow(st: StudentStats, points: Int, onClick: () -> Unit) {
    Card(onClick = onClick, colors = CardDefaults.cardColors(containerColor = CardBg), shape = RoundedCornerShape(14.dp)) {
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Avatar(st.student.name, rateColor(st.attendanceRate))
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(st.student.name, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.padding(top = 4.dp)) {
                    if (st.absent > 0) Tag("غياب ${st.absent}", AbsentRed)
                    if (st.late > 0) Tag("تأخر ${st.late}", LateOrange)
                    if (points > 0) Tag("نقاط $points", Color(0xFFB07A00))
                }
            }
            Text(
                st.attendanceRate?.let { "$it%" } ?: "-",
                color = rateColor(st.attendanceRate),
                fontWeight = FontWeight.Bold,
                style = MaterialTheme.typography.titleMedium,
            )
            Icon(Icons.Filled.Description, null, tint = Muted, modifier = Modifier.padding(start = 8.dp).size(20.dp))
        }
    }
}

/** Individual report of one student for a period, as PDF, Word, Excel or a WhatsApp message to the parent. */
@Composable
fun StudentReportDialog(
    app: AppState,
    school: School,
    cls: SchoolClass,
    student: Student,
    range: DateRange,
    onDismiss: () -> Unit,
) {
    val st = remember(student.id, range) { app.db.studentStats(student.id, range) }
    val t = remember(student.id, range) { app.db.eventTotals(student.id, range) }
    ExportDialog(
        app, school, "تقرير ${student.name}",
        parentPhone = student.phone,
        whatsappText = { Reports.studentText(app.db, school, cls, student, range) },
        summary = {
            Text(Periods.describe(range), style = MaterialTheme.typography.bodySmall, color = Muted)
            androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Tag("الحضور ${st?.attendanceRate?.let { "$it%" } ?: "-"}", rateColor(st?.attendanceRate))
                Tag("غياب ${st?.absent ?: 0}", AbsentRed)
                Tag("تأخر ${st?.late ?: 0}", LateOrange)
                Tag("نقاط ${t.points}", Color(0xFFB07A00))
                Tag("جيد ${t.good} / مشاغب ${t.bad}", Ink)
            }
        },
        onDismiss = onDismiss,
    ) { Reports.studentReportDoc(app.db, school, cls, student, range) }
}
