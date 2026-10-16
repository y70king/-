@file:OptIn(ExperimentalMaterial3Api::class)

package com.hayalnaft.attendance.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
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
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.hayalnaft.attendance.AppState
import com.hayalnaft.attendance.data.School

@Composable
fun SchoolsScreen(app: AppState) {
    val v = app.version
    val schools = remember(v) { app.db.schools() }
    var adding by remember { mutableStateOf(false) }
    var renaming by remember { mutableStateOf<School?>(null) }
    var deleting by remember { mutableStateOf<School?>(null) }

    Scaffold(
        topBar = { AppTopBar("المدارس", "بيانات كل مدرسة منفصلة تماماً", app::back) },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { adding = true },
                icon = { Icon(Icons.Filled.Add, null) },
                text = { Text("إضافة مدرسة") },
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
            item {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                    Row(Modifier.padding(12.dp)) {
                        Icon(Icons.Filled.Info, null, tint = Navy)
                        Spacer(Modifier.width(8.dp))
                        Text(
                            "اضغط على المدرسة للانتقال إليها. لكل مدرسة صفوفها وطلابها وسجل حضورها ورسائلها الخاصة.",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }
            items(schools, key = { it.id }) { s ->
                val current = s.id == app.schoolId
                var menu by remember { mutableStateOf(false) }
                Card(
                    onClick = {
                        app.selectSchool(s.id)
                        app.toast("تم الانتقال إلى ${s.name}")
                        app.back()
                    },
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    border = if (current) BorderStroke(2.dp, Gold) else null,
                    shape = RoundedCornerShape(16.dp),
                ) {
                    Row(Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Avatar(s.name)
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(s.name, fontWeight = FontWeight.Bold)
                            Text("${s.studentCount} طالب", style = MaterialTheme.typography.bodySmall, color = Color.Gray)
                        }
                        if (current) Tag("المدرسة الحالية", PresentGreen)
                        Box {
                            IconButton(onClick = { menu = true }) { Icon(Icons.Filled.MoreVert, "المزيد") }
                            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                                DropdownMenuItem(
                                    text = { Text("تعديل الاسم") },
                                    leadingIcon = { Icon(Icons.Filled.Edit, null) },
                                    onClick = { menu = false; renaming = s },
                                )
                                DropdownMenuItem(
                                    text = { Text("حذف", color = AbsentRed) },
                                    leadingIcon = { Icon(Icons.Filled.Delete, null, tint = AbsentRed) },
                                    enabled = schools.size > 1,
                                    onClick = { menu = false; deleting = s },
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    if (adding) {
        var name by remember { mutableStateOf("") }
        var withClasses by remember { mutableStateOf(true) }
        AlertDialog(
            onDismissRequest = { adding = false },
            title = { Text("إضافة مدرسة") },
            text = {
                Column {
                    OutlinedTextField(
                        value = name, onValueChange = { name = it }, label = { Text("اسم المدرسة") }, singleLine = true,
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = withClasses, onCheckedChange = { withClasses = it })
                        Text("إضافة الصفوف الافتراضية (الأول المتوسط - السادس الإعدادي)", style = MaterialTheme.typography.bodySmall)
                    }
                }
            },
            confirmButton = {
                Button(enabled = name.isNotBlank(), onClick = {
                    val id = app.db.addSchool(name.trim(), withClasses)
                    app.selectSchool(id)
                    adding = false
                }) { Text("إضافة") }
            },
            dismissButton = { TextButton(onClick = { adding = false }) { Text("إلغاء") } },
        )
    }
    renaming?.let { s ->
        TextInputDialog("تعديل اسم المدرسة", "اسم المدرسة", s.name, onDismiss = { renaming = null }) {
            app.db.renameSchool(s.id, it)
            app.changed()
        }
    }
    deleting?.let { s ->
        ConfirmDialog(
            "حذف المدرسة",
            "سيتم حذف ${s.name} مع جميع صفوفها وطلابها (${s.studentCount}) وسجلات الحضور والرسائل نهائياً. هل أنت متأكد؟",
            "حذف نهائي",
            danger = true,
            onDismiss = { deleting = null },
        ) {
            app.db.deleteSchool(s.id)
            app.ensureSchool()
            app.changed()
        }
    }
}
