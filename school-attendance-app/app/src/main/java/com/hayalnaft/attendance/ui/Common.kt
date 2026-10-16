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
import androidx.compose.material3.lightColorScheme
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

@Composable
fun AppTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = LightColors, content = content)
}

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
                label = { Text("${c.name} (${c.count})") },
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
        color = Navy,
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
        ) { Icon(icon, null, tint = Navy, modifier = Modifier.size(40.dp)) }
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
        if (subtitle != null) {
            Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = Color.Gray, textAlign = TextAlign.Center)
        }
        Spacer(Modifier.height(4.dp))
        content()
    }
}

@Composable
fun Avatar(name: String, color: Color = Navy) {
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
                                label = { Text(c.name) },
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
