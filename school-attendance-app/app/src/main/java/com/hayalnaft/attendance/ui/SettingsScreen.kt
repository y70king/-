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
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material.icons.filled.Restore
import androidx.compose.material3.AlertDialog
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
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.hayalnaft.attendance.AppState
import com.hayalnaft.attendance.data.Shifts
import com.hayalnaft.attendance.data.Stages
import com.hayalnaft.attendance.util.Dates
import com.hayalnaft.attendance.util.Prefs

@Composable
fun SettingsScreen(app: AppState) {
    val prefs = app.prefs
    val school = remember(app.version, app.schoolId) { app.db.school(app.schoolId) }
    var autoSend by remember { mutableStateOf(prefs.autoSend) }
    var notifyLate by remember { mutableStateOf(prefs.notifyLate) }
    var channel by remember { mutableStateOf(prefs.channel) }
    var absentTpl by remember { mutableStateOf(prefs.absentTemplate) }
    var lateTpl by remember { mutableStateOf(prefs.lateTemplate) }
    var cc by remember { mutableStateOf(prefs.countryCode) }
    var hasPin by remember { mutableStateOf(prefs.pin.isNotBlank()) }
    var setPin by remember { mutableStateOf(false) }
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
            if (school != null) {
                SettingsCard("بيانات المدرسة") {
                    Text(school.name, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(8.dp))
                    Text("المرحلة", style = MaterialTheme.typography.labelLarge)
                    OptionChips(Stages.all, school.stage, { it }) { app.db.updateSchool(school.copy(stage = it)); app.changed() }
                    Spacer(Modifier.height(6.dp))
                    Text("الدوام", style = MaterialTheme.typography.labelLarge)
                    OptionChips(Shifts.all, school.shift, { it }) { app.db.updateSchool(school.copy(shift = it)); app.changed() }
                    Spacer(Modifier.height(6.dp))
                    SchoolField("العام الدراسي", school.year) { app.db.updateSchool(school.copy(year = it)); app.changed() }
                    SchoolField("المديرية العامة للتربية في (مثال: البصرة)", school.directorate) {
                        app.db.updateSchool(school.copy(directorate = it)); app.changed()
                    }
                    SchoolField("اسم مدير المدرسة", school.principal) { app.db.updateSchool(school.copy(principal = it)); app.changed() }
                    SchoolField("اسم المدرس / المعلم", school.teacher) { app.db.updateSchool(school.copy(teacher = it)); app.changed() }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        SchoolField("الدرجة العظمى", school.maxMark.toString(), Modifier.weight(1f), number = true) {
                            it.toIntOrNull()?.takeIf { m -> m > 0 }?.let { m -> app.db.updateSchool(school.copy(maxMark = m)); app.changed() }
                        }
                        SchoolField("درجة الإعفاء", school.exemptMark.toString(), Modifier.weight(1f), number = true) {
                            it.toIntOrNull()?.takeIf { m -> m > 0 }?.let { m -> app.db.updateSchool(school.copy(exemptMark = m)); app.changed() }
                        }
                    }
                    Text(
                        "للمرحلة الابتدائية التي تكون درجتها من 10: اجعل الدرجة العظمى 10 ودرجة الإعفاء 9.",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.Gray,
                    )
                }
            }

            SettingsCard("تبليغ أولياء الأمور") {
                Text("طريقة الإرسال", style = MaterialTheme.typography.labelLarge)
                OptionChips(
                    listOf(Prefs.CHANNEL_SMS, Prefs.CHANNEL_WHATSAPP), channel,
                    { if (it == Prefs.CHANNEL_SMS) "رسالة SMS (بدون إنترنت)" else "واتساب" },
                ) { channel = it; prefs.channel = it }
                Text(
                    if (channel == Prefs.CHANNEL_SMS) "تُرسل الرسالة مباشرة من شريحة الهاتف دون الحاجة للإنترنت."
                    else "يُفتح واتساب برسالة جاهزة لولي الأمر وتضغط إرسال. يحتاج إنترنت عند الإرسال فقط.",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.Gray,
                )
                SwitchRow(
                    "تبليغ فوري عند تسجيل الغياب",
                    "عند الإيقاف يظهر زر لإرسال التبليغات دفعة واحدة بعد انتهاء التعداد",
                    autoSend,
                ) { autoSend = it; prefs.autoSend = it }
                SwitchRow("تبليغ ولي الأمر عند التأخر أيضاً", null, notifyLate) { notifyLate = it; prefs.notifyLate = it }
                OutlinedTextField(
                    value = cc,
                    onValueChange = { v -> cc = v.filter { it.isDigit() }; prefs.countryCode = cc },
                    label = { Text("رمز الدولة لواتساب (العراق 964)") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                )
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
                    "الكلمات التالية تُستبدل تلقائياً: {الطالب} {الصف} {المادة} {المدرسة} {اليوم} {التاريخ}",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.Gray,
                )
            }

            SettingsCard("الحماية بالرمز السري") {
                Text(
                    "عند تفعيله يُطلب الرمز قبل حذف الطلاب أو الصفوف أو المواد أو الدرجات أو الخطط، وقبل استرجاع نسخة احتياطية.",
                    style = MaterialTheme.typography.bodySmall,
                )
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { if (hasPin) app.guard { setPin = true } else setPin = true }, modifier = Modifier.weight(1f)) {
                        Icon(Icons.Filled.Lock, null)
                        Spacer(Modifier.width(6.dp))
                        Text(if (hasPin) "تغيير الرمز" else "تعيين رمز")
                    }
                    if (hasPin) {
                        OutlinedButton(onClick = {
                            app.guard {
                                prefs.pin = ""
                                hasPin = false
                                app.toast("تم إلغاء الرمز السري")
                            }
                        }, modifier = Modifier.weight(1f)) {
                            Icon(Icons.Filled.LockOpen, null)
                            Spacer(Modifier.width(6.dp))
                            Text("إلغاء الرمز")
                        }
                    }
                }
            }

            SettingsCard("النسخ الاحتياطي") {
                Text(
                    "احفظ نسخة من جميع البيانات (الطلاب والحضور والدرجات والخطط والجدول) في ملف، لتنقلها إلى هاتف آخر أو تسترجعها عند الحاجة.",
                    style = MaterialTheme.typography.bodySmall,
                )
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { backup.launch("نسخة-حي-النفط-${Dates.today()}.db") }, modifier = Modifier.weight(1f)) {
                        Icon(Icons.Filled.Backup, null)
                        Spacer(Modifier.width(6.dp))
                        Text("حفظ نسخة")
                    }
                    OutlinedButton(onClick = { app.guard { restore.launch(arrayOf("*/*")) } }, modifier = Modifier.weight(1f)) {
                        Icon(Icons.Filled.Restore, null)
                        Spacer(Modifier.width(6.dp))
                        Text("استرجاع")
                    }
                }
            }

            SettingsCard("حول التطبيق") {
                Text("تطبيق ثانوية حي النفط للبنين", fontWeight = FontWeight.Bold)
                Text(
                    "الإصدار 2.0 • يعمل بدون إنترنت • الحضور والدرجات والخطط والتبليغات",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.Gray,
                )
            }
        }
    }

    if (setPin) {
        var pin by remember { mutableStateOf("") }
        var again by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { setPin = false },
            title = { Text("تعيين الرمز السري") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = pin, onValueChange = { v -> pin = v.filter { it.isDigit() }.take(8) },
                        label = { Text("الرمز (4 أرقام على الأقل)") }, singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                    )
                    OutlinedTextField(
                        value = again, onValueChange = { v -> again = v.filter { it.isDigit() }.take(8) },
                        label = { Text("أعد كتابة الرمز") }, singleLine = true,
                        isError = again.isNotEmpty() && again != pin,
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                    )
                }
            },
            confirmButton = {
                Button(enabled = pin.length >= 4 && pin == again, onClick = {
                    prefs.pin = pin
                    hasPin = true
                    setPin = false
                    app.toast("تم حفظ الرمز السري")
                }) { Text("حفظ") }
            },
            dismissButton = { TextButton(onClick = { setPin = false }) { Text("إلغاء") } },
        )
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
private fun SchoolField(label: String, value: String, modifier: Modifier = Modifier.fillMaxWidth(), number: Boolean = false, onSave: (String) -> Unit) {
    var text by remember(value) { mutableStateOf(value) }
    OutlinedTextField(
        value = text,
        onValueChange = {
            text = it
            onSave(it.trim())
        },
        label = { Text(label) },
        singleLine = true,
        modifier = modifier.padding(vertical = 3.dp),
        keyboardOptions = if (number) KeyboardOptions(keyboardType = KeyboardType.Number) else KeyboardOptions.Default,
    )
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
