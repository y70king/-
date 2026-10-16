@file:OptIn(ExperimentalMaterial3Api::class)

package com.hayalnaft.attendance.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.EventAvailable
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.hayalnaft.attendance.AppState
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material3.OutlinedButton
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import com.hayalnaft.attendance.data.Subject
import com.hayalnaft.attendance.data.Stages
import androidx.compose.material3.Checkbox
import com.hayalnaft.attendance.util.PdfFiles
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.TableChart
import com.hayalnaft.attendance.data.School
import com.hayalnaft.attendance.util.Export
import com.hayalnaft.attendance.util.ExportFormat
import com.hayalnaft.attendance.util.ReportDoc
import com.hayalnaft.attendance.util.Reports
import com.hayalnaft.attendance.util.Phone
import java.io.File
import com.hayalnaft.attendance.data.SchoolClass
import com.hayalnaft.attendance.data.Status
import com.hayalnaft.attendance.data.Student

val Navy = Color(0xFF0B3C5D)
val NavyDark = Color(0xFF072A42)
val Gold = Color(0xFFF2A900)
val PresentGreen = Color(0xFF2E7D32)
val AbsentRed = Color(0xFFC62828)
val LateOrange = Color(0xFFEF6C00)
val ExcusedBlue = Color(0xFF1565C0)

private val LightColors = lightColorScheme(
    primary = Navy,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFD6E6F2),
    onPrimaryContainer = NavyDark,
    secondary = Gold,
    onSecondary = Color(0xFF231A00),
    secondaryContainer = Color(0xFFFFE8B0),
    onSecondaryContainer = Color(0xFF3A2C00),
    background = Color(0xFFF4F6FA),
    surface = Color.White,
    surfaceVariant = Color(0xFFE7ECF3),
    error = AbsentRed,
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFF9CC9F0),
    onPrimary = NavyDark,
    primaryContainer = Color(0xFF1E3A52),
    onPrimaryContainer = Color(0xFFD6E6F2),
    secondary = Gold,
    onSecondary = Color(0xFF231A00),
    secondaryContainer = Color(0xFF4A3A10),
    onSecondaryContainer = Color(0xFFFFE8B0),
    background = Color(0xFF0F1419),
    surface = Color(0xFF1A2027),
    surfaceVariant = Color(0xFF26303A),
    onSurface = Color(0xFFE3E8EE),
    onSurfaceVariant = Color(0xFFA9B4C0),
    error = Color(0xFFEF5350),
)

/** [theme] is "light", "dark" or "system". */
@Composable
fun AppTheme(theme: String = "system", content: @Composable () -> Unit) {
    val dark = when (theme) {
        "dark" -> true
        "light" -> false
        else -> isSystemInDarkTheme()
    }
    MaterialTheme(colorScheme = if (dark) DarkColors else LightColors, content = content)
}

/** Card and sheet background that follows light / dark mode. */
val CardBg: Color @Composable get() = MaterialTheme.colorScheme.surface

/** Secondary text colour. */
val Muted: Color @Composable get() = MaterialTheme.colorScheme.onSurfaceVariant

/** Brand colour for text and icons, readable in both modes. */
val Ink: Color @Composable get() = MaterialTheme.colorScheme.primary

/** Subtle filled background for list rows inside dialogs. */
val SoftBg: Color @Composable get() = MaterialTheme.colorScheme.surfaceVariant

object StatusUi {
    val order = listOf(Status.PRESENT, Status.ABSENT, Status.LATE, Status.EXCUSED)

    fun label(s: Int) = when (s) {
        Status.PRESENT -> "حاضر"
        Status.ABSENT -> "غائب"
        Status.LATE -> "متأخر"
        Status.EXCUSED -> "مُجاز"
        else -> "غير مسجّل"
    }

    fun color(s: Int) = when (s) {
        Status.PRESENT -> PresentGreen
        Status.ABSENT -> AbsentRed
        Status.LATE -> LateOrange
        Status.EXCUSED -> ExcusedBlue
        else -> Color(0xFF9AA5B1)
    }

    fun icon(s: Int): ImageVector = when (s) {
        Status.PRESENT -> Icons.Filled.CheckCircle
        Status.ABSENT -> Icons.Filled.Cancel
        Status.LATE -> Icons.Filled.Schedule
        else -> Icons.Filled.EventAvailable
    }
}

