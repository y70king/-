@file:OptIn(ExperimentalMaterial3Api::class)

package com.hayalnaft.attendance.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Alarm
import androidx.compose.material.icons.filled.Assessment
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.EditCalendar
import androidx.compose.material.icons.filled.Grading
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.HowToReg
import androidx.compose.material.icons.filled.LibraryBooks
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.School
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.UploadFile
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.hayalnaft.attendance.AppState
import com.hayalnaft.attendance.Screen
import com.hayalnaft.attendance.data.Status
import com.hayalnaft.attendance.util.Dates
import java.util.Calendar

@Composable
fun HomeScreen(app: AppState) {
    val v = app.version
    val sid = app.schoolId
    val today = Dates.today()
    val school = remember(v, sid) { app.db.school(sid) }
    val summary = remember(v, sid, today) { app.db.daySummary(sid, today) }
    val now = Calendar.getInstance()
    val nowMin = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE)
    // The lesson in progress or the next one today.
    val nextLesson = remember(v, sid, today) {
        app.db.periods(sid).filter { it.day == now.get(Calendar.DAY_OF_WEEK) && it.startMin + it.duration > nowMin }
            .minByOrNull { it.startMin }
    }

    Scaffold(contentWindowInsets = WindowInsets(0)) { pad ->
        Column(
            Modifier.fillMaxSize().padding(pad).verticalScroll(rememberScrollState()),
        ) {
            Box(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(bottomStart = 28.dp, bottomEnd = 28.dp))
                    .background(Brush.verticalGradient(listOf(NavyDark, Ink)))
                    .statusBarsPadding()
                    .padding(20.dp),
            ) {
                Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        SchoolLogo(app, 60.dp)
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f)) {
                            Text(
                                school?.name ?: "",
                                color = Color.White,
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold,
                            )
                            Text(
                                listOfNotNull(
                                    school?.takeIf { it.year.isNotBlank() }?.let { "العام الدراسي ${it.yearText}" },
                                    school?.shift?.let { "الدوام $it" },
                                ).joinToString(" • "),
                                color = Color.White.copy(alpha = 0.8f),
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    }
                    Spacer(Modifier.height(16.dp))
                    Surface(color = Color.White.copy(alpha = 0.12f), shape = RoundedCornerShape(10.dp)) {
                        Row(Modifier.padding(horizontal = 10.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Filled.CalendarToday, null, tint = Gold, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(6.dp))
                            Text(Dates.pretty(today), color = Color.White, style = MaterialTheme.typography.labelLarge)
                        }
                    }
                }
            }

            Row(
                Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 14.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                StatTile("الطلاب", summary[Status.NONE] ?: 0, Ink, Modifier.weight(1f))
                StatTile("حاضر", summary[Status.PRESENT] ?: 0, PresentGreen, Modifier.weight(1f))
                StatTile("غائب", summary[Status.ABSENT] ?: 0, AbsentRed, Modifier.weight(1f))
                StatTile("متأخر", summary[Status.LATE] ?: 0, LateOrange, Modifier.weight(1f))
            }

            nextLesson?.let { p ->
                Card(
                    modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, bottom = 10.dp),
                    colors = CardDefaults.cardColors(containerColor = Gold.copy(alpha = 0.18f)),
                    shape = RoundedCornerShape(18.dp),
                ) {
                    Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.Alarm, null, tint = Color(0xFF8A5A00), modifier = Modifier.size(32.dp))
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(
                                if (p.startMin <= nowMin) "الحصة الحالية" else "الحصة القادمة",
                                style = MaterialTheme.typography.labelMedium,
                                color = Color(0xFF8A5A00),
                            )
                            Text("${p.subjectName} — ${p.classTitle}", fontWeight = FontWeight.Bold)
                            Text(Dates.clock(p.startMin), style = MaterialTheme.typography.bodySmall)
                        }
                        Button(
                            onClick = { app.go(Screen.Attendance(p.classId, p.subjectId)) },
                            colors = ButtonDefaults.buttonColors(containerColor = Navy),
                        ) { Text("التعداد") }
                    }
                }
            }

            Card(
                onClick = { app.go(Screen.Attendance()) },
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                colors = CardDefaults.cardColors(containerColor = PresentGreen, contentColor = Color.White),
                shape = RoundedCornerShape(18.dp),
            ) {
                Row(Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier.size(52.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.2f)),
                        contentAlignment = Alignment.Center,
                    ) { Icon(Icons.Filled.HowToReg, null, modifier = Modifier.size(30.dp)) }
                    Spacer(Modifier.width(14.dp))
                    Column(Modifier.weight(1f)) {
                        Text("التعداد اليومي", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Text(
                            "اختر الصف والشعبة ثم سجّل الطلاب واحداً تلو الآخر",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color.White.copy(alpha = 0.85f),
                        )
                    }
                    Icon(Icons.Filled.ChevronLeft, null)
                }
            }

            Spacer(Modifier.height(12.dp))
            val tiles = listOf(
                Tile("الصفوف والشعب", "الطلاب والدرجات والتقارير", Icons.Filled.Groups, Ink) { app.go(Screen.Classes) },
                Tile("استيراد الطلاب", "Excel • Word • لصق", Icons.Filled.UploadFile, Color(0xFF00796B)) { app.go(Screen.Import(null)) },
                Tile("دفتر الدرجات", "السعي والمعدلات والإعفاء", Icons.Filled.Grading, Color(0xFF6A1B9A)) { app.go(Screen.Grades()) },
                Tile("جدول الحصص", "الجدول الأسبوعي والمنبه", Icons.Filled.EditCalendar, Color(0xFFAD1457)) { app.go(Screen.Timetable) },
                Tile("الخطة اليومية", "دفتر الخطط ونماذج جاهزة", Icons.Filled.LibraryBooks, Color(0xFF5D4037)) { app.go(Screen.Plans) },
                Tile("التبليغات", "رسائل لأولياء الأمور", Icons.Filled.Campaign, LateOrange) { app.go(Screen.Messages()) },
                Tile("التقارير", "إحصائيات الغياب", Icons.Filled.Assessment, ExcusedBlue) { app.go(Screen.Reports) },
                Tile("المواد الدراسية", "المواد التي تدرّسها", Icons.Filled.MenuBook, Color(0xFF2E7D32)) { app.go(Screen.Subjects) },
                Tile("الإعدادات", "المدرسة والأمان والنسخ", Icons.Filled.Settings, Color(0xFF546E7A)) { app.go(Screen.Settings) },
            )
            tiles.chunked(2).forEach { pair ->
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 5.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    pair.forEach { TileCard(it, Modifier.weight(1f)) }
                    if (pair.size == 1) Spacer(Modifier.weight(1f))
                }
            }

            Row(
                Modifier.fillMaxWidth().padding(20.dp).navigationBarsPadding(),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.WifiOff, null, tint = Muted, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp))
                Text(
                    "يعمل بدون إنترنت — جميع البيانات محفوظة على هاتفك",
                    color = Muted,
                    style = MaterialTheme.typography.bodySmall,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}

private class Tile(val title: String, val subtitle: String, val icon: ImageVector, val color: Color, val onClick: () -> Unit)

@Composable
private fun TileCard(t: Tile, modifier: Modifier) {
    Card(
        onClick = t.onClick,
        modifier = modifier,
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = CardBg),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column(Modifier.padding(14.dp)) {
            Box(
                Modifier.size(44.dp).clip(RoundedCornerShape(12.dp)).background(t.color.copy(alpha = 0.12f)),
                contentAlignment = Alignment.Center,
            ) { Icon(t.icon, null, tint = t.color) }
            Spacer(Modifier.height(10.dp))
            Text(t.title, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
            Text(t.subtitle, color = Muted, style = MaterialTheme.typography.bodySmall, maxLines = 1)
        }
    }
}

@Composable
private fun StatTile(label: String, value: Int, color: Color, modifier: Modifier) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = CardBg),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column(Modifier.fillMaxWidth().padding(vertical = 12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("$value", color = color, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(label, color = Muted, style = MaterialTheme.typography.labelMedium)
        }
    }
}
