@file:OptIn(ExperimentalMaterial3Api::class)

package com.hayalnaft.attendance.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.filled.Apartment
import androidx.compose.material.icons.filled.Assessment
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.HowToReg
import androidx.compose.material.icons.filled.School
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material.icons.filled.UploadFile
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
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

@Composable
fun HomeScreen(app: AppState) {
    val v = app.version
    val sid = app.schoolId
    val today = Dates.today()
    val school = remember(v, sid) { app.db.school(sid) }
    val schools = remember(v) { app.db.schools() }
    val summary = remember(v, sid, today) { app.db.daySummary(sid, today) }
    var pickSchool by remember { mutableStateOf(false) }

    Scaffold(contentWindowInsets = WindowInsets(0)) { pad ->
        Column(
            Modifier.fillMaxSize().padding(pad).verticalScroll(rememberScrollState()),
        ) {
            Box(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(bottomStart = 28.dp, bottomEnd = 28.dp))
                    .background(Brush.verticalGradient(listOf(NavyDark, Navy)))
                    .statusBarsPadding()
                    .padding(20.dp),
            ) {
                Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            Modifier.size(60.dp).clip(CircleShape).background(Gold),
                            contentAlignment = Alignment.Center,
                        ) { Icon(Icons.Filled.School, null, tint = NavyDark, modifier = Modifier.size(34.dp)) }
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f)) {
                            Text(
                                school?.name ?: "",
                                color = Color.White,
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold,
                            )
                            Text(
                                "نظام الحضور والغياب وتبليغ أولياء الأمور",
                                color = Color.White.copy(alpha = 0.8f),
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    }
                    Spacer(Modifier.height(16.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(color = Color.White.copy(alpha = 0.12f), shape = RoundedCornerShape(10.dp)) {
                            Row(Modifier.padding(horizontal = 10.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Filled.CalendarToday, null, tint = Gold, modifier = Modifier.size(16.dp))
                                Spacer(Modifier.width(6.dp))
                                Text(Dates.pretty(today), color = Color.White, style = MaterialTheme.typography.labelLarge)
                            }
                        }
                        Spacer(Modifier.weight(1f))
                        if (schools.size > 1) {
                            Surface(
                                color = Gold,
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier.clip(RoundedCornerShape(10.dp)).clickable { pickSchool = true },
                            ) {
                                Row(Modifier.padding(horizontal = 10.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Filled.SwapHoriz, null, tint = NavyDark, modifier = Modifier.size(16.dp))
                                    Spacer(Modifier.width(4.dp))
                                    Text("تبديل المدرسة", color = NavyDark, style = MaterialTheme.typography.labelLarge)
                                }
                            }
                        }
                    }
                }
            }

            Row(
                Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 14.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                StatTile("الطلاب", summary[Status.NONE] ?: 0, Navy, Modifier.weight(1f))
                StatTile("حاضر", summary[Status.PRESENT] ?: 0, PresentGreen, Modifier.weight(1f))
                StatTile("غائب", summary[Status.ABSENT] ?: 0, AbsentRed, Modifier.weight(1f))
                StatTile("متأخر", summary[Status.LATE] ?: 0, LateOrange, Modifier.weight(1f))
            }

            Card(
                onClick = { app.go(Screen.Attendance) },
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
                        Text("تسجيل الحضور والغياب", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Text(
                            "بنقرة زر واحدة مع تبليغ فوري لولي الأمر",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color.White.copy(alpha = 0.85f),
                        )
                    }
                    Icon(Icons.Filled.ChevronLeft, null)
                }
            }

            Spacer(Modifier.height(12.dp))
            val tiles = listOf(
                Tile("الطلاب والصفوف", "إضافة وتعديل الطلاب", Icons.Filled.Groups, Navy) { app.go(Screen.Students) },
                Tile("استيراد الطلاب", "Excel • Word • لصق", Icons.Filled.UploadFile, Color(0xFF00796B)) { app.go(Screen.Import(null)) },
                Tile("التبليغات", "رسائل لأولياء الأمور", Icons.Filled.Campaign, LateOrange) { app.go(Screen.Messages()) },
                Tile("التقارير", "إحصائيات الغياب", Icons.Filled.Assessment, ExcusedBlue) { app.go(Screen.Reports) },
                Tile("المدارس", "إدارة أكثر من مدرسة", Icons.Filled.Apartment, Color(0xFF6A1B9A)) { app.go(Screen.Schools) },
                Tile("الإعدادات", "الرسائل والنسخ الاحتياطي", Icons.Filled.Settings, Color(0xFF546E7A)) { app.go(Screen.Settings) },
            )
            tiles.chunked(2).forEach { pair ->
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 5.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    pair.forEach { TileCard(it, Modifier.weight(1f)) }
                }
            }

            Row(
                Modifier.fillMaxWidth().padding(20.dp).navigationBarsPadding(),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.WifiOff, null, tint = Color.Gray, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp))
                Text(
                    "يعمل بدون إنترنت — جميع البيانات محفوظة على هاتفك",
                    color = Color.Gray,
                    style = MaterialTheme.typography.bodySmall,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }

    if (pickSchool) {
        AlertDialog(
            onDismissRequest = { pickSchool = false },
            title = { Text("اختر المدرسة") },
            text = {
                Column {
                    schools.forEach { s ->
                        Row(
                            Modifier.fillMaxWidth().clickable { app.selectSchool(s.id); pickSchool = false }.padding(vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            RadioButton(selected = s.id == sid, onClick = { app.selectSchool(s.id); pickSchool = false })
                            Column {
                                Text(s.name, fontWeight = FontWeight.Bold)
                                Text("${s.studentCount} طالب", style = MaterialTheme.typography.bodySmall, color = Color.Gray)
                            }
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { pickSchool = false }) { Text("إغلاق") } },
        )
    }
}

private class Tile(val title: String, val subtitle: String, val icon: ImageVector, val color: Color, val onClick: () -> Unit)

@Composable
private fun TileCard(t: Tile, modifier: Modifier) {
    Card(
        onClick = t.onClick,
        modifier = modifier,
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column(Modifier.padding(14.dp)) {
            Box(
                Modifier.size(44.dp).clip(RoundedCornerShape(12.dp)).background(t.color.copy(alpha = 0.12f)),
                contentAlignment = Alignment.Center,
            ) { Icon(t.icon, null, tint = t.color) }
            Spacer(Modifier.height(10.dp))
            Text(t.title, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
            Text(t.subtitle, color = Color.Gray, style = MaterialTheme.typography.bodySmall, maxLines = 1)
        }
    }
}

@Composable
private fun StatTile(label: String, value: Int, color: Color, modifier: Modifier) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column(Modifier.fillMaxWidth().padding(vertical = 12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("$value", color = color, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(label, color = Color.Gray, style = MaterialTheme.typography.labelMedium)
        }
    }
}
