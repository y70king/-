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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.LibraryBooks
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material.icons.filled.Save
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.hayalnaft.attendance.AppState
import com.hayalnaft.attendance.Screen
import com.hayalnaft.attendance.data.LessonPlan
import com.hayalnaft.attendance.util.Dates
import com.hayalnaft.attendance.util.LessonTemplates
import com.hayalnaft.attendance.util.PlanTemplate
import com.hayalnaft.attendance.util.Reports
import java.io.File

@Composable
fun PlansScreen(app: AppState) {
    val v = app.version
    val sid = app.schoolId
    val plans = remember(v, sid) { app.db.plans(sid) }
    Scaffold(
        topBar = { AppTopBar("دفتر الخطة اليومية", "${plans.size} خطة", app::back) },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { app.go(Screen.PlanEditor(null)) },
                icon = { Icon(Icons.Filled.Add, null) },
                text = { Text("خطة جديدة") },
                containerColor = Gold,
                contentColor = NavyDark,
            )
        },
    ) { pad ->
        LazyColumn(
            Modifier.fillMaxSize().padding(pad),
            contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 12.dp, bottom = 96.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (plans.isEmpty()) {
                item {
                    EmptyState(Icons.Filled.LibraryBooks, "لا توجد خطط بعد", "أنشئ خطة الدرس اليومية، ويمكنك البدء من نموذج جاهز وفق المنهج العراقي")
                }
            }
            items(plans, key = { it.id }) { p ->
                Card(
                    onClick = { app.go(Screen.PlanEditor(p.id)) },
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    shape = RoundedCornerShape(14.dp),
                ) {
                    Column(Modifier.fillMaxWidth().padding(14.dp)) {
                        Text(p.title.ifBlank { "بدون عنوان" }, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(
                            listOf(Dates.pretty(p.date), p.subjectName, p.classTitle).filter { it.isNotBlank() }.joinToString(" • "),
                            style = MaterialTheme.typography.bodySmall,
                            color = Color.Gray,
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun PlanEditorScreen(app: AppState, planId: Long?) {
    val ctx = LocalContext.current
    val v = app.version
    val sid = app.schoolId
    val classes = remember(v, sid) { app.db.classes(sid) }
    val subjects = remember(v, sid) { app.db.subjects(sid) }
    val existing = remember(planId) { planId?.let { app.db.plan(it) } }
    var id by rememberSaveable { mutableStateOf(planId ?: 0L) }
    var date by rememberSaveable { mutableStateOf(existing?.date ?: Dates.today()) }
    var classId by rememberSaveable { mutableStateOf(existing?.classId) }
    var subjectId by rememberSaveable { mutableStateOf(existing?.subjectId) }
    var title by rememberSaveable { mutableStateOf(existing?.title ?: "") }
    var cognitive by rememberSaveable { mutableStateOf(existing?.cognitive ?: "") }
    var affective by rememberSaveable { mutableStateOf(existing?.affective ?: "") }
    var psychomotor by rememberSaveable { mutableStateOf(existing?.psychomotor ?: "") }
    var aids by rememberSaveable { mutableStateOf(existing?.aids ?: "") }
    var steps by rememberSaveable { mutableStateOf(existing?.steps ?: "") }
    var homework by rememberSaveable { mutableStateOf(existing?.homework ?: "") }
    var notes by rememberSaveable { mutableStateOf(existing?.notes ?: "") }
    var templates by remember { mutableStateOf(false) }
    var showDate by remember { mutableStateOf(false) }
    var pdf by remember { mutableStateOf<Pair<File, String>?>(null) }

    fun current() = LessonPlan(
        id = id, schoolId = sid, date = date, classId = classId, subjectId = subjectId, title = title.trim(),
        cognitive = cognitive.trim(), affective = affective.trim(), psychomotor = psychomotor.trim(), aids = aids.trim(),
        steps = steps.trim(), homework = homework.trim(), notes = notes.trim(),
    )

    fun save(): LessonPlan {
        id = app.db.savePlan(current())
        app.changed()
        return app.db.plan(id)!!
    }

    fun apply(t: PlanTemplate) {
        if (title.isBlank()) title = t.title
        cognitive = t.cognitive
        affective = t.affective
        psychomotor = t.psychomotor
        aids = t.aids
        steps = t.steps
        homework = t.homework
        if (subjectId == null) subjectId = subjects.firstOrNull { t.name.contains(it.name) }?.id
    }

    Scaffold(
        topBar = {
            AppTopBar(if (id == 0L) "خطة جديدة" else "تعديل الخطة", Dates.pretty(date), app::back) {
                IconButton(onClick = { templates = true }) { Icon(Icons.Filled.AutoAwesome, "نموذج جاهز") }
                IconButton(onClick = {
                    val p = save()
                    val school = app.db.school(sid) ?: return@IconButton
                    pdf = Reports.lessonPlan(ctx, school, p) to "الخطة اليومية"
                }) { Icon(Icons.Filled.PictureAsPdf, "PDF") }
                if (id != 0L) {
                    IconButton(onClick = {
                        app.guard {
                            app.db.deletePlan(id)
                            app.changed()
                            app.back()
                        }
                    }) { Icon(Icons.Filled.Delete, "حذف") }
                }
            }
        },
        bottomBar = {
            Row(
                Modifier.fillMaxWidth().navigationBarsPadding().padding(12.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Button(onClick = {
                    save()
                    app.toast("تم حفظ الخطة")
                    app.back()
                }, modifier = Modifier.weight(1f).height(50.dp)) {
                    Icon(Icons.Filled.Save, null)
                    Spacer(Modifier.width(6.dp))
                    Text("حفظ الخطة", fontWeight = FontWeight.Bold)
                }
                if (id != 0L) {
                    OutlinedButton(onClick = {
                        id = 0L
                        date = Dates.today()
                        app.toast("نسخة جديدة من الخطة — عدّل ثم احفظ")
                    }, modifier = Modifier.height(50.dp)) {
                        Icon(Icons.Filled.ContentCopy, null)
                        Spacer(Modifier.width(4.dp))
                        Text("نسخ")
                    }
                }
            }
        },
    ) { pad ->
        Column(
            Modifier.fillMaxSize().padding(pad).verticalScroll(rememberScrollState()).padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (id == 0L && cognitive.isBlank()) {
                Card(
                    onClick = { templates = true },
                    colors = CardDefaults.cardColors(containerColor = Gold.copy(alpha = 0.15f)),
                ) {
                    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.AutoAwesome, null, tint = Color(0xFF8A5A00))
                        Spacer(Modifier.width(8.dp))
                        Text("ابدأ من نموذج خطة جاهز وفق المنهج العراقي", fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    }
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("التاريخ", fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                OutlinedButton(onClick = { showDate = true }) {
                    Icon(Icons.Filled.CalendarMonth, null)
                    Spacer(Modifier.width(6.dp))
                    Text(Dates.pretty(date))
                }
            }
            if (subjects.isNotEmpty()) {
                Text("المادة", fontWeight = FontWeight.Bold)
                OptionChips(subjects.map { it.id }, subjectId, { sid2 -> subjects.first { it.id == sid2 }.name }) { subjectId = it }
            }
            if (classes.isNotEmpty()) {
                Text("الصف والشعبة", fontWeight = FontWeight.Bold)
                OptionChips(classes.map { it.id }, classId, { cid -> classes.first { it.id == cid }.title }) { classId = it }
            }
            PlanField("عنوان الموضوع", title, 1) { title = it }
            PlanField("الأهداف المعرفية", cognitive, 3) { cognitive = it }
            PlanField("الأهداف الوجدانية", affective, 2) { affective = it }
            PlanField("الأهداف المهارية (النفسحركية)", psychomotor, 2) { psychomotor = it }
            PlanField("الوسائل التعليمية", aids, 2) { aids = it }
            PlanField("خطوات سير الدرس", steps, 8) { steps = it }
            PlanField("الواجب البيتي", homework, 2) { homework = it }
            PlanField("ملاحظات", notes, 2) { notes = it }
            Spacer(Modifier.height(20.dp))
        }
    }

    if (templates) {
        AlertDialog(
            onDismissRequest = { templates = false },
            title = { Text("نماذج خطط جاهزة") },
            text = {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(LessonTemplates.all) { t ->
                        Card(
                            onClick = {
                                apply(t)
                                templates = false
                            },
                            colors = CardDefaults.cardColors(containerColor = Color(0xFFF1F4F8)),
                        ) {
                            Text(t.name, modifier = Modifier.fillMaxWidth().padding(12.dp), fontWeight = FontWeight.Bold)
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { templates = false }) { Text("إغلاق") } },
        )
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
    pdf?.let { (file, t) -> PdfDialog(app, file, t, onDismiss = { pdf = null }) }
}

@Composable
private fun PlanField(label: String, value: String, minLines: Int, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        minLines = minLines,
        singleLine = minLines == 1,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
    )
}
