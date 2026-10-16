@file:OptIn(ExperimentalMaterial3Api::class)

package com.hayalnaft.attendance.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Backup
import androidx.compose.material.icons.filled.Restore
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.hayalnaft.attendance.AppState
import com.hayalnaft.attendance.util.Dates
import com.hayalnaft.attendance.util.Prefs

@Composable
fun SettingsScreen(app: AppState) {
    val prefs = app.prefs
    var autoSend by remember { mutableStateOf(prefs.autoSend) }
    var notifyLate by remember { mutableStateOf(prefs.notifyLate) }
    var absentTpl by remember { mutableStateOf(prefs.absentTemplate) }
    var lateTpl by remember { mutableStateOf(prefs.lateTemplate) }
    var cc by remember { mutableStateOf(prefs.countryCode) }
    var confirmRestore by remember { mutableStateOf<android.net.Uri?>(null) }

    val backup = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/octet-stream")) { uri ->
        if (uri != null) app.toast(if (app.backup(uri)) "تم حفظ النسخة الاحتياطية بنجاح" else "تعذر حفظ النسخة الاحتياطية")
    }
    val restore = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) confirmRestore = uri
    }

    Scaffold(topBar = { AppTopBar("الإعدادات", onBack = app::back) }) { pad ->
        Column(
            Modifier.fillMaxSize().padding(pad).verticalScroll(rememberScrollState()).padding(12.dp).navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            SettingsCard("التبليغ الفوري") {
                SwitchRow(
                    "إرسال رسالة لولي الأمر فور تسجيل الغياب",
                    "عند الضغط على «غائب» تُرسل رسالة SMS مباشرة. عند الإيقاف يظهر زر لإرسال التبليغات دفعة واحدة",
                    autoSend,
                ) { autoSend = it; prefs.autoSend = it }
                SwitchRow("تبليغ ولي الأمر عند التأخر أيضاً", null, notifyLate) { notifyLate = it; prefs.notifyLate = it }
            }

            SettingsCard("نص رسالة الغياب") {
                OutlinedTextField(
                    value = absentTpl,
                    onValueChange = { absentTpl = it; prefs.absentTemplate = it },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 3,
                    shape = RoundedCornerShape(12.dp),
                )
                TextButton(onClick = { absentTpl = Prefs.DEFAULT_ABSENT; prefs.absentTemplate = Prefs.DEFAULT_ABSENT }) {
                    Text("استعادة النص الافتراضي")
                }
            }

            SettingsCard("نص رسالة التأخر") {
                OutlinedTextField(
                    value = lateTpl,
                    onValueChange = { lateTpl = it; prefs.lateTemplate = it },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 3,
                    shape = RoundedCornerShape(12.dp),
                )
                TextButton(onClick = { lateTpl = Prefs.DEFAULT_LATE; prefs.lateTemplate = Prefs.DEFAULT_LATE }) {
                    Text("استعادة النص الافتراضي")
                }
                Text(
                    "الكلمات التالية تُستبدل تلقائياً: {الطالب} {الصف} {المدرسة} {اليوم} {التاريخ}",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.Gray,
                )
            }

            SettingsCard("واتساب") {
                OutlinedTextField(
                    value = cc,
                    onValueChange = { v -> cc = v.filter { it.isDigit() }; prefs.countryCode = cc },
                    label = { Text("رمز الدولة (العراق 964)") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            SettingsCard("النسخ الاحتياطي") {
                Text(
                    "احفظ نسخة من جميع البيانات (المدارس والطلاب والحضور) في ملف، لتنقلها إلى هاتف آخر أو تسترجعها عند الحاجة.",
                    style = MaterialTheme.typography.bodySmall,
                )
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { backup.launch("نسخة-حضور-حي-النفط-${Dates.today()}.db") }, modifier = Modifier.weight(1f)) {
                        Icon(Icons.Filled.Backup, null)
                        Spacer(Modifier.width(6.dp))
                        Text("حفظ نسخة")
                    }
                    OutlinedButton(onClick = { restore.launch(arrayOf("*/*")) }, modifier = Modifier.weight(1f)) {
                        Icon(Icons.Filled.Restore, null)
                        Spacer(Modifier.width(6.dp))
                        Text("استرجاع")
                    }
                }
            }

            SettingsCard("حول التطبيق") {
                Text("تطبيق الحضور والغياب — ثانوية حي النفط للبنين", fontWeight = FontWeight.Bold)
                Text("الإصدار 1.0 • يعمل بدون إنترنت • الرسائل تُرسل عبر SMS من شريحة الهاتف", style = MaterialTheme.typography.bodySmall, color = Color.Gray)
            }
        }
    }

    confirmRestore?.let { uri ->
        ConfirmDialog(
            "استرجاع نسخة احتياطية",
            "سيتم استبدال جميع البيانات الحالية بالبيانات الموجودة في النسخة الاحتياطية. هل تريد المتابعة؟",
            "استرجاع",
            danger = true,
            onDismiss = { confirmRestore = null },
        ) {
            val err = app.restore(uri)
            app.toast(err ?: "تم استرجاع البيانات بنجاح")
        }
    }
}

@Composable
private fun SettingsCard(title: String, content: @Composable () -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) {
        Column(Modifier.fillMaxWidth().padding(14.dp)) {
            Text(title, fontWeight = FontWeight.Bold, color = Navy, style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.height(8.dp))
            content()
        }
    }
}

@Composable
private fun SwitchRow(title: String, subtitle: String?, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title)
            if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = Color.Gray)
        }
        Spacer(Modifier.width(8.dp))
        Switch(checked = checked, onCheckedChange = onChange)
    }
}