@Composable
fun AppTopBar(
    title: String,
    subtitle: String? = null,
    onBack: (() -> Unit)? = null,
    actions: @Composable RowScope.() -> Unit = {},
) {
    TopAppBar(
        title = {
            Column {
                Text(title, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (subtitle != null) {
                    Text(
                        subtitle,
                        style = MaterialTheme.typography.labelMedium,
                        color = Color.White.copy(alpha = 0.8f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        },
        navigationIcon = {
            if (onBack != null) {
                IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "رجوع") }
            }
        },
        actions = actions,
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = Navy,
            titleContentColor = Color.White,
            navigationIconContentColor = Color.White,
            actionIconContentColor = Color.White,
        ),
    )
}

@Composable
fun ClassChips(
    classes: List<SchoolClass>,
    selected: Long?,
    onSelect: (Long?) -> Unit,
    allLabel: String? = null,
    onAdd: (() -> Unit)? = null,
) {
    val listState = rememberLazyListState()
    val selectedIndex = classes.indexOfFirst { it.id == selected }
    LaunchedEffect(selectedIndex) {
        if (selectedIndex >= 0) listState.animateScrollToItem(selectedIndex + if (allLabel != null) 1 else 0)
    }
    LazyRow(
        state = listState,
        contentPadding = PaddingValues(horizontal = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (allLabel != null) {
            item {
                FilterChip(
                    selected = selected == null,
                    onClick = { onSelect(null) },
                    label = { Text(allLabel) },
                    colors = chipColors(),
                )
            }
        }
        items(classes, key = { it.id }) { c ->
            FilterChip(
                selected = selected == c.id,
                onClick = { onSelect(c.id) },
                label = { Text("${c.title} (${c.count})") },
                colors = chipColors(),
            )
        }
        if (onAdd != null) {
            item {
                AssistChip(
                    onClick = onAdd,
                    label = { Text("صف جديد") },
                    leadingIcon = { Icon(Icons.Filled.Add, null, Modifier.size(18.dp)) },
                )
            }
        }
    }
}

@Composable
fun chipColors() = FilterChipDefaults.filterChipColors(
    selectedContainerColor = Navy,
    selectedLabelColor = Color.White,
    selectedLeadingIconColor = Color.White,
)

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        modifier = modifier.padding(horizontal = 16.dp, vertical = 8.dp),
        style = MaterialTheme.typography.titleSmall,
        fontWeight = FontWeight.Bold,
        color = Ink,
    )
}

@Composable
fun EmptyState(icon: ImageVector, title: String, subtitle: String? = null, content: @Composable () -> Unit = {}) {
    Column(
        Modifier.fillMaxWidth().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(
            Modifier.size(80.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer),
            contentAlignment = Alignment.Center,
        ) { Icon(icon, null, tint = Ink, modifier = Modifier.size(40.dp)) }
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
        if (subtitle != null) {
            Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = Muted, textAlign = TextAlign.Center)
        }
        Spacer(Modifier.height(4.dp))
        content()
    }
}

