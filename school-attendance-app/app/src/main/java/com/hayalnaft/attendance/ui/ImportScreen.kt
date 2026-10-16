@file:OptIn(ExperimentalMaterial3Api::class)

package com.hayalnaft.attendance.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentPaste
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Notes
import androidx.compose.material.icons.filled.PlaylistAddCheck
import androidx.compose.material.icons.filled.TableChart
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.hayalnaft.attendance.AppState
import com.hayalnaft.attendance.util.ImportException
import com.hayalnaft.attendance.util.Importer
import com.hayalnaft.attendance.util.ParsedStudent
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private val excelTypes = arrayOf(
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "text/csv",
    "text/comma-separated-values",
)
private val wordTypes = arrayOf(
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
)

@Composable
fun ImportScreen(app: AppState, initialClassId: Long?) {
    val ctx = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val scope = rememberCoroutineScope()
    val v = app.version
    val sid = app.schoolId
    val classes = remember(v, sid) { app.db.classes(sid) }
    var classId by rememberSaveable { mutableStateOf(initialClassId) }
    val target = classes.firstOrNull { it.id == classId } ?: classes.firstOrNull()

    var text by rememberSaveable { mutableStateOf("") }
    val parsed = remember { mutableStateListOf<ParsedStudent>() }
    val checked = remember { mutableStateListOf<Boolean>() }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var parsedOnce by remember { mutableStateOf(false) }
    var newClass by remember { mutableStateOf(false) }

    fun show(list: List<ParsedStudent>) {
        parsed.clear()
        parsed.addAll(list)
        checked.clear()
        checked.addAll(list.map { true })
        parsedOnce = true
        error = if (list.isEmpty()) "لم يتم العثور على أسماء. تأكد أن كل اسم في سطر أو خلية مستقلة" else null
    }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        loading = true
        scope.launch {
            try {
                show(withContext(Dispatchers.IO) { Importer.fromUri(ctx, uri) })
            } catch (e: ImportException) {
                error = e.message
            } catch (e: Exception) {
                error = "تعذرت قراءة الملف. جرّب نسخ الأسماء ولصقها"
            } finally {
                loading = false
            }
        }
    }

    val selectedCount = checked.count { it }

    Scaffold(
        topBar = { AppTopBar("استيراد الطلاب", app.schoolName(), app::back) },
        bottomBar = {
            if (parsed.isNotEmpty()) {
                Surface(Modifier.fillMaxWidth(), shadowElevation = 8.dp, color = Color.White) {
                    Button(
                        enabled = selectedCount > 0 && target != null,
                        onClick = {
                            val t = target ?: return@Button
                            val list = parsed.filterIndexed { i, _ -> checked[i] }
                            val added = app.db.importStudents(sid, t.id, list)
                            app.changed()
                            val skipped = list.size - added
                            app.toast(
                                "تمت إضافة $added طالب إلى ${t.name}" +
                                    if (skipped > 0) " (تم تجاهل $skipped اسم مكرر)" else ""
                            )
                            app.back()
                        },
                        modifier = Modifier.fillMaxWidth().navigationBarsPadding().padding(12.dp).height(50.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = PresentGreen),
                    ) {
                        Icon(Icons.Filled.PlaylistAddCheck, null)
                        Spacer(Modifier.width(8.dp))
                        Text("إضافة $selectedCount طالب إلى ${target?.name ?: ""}", fontWeight = FontWeight.Bold)
                    }
                }
            }
        },
    ) { pad ->
        LazyColumn(
            Modifier.fillMaxSize().padding(pad),
            contentPadding = PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                    Row(Modifier.padding(12.dp)) {
                        Icon(Icons.Filled.Info, null, tint = Navy)
                        Spacer(Modifier.width(8.dp))
                        Text(
                            "اختر ملف Excel أو Word يحتوي أسماء الطلاب، أو انسخ الأسماء من أي مكان والصقها في المربع. " +
                                "يمكن كتابة رقم هاتف ولي الأمر بجانب الاسم وسيتعرف عليه التطبيق تلقائياً.",
                            style = MaterialTheme.typography.bodySmall,
                            color = NavyDark,
                        )
                    }
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    SourceButton("ملف Excel", Icons.Filled.TableChart, PresentGreen, Modifier.weight(1f)) { picker.launch(excelTypes) }
                    SourceButton("ملف Word", Icons.Filled.Description, ExcusedBlue, Modifier.weight(1f)) { picker.launch(wordTypes) }
                }
                Spacer(Modifier.height(8.dp))
                OutlinedButton(onClick = { picker.launch(arrayOf("*/*")) }, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Filled.Notes, null)
                    Spacer(Modifier.width(6.dp))
                    Text("ملف آخر (CSV أو نصي)")
                }
            }
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    HorizontalDivider(Modifier.weight(1f))
                    Text("  أو الصق الأسماء  ", color = Color.Gray, style = MaterialTheme.typography.labelMedium)
                    HorizontalDivider(Modifier.weight(1f))
                }
            }
            item {
                OutlinedTextField(
                    value = text,
                    onValueChange = { text = it },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 5,
                    maxLines = 10,
                    placeholder = { Text("أحمد محمد علي    07701234567\nعلي حسين كاظم    07801234567\nمصطفى كريم جاسم") },
                    shape = RoundedCornerShape(14.dp),
                )
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedButton(
                        onClick = {
                            val clip = clipboard.getText()?.text.orEmpty()
                            if (clip.isBlank()) app.toast("الحافظة فارغة، انسخ الأسماء أولاً")
                            else {
                                text = clip
                                show(Importer.fromText(clip))
                            }
                        },
                        modifier = Modifier.weight(1f),
                    ) {
                        Icon(Icons.Filled.ContentPaste, null)
                        Spacer(Modifier.width(6.dp))
                        Text("لصق")
                    }
                    Button(onClick = { show(Importer.fromText(text)) }, enabled = text.isNotBlank(), modifier = Modifier.weight(1f)) {
                        Text("قراءة الأسماء")
                    }
                }
            }
            if (loading) {
                item {
                    Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.Center) {
                        CircularProgressIndicator()
                    }
                }
            }
            error?.let { msg ->
                item {
                    Surface(color = AbsentRed.copy(alpha = 0.1f), shape = RoundedCornerShape(12.dp)) {
                        Text(msg, color = AbsentRed, modifier = Modifier.padding(12.dp).fillMaxWidth())
                    }
                }
            }
            if (parsed.isNotEmpty()) {
                item {
                    Text("إضافة إلى صف:", fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(6.dp))
                    ClassChips(classes, target?.id, { classId = it }, onAdd = { newClass = true })
                }
                item {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "تم العثور على ${parsed.size} طالب",
                            fontWeight = FontWeight.Bold,
                            color = Navy,
                            modifier = Modifier.weight(1f),
                        )
                        val all = checked.all { it }
                        TextButton(onClick = { for (i in checked.indices) checked[i] = !all }) {
                            Text(if (all) "إلغاء تحديد الكل" else "تحديد الكل")
                        }
                    }
                }
                itemsIndexed(parsed) { i, p ->
                    Card(
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.clickable { checked[i] = !checked[i] },
                    ) {
                        Row(Modifier.padding(horizontal = 8.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(checked = checked.getOrElse(i) { false }, onCheckedChange = { checked[i] = it })
                            Text("${i + 1}.", color = Color.Gray, modifier = Modifier.width(32.dp))
                            Column(Modifier.weight(1f)) {
                                Text(p.name, fontWeight = FontWeight.Bold)
                                Text(
                                    p.phone.ifEmpty { "بدون رقم" },
                                    style = MaterialTheme.typography.bodySmall,
                                    color = if (p.phone.isEmpty()) Color.Gray else PresentGreen,
                                )
                            }
                        }
                    }
                }
            } else if (parsedOnce && error == null) {
                item { Text("لا توجد أسماء", color = Color.Gray) }
            }
        }
    }

    if (newClass) {
        TextInputDialog("صف جديد", "اسم الصف", onDismiss = { newClass = false }) {
            classId = app.db.addClass(sid, it)
            app.changed()
        }
    }
}

@Composable
private fun SourceButton(label: String, icon: ImageVector, color: Color, modifier: Modifier, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        modifier = modifier,
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = color.copy(alpha = 0.1f)),
    ) {
        Column(
            Modifier.fillMaxWidth().padding(vertical = 18.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(icon, null, tint = color, modifier = Modifier.size(36.dp))
            Spacer(Modifier.height(6.dp))
            Text(label, color = color, fontWeight = FontWeight.Bold)
        }
    }
}
