@file:OptIn(ExperimentalMaterial3Api::class)

package com.hayalnaft.attendance.ui

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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.FileDownload
import androidx.compose.material.icons.filled.SentimentSatisfied
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
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
import com.hayalnaft.attendance.data.Status
import com.hayalnaft.attendance.data.StudentStats
import com.hayalnaft.attendance.util.Dates

@Composable
fun ReportsScreen(app: AppState) {
    val ctx = LocalContext.current
    val v = app.version
    val sid = app.schoolId
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var date by rememberSaveable { mutableStateOf(Dates.today()) }
    var showDate by remember { mutableStateOf(false) }
    var monthOnly by rememberSaveable { mutableStateOf(true) }
    var classId by rememberSaveable { mutableStateOf<Long?>(null) }
    val classes = remember(v, sid) { app.db.classes(sid) }
    val cls = classes.firstOrNull { it.id == classId }

    val day = remember(v, sid, date) { app.db.dayList(sid, date) }
    val stats = remember(v, sid, cls?.id, monthOnly) { app.db.stats(sid, cls?.id, if (monthOnly) Dates.monthStart() else null) }

    val exporter = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/csv")) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        val ok = runCatching {
            ctx.contentResolver.openOutputStream(uri, "w")!!.use { it.write(statsCsv(stats).toByteArray(Charsets.UTF_8)) }
        }.isSuccess
        app.toast(if (ok) "تم حفظ التقرير، يمكن فتحه ببرنامج Excel" else "تعذر حفظ التقرير")
    }

    Scaffold(
        topBar = {
            AppTopBar("التقارير", app.schoolName(), app::back) {
                if (tab == 0) {
                    IconButton(onClick = { showDate = true }) { Icon(Icons.Filled.CalendarMonth, "اختيار التاريخ") }
                } else {
                    IconButton(onClick = { exporter.launch("تقرير-الغياب-${Dates.today()}.csv") }) {
                        Icon(Icons.Filled.FileDownload, "تصدير إلى Excel")
                    }
                }
            }
        },
    ) { pad ->
        Column(Modifier.fillMaxSize().padding(pad)) {
            TabRow(selectedTabIndex = tab, containerColor = Color.White, contentColor = Navy) {
                Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("غيابات يوم") })
                Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("إحصائيات الطلاب") })
            }
            if (tab == 0) {
                Row(Modifier.padding(12.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(Dates.pretty(date), fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    CountBadge("غائب", day.count { it.status == Status.ABSENT }, AbsentRed)
                    CountBadge("متأخر", day.count { it.status == Status.LATE }, LateOrange)
                    CountBadge("مُجاز", day.count { it.status == Status.EXCUSED }, ExcusedBlue)
                }
                if (day.isEmpty()) {
                    EmptyState(Icons.Filled.SentimentSatisfied, "لا توجد غيابات في هذا اليوم", "أو لم يتم تسجيل الحضور بعد")
                } else {
                    LazyColumn(
                        contentPadding = PaddingValues(start = 12.dp, end = 12.dp, bottom = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        items(day, key = { it.student.id }) { r ->
                            Card(
                                onClick = { app.go(Screen.StudentDetail(r.student.id)) },
                                colors = CardDefaults.cardColors(containerColor = Color.White),
                                shape = RoundedCornerShape(14.dp),
                            ) {
                                Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Avatar(r.student.name, StatusUi.color(r.status))
                                    Spacer(Modifier.width(10.dp))
                                    Column(Modifier.weight(1f)) {
                                        Text(r.student.name, fontWeight = FontWeight.Bold)
                                        Text(r.student.className, style = MaterialTheme.typography.bodySmall, color = Color.Gray)
                                    }
                                    Column(horizontalAlignment = Alignment.End) {
                                        Tag(StatusUi.label(r.status), StatusUi.color(r.status))
                                        if (r.notified) {
                                            Text("تم التبليغ", style = MaterialTheme.typography.labelSmall, color = PresentGreen)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            } else {
                Spacer(Modifier.height(10.dp))
                Row(Modifier.padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(selected = monthOnly, onClick = { monthOnly = true }, label = { Text("هذا الشهر") }, colors = chipColors())
                    FilterChip(selected = !monthOnly, onClick = { monthOnly = false }, label = { Text("كل الفترة") }, colors = chipColors())
                }
                Spacer(Modifier.height(6.dp))
                ClassChips(classes, cls?.id, { classId = it }, allLabel = "كل الصفوف")
                LazyColumn(
                    contentPadding = PaddingValues(12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(stats, key = { it.student.id }) { s -> StatsCard(s) { app.go(Screen.StudentDetail(s.student.id)) } }
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
}

@Composable
private fun StatsCard(s: StudentStats, onClick: () -> Unit) {
    Card(onClick = onClick, colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(14.dp)) {
        Column(Modifier.fillMaxWidth().padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Avatar(s.student.name, if (s.absent > 0) AbsentRed else Navy)
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(s.student.name, fontWeight = FontWeight.Bold)
                    Text(s.student.className, style = MaterialTheme.typography.bodySmall, color = Color.Gray)
                }
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                CountBadge("حضور", s.present, PresentGreen)
                CountBadge("غياب", s.absent, AbsentRed)
                CountBadge("تأخر", s.late, LateOrange)
                CountBadge("إجازة", s.excused, ExcusedBlue)
            }
        }
    }
}

private fun statsCsv(stats: List<StudentStats>): String {
    fun q(s: String) = "\"" + s.replace("\"", "\"\"") + "\""
    val sb = StringBuilder("﻿")
    sb.append("ت,اسم الطالب,الصف,رقم ولي الأمر,حضور,غياب,تأخر,إجازة\r\n")
    stats.forEachIndexed { i, s ->
        sb.append(listOf("${i + 1}", q(s.student.name), q(s.student.className), q(s.student.phone),
            "${s.present}", "${s.absent}", "${s.late}", "${s.excused}").joinToString(","))
        sb.append("\r\n")
    }
    return sb.toString()
}