@Composable
fun Avatar(name: String, color: Color = Ink) {
    Box(
        Modifier.size(42.dp).clip(CircleShape).background(color.copy(alpha = 0.12f)),
        contentAlignment = Alignment.Center,
    ) {
        Text(name.trim().take(1), color = color, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
    }
}

@Composable
fun CountBadge(label: String, count: Int, color: Color) = Tag("$label $count", color)

@Composable
fun Tag(text: String, color: Color) {
    Surface(color = color.copy(alpha = 0.12f), shape = RoundedCornerShape(8.dp)) {
        Text(
            text,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
            color = color,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
fun ConfirmDialog(
    title: String,
    text: String,
    confirmText: String,
    danger: Boolean = false,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(text) },
        confirmButton = {
            Button(
                onClick = { onConfirm(); onDismiss() },
                colors = if (danger) ButtonDefaults.buttonColors(containerColor = AbsentRed) else ButtonDefaults.buttonColors(),
            ) { Text(confirmText) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("إلغاء") } },
    )
}

@Composable
fun TextInputDialog(
    title: String,
    label: String,
    initial: String = "",
    confirmText: String = "حفظ",
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    var value by remember { mutableStateOf(initial) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            OutlinedTextField(value = value, onValueChange = { value = it }, label = { Text(label) }, singleLine = true)
        },
        confirmButton = {
            Button(enabled = value.isNotBlank(), onClick = { onConfirm(value.trim()); onDismiss() }) { Text(confirmText) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("إلغاء") } },
    )
}

/** Add or edit one student. */
@Composable
fun StudentDialog(
    classes: List<SchoolClass>,
    initial: Student?,
    defaultClassId: Long?,
    onDismiss: () -> Unit,
    onSave: (name: String, phone: String, classId: Long) -> Unit,
) {
    var name by remember { mutableStateOf(initial?.name ?: "") }
    var phone by remember { mutableStateOf(initial?.phone ?: "") }
    var classId by remember { mutableStateOf(initial?.classId ?: defaultClassId ?: classes.firstOrNull()?.id) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (initial == null) "إضافة طالب" else "تعديل بيانات الطالب") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    value = name, onValueChange = { name = it },
                    label = { Text("اسم الطالب") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = phone, onValueChange = { phone = it },
                    label = { Text("رقم هاتف ولي الأمر") }, singleLine = true,
                    placeholder = { Text("07xxxxxxxxx") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    modifier = Modifier.fillMaxWidth(),
                )
                Text("الصف", style = MaterialTheme.typography.labelLarge)
                Box(Modifier.padding(horizontal = 0.dp)) {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        items(classes, key = { it.id }) { c ->
                            FilterChip(
                                selected = classId == c.id,
                                onClick = { classId = c.id },
                                label = { Text(c.title) },
                                colors = chipColors(),
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                enabled = name.isNotBlank() && classId != null,
                onClick = {
                    onSave(name.trim(), com.hayalnaft.attendance.util.Importer.normalizePhone(phone), classId!!)
                    onDismiss()
                },
            ) { Text("حفظ") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("إلغاء") } },
    )
}

/** Progress strip shown at the bottom of every screen while SMS messages are going out. */
@Composable
fun SendingBanner(app: AppState, modifier: Modifier = Modifier) {
    if (app.queued == 0) return
    Surface(
        modifier = modifier.fillMaxWidth().navigationBarsPadding().padding(12.dp),
        color = NavyDark,
        contentColor = Color.White,
        shape = RoundedCornerShape(14.dp),
        shadowElevation = 6.dp,
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("جارٍ إرسال التبليغات…", fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                Text("${app.done} / ${app.queued}")
            }
            LinearProgressIndicator(
                progress = { if (app.queued == 0) 0f else app.done.toFloat() / app.queued },
                modifier = Modifier.fillMaxWidth(),
                color = Gold,
                trackColor = Color.White.copy(alpha = 0.2f),
            )
        }
    }
}

/** One-of-many choice shown as a row of chips that scrolls sideways. */
@Composable
fun <T> OptionChips(options: List<T>, selected: T?, label: (T) -> String, modifier: Modifier = Modifier, onSelect: (T) -> Unit) {
    val listState = rememberLazyListState()
    val selectedIndex = options.indexOf(selected)
    LaunchedEffect(selectedIndex) {
        if (selectedIndex >= 0) listState.animateScrollToItem(selectedIndex)
    }
    LazyRow(
        state = listState,
        modifier = modifier,
        contentPadding = PaddingValues(horizontal = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(options.size) { i ->
            val o = options[i]
            FilterChip(selected = o == selected, onClick = { onSelect(o) }, label = { Text(label(o)) }, colors = chipColors())
        }
    }
}

/** Subject picker; [generalLabel] adds a choice for the general (whole-day) record with id 0. */
@Composable
fun SubjectChips(subjects: List<Subject>, selected: Long?, onSelect: (Long) -> Unit, generalLabel: String? = null) {
    val ids = (if (generalLabel != null) listOf(0L) else emptyList()) + subjects.map { it.id }
    OptionChips(ids, selected, { id -> if (id == 0L) generalLabel.orEmpty() else subjects.first { it.id == id }.name }) { onSelect(it) }
}

@Composable
fun PinDialog(expected: String, onDismiss: () -> Unit, onSuccess: () -> Unit) {
    var value by remember { mutableStateOf("") }
    var wrong by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = { Icon(Icons.Filled.Lock, null, tint = Ink) },
        title = { Text("أدخل الرمز السري") },
        text = {
            OutlinedTextField(
                value = value,
                onValueChange = { v -> value = v.filter { it.isDigit() }; wrong = false },
                singleLine = true,
                isError = wrong,
                supportingText = { if (wrong) Text("الرمز غير صحيح") },
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
            )
        },
        confirmButton = {
            Button(onClick = { if (value == expected) onSuccess() else wrong = true }) { Text("تأكيد") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("إلغاء") } },
    )
}

/** What to do with a generated PDF: share (e.g. WhatsApp), print, or send to the student's parent. */
@Composable
fun PdfDialog(app: AppState, file: File, title: String, parentPhone: String? = null, onDismiss: () -> Unit) =
    FileDialog(app, file, title, "application/pdf", parentPhone, onDismiss)

/** Share a generated report file (PDF, Word or Excel); PDFs can also be printed. */
@Composable
fun FileDialog(app: AppState, file: File, title: String, mime: String, parentPhone: String? = null, onDismiss: () -> Unit) {
    val ctx = LocalContext.current
    val kind = when (mime) {
        Export.MIME_DOCX -> "Word"
        Export.MIME_XLSX -> "Excel"
        else -> "PDF"
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = {
            Icon(
                when (kind) {
                    "Word" -> Icons.Filled.Description
                    "Excel" -> Icons.Filled.TableChart
                    else -> Icons.Filled.PictureAsPdf
                },
                null,
                tint = when (kind) {
                    "Word" -> ExcusedBlue
                    "Excel" -> PresentGreen
                    else -> AbsentRed
                },
            )
        },
        title = { Text(title) },
        text = {
            Text(
                when (kind) {
                    "Word" -> "تم إنشاء الملف بصيغة Word، ويمكن تعديله وطباعته من برنامج Word."
                    "Excel" -> "تم إنشاء الملف بصيغة Excel، ويمكن فتحه وتعديله من برنامج Excel."
                    else -> "تم إنشاء الملف بصيغة PDF جاهزاً للطباعة على ورق A4."
                },
            )
        },
        confirmButton = {
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                if (!parentPhone.isNullOrBlank()) {
                    Button(onClick = { Phone.shareFile(ctx, file, mime, parentPhone, app.prefs.countryCode); onDismiss() }) {
                        Text("إرسال لولي الأمر عبر واتساب")
                    }
                }
                OutlinedButton(onClick = { Phone.shareFile(ctx, file, mime, null, app.prefs.countryCode); onDismiss() }) {
                    Text("مشاركة / حفظ / واتساب")
                }
                if (kind == "PDF") OutlinedButton(onClick = { PdfFiles.print(ctx, file, title); onDismiss() }) { Text("طباعة") }
                TextButton(onClick = onDismiss) { Text("إغلاق") }
            }
        },
    )
}

/**
 * Lets the teacher pick how a report goes out: PDF, Word, Excel or a WhatsApp message.
 * [parentPhone] sends the message (and offers files) straight to a parent; otherwise WhatsApp asks for the chat.
 */
@Composable
fun ExportDialog(
    app: AppState,
    school: School,
    title: String,
    parentPhone: String? = null,
    whatsappText: (() -> String)? = null,
    summary: (@Composable () -> Unit)? = null,
    onDismiss: () -> Unit,
    doc: () -> ReportDoc,
) {
    val ctx = LocalContext.current
    var file by remember { mutableStateOf<Pair<File, String>?>(null) }
    file?.let { (f, mime) ->
        FileDialog(app, f, title, mime, parentPhone, onDismiss)
        return
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = { Icon(Icons.Filled.Description, null, tint = Ink) },
        title = { Text(title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                summary?.invoke()
                Text("اختر صيغة التقرير", color = Muted, style = MaterialTheme.typography.bodySmall)
                ExportFormat.entries.forEach { f ->
                    val (icon, color) = when (f) {
                        ExportFormat.PDF -> Icons.Filled.PictureAsPdf to AbsentRed
                        ExportFormat.WORD -> Icons.Filled.Description to ExcusedBlue
                        ExportFormat.EXCEL -> Icons.Filled.TableChart to PresentGreen
                        ExportFormat.WHATSAPP -> Icons.Filled.Chat to Color(0xFF1FA855)
                    }
                    Surface(
                        onClick = {
                            when (f) {
                                ExportFormat.PDF -> file = Reports.pdf(ctx, school, doc()) to "application/pdf"
                                ExportFormat.WORD -> file = Export.docx(ctx, school, doc()) to Export.MIME_DOCX
                                ExportFormat.EXCEL -> file = Export.xlsx(ctx, school, doc()) to Export.MIME_XLSX
                                ExportFormat.WHATSAPP -> {
                                    val text = whatsappText?.invoke() ?: Export.text(school, doc())
                                    if (!parentPhone.isNullOrBlank()) Phone.whatsapp(ctx, parentPhone, text, app.prefs.countryCode)
                                    else Phone.shareText(ctx, text)
                                    onDismiss()
                                }
                            }
                        },
                        shape = RoundedCornerShape(14.dp),
                        color = color.copy(alpha = 0.1f),
                        contentColor = color,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(icon, null)
                            Spacer(Modifier.width(10.dp))
                            Column {
                                Text(f.label, fontWeight = FontWeight.Bold)
                                Text(
                                    when (f) {
                                        ExportFormat.PDF -> "جاهز للطباعة"
                                        ExportFormat.WORD -> "قابل للتعديل في Word"
                                        ExportFormat.EXCEL -> "جدول قابل للتعديل في Excel"
                                        ExportFormat.WHATSAPP -> if (parentPhone.isNullOrBlank()) "نص التقرير في محادثة تختارها" else "نص التقرير إلى ولي الأمر"
                                    },
                                    style = MaterialTheme.typography.labelSmall,
                                    color = Muted,
                                )
                            }
                        }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("إلغاء") } },
    )
}

private val sections = listOf("أ", "ب", "ج", "د", "هـ", "و", "ز", "ح")

/** Create or edit a class: its grade, section (شعبة), room number and whether its final exam is ministerial. */
@Composable
fun ClassDialog(
    initial: SchoolClass?,
    stage: String,
    title: String? = null,
    onDismiss: () -> Unit,
    onSave: (name: String, section: String, room: String, ministerial: Boolean) -> Unit,
) {
    var name by remember { mutableStateOf(initial?.name ?: "") }
    var section by remember { mutableStateOf(initial?.section ?: "أ") }
    var room by remember { mutableStateOf(initial?.room ?: "") }
    var ministerial by remember { mutableStateOf(initial?.ministerial ?: false) }
    val grades = Stages.grades(stage) + Stages.allGrades.filter { it !in Stages.grades(stage) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title ?: if (initial == null) "صف جديد" else "تعديل الصف") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("الصف", style = MaterialTheme.typography.labelLarge)
                LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(grades) { g ->
                        FilterChip(
                            selected = name == g,
                            onClick = { name = g; ministerial = Stages.isMinisterial(g) },
                            label = { Text(g) },
                            colors = chipColors(),
                        )
                    }
                }
                OutlinedTextField(
                    value = name, onValueChange = { name = it }, label = { Text("اسم الصف") },
                    singleLine = true, modifier = Modifier.fillMaxWidth(),
                )
                Text("الشعبة", style = MaterialTheme.typography.labelLarge)
                LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(sections) { sec ->
                        FilterChip(selected = section == sec, onClick = { section = sec }, label = { Text(sec) }, colors = chipColors())
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = section, onValueChange = { section = it }, label = { Text("الشعبة") },
                        singleLine = true, modifier = Modifier.weight(1f),
                    )
                    OutlinedTextField(
                        value = room, onValueChange = { room = it }, label = { Text("رقم القاعة") },
                        singleLine = true, modifier = Modifier.weight(1f),
                    )
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = ministerial, onCheckedChange = { ministerial = it })
                    Text("صف وزاري (لا يوجد إعفاء)", style = MaterialTheme.typography.bodySmall)
                }
            }
        },
        confirmButton = {
            Button(enabled = name.isNotBlank(), onClick = {
                onSave(name.trim(), section.trim(), room.trim(), ministerial)
                onDismiss()
            }) { Text("حفظ") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("إلغاء") } },
    )
}
