@file:OptIn(ExperimentalMaterial3Api::class)

package com.hayalnaft.attendance.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Sms
import androidx.compose.material.icons.filled.UploadFile
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
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
import com.hayalnaft.attendance.data.SchoolClass
import com.hayalnaft.attendance.data.Student
import com.hayalnaft.attendance.util.Phone

@Composable
fun StudentsScreen(app: AppState) {
    val v = app.version
    val sid = app.schoolId
    val classes = remember(v, sid) { app.db.classes(sid) }
    var classId by rememberSaveable { mutableStateOf<Long?>(null) }
    val selectedClass = classes.firstOrNull { it.id == classId }
    var search by rememberSaveable { mutableStateOf("") }
    val students = remember(v, sid, selectedClass?.id, search) { app.db.students(sid, selectedClass?.id, search) }
    val schoolName = remember(v, sid) { app.schoolName() }

    var adding by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<Student?>(null) }
    var deleting by remember { mutableStateOf<Student?>(null) }
    var addClass by remember { mutableStateOf(false) }
    var renameClass by remember { mutableStateOf<SchoolClass?>(null) }
    var deleteClass by remember { mutableStateOf<SchoolClass?>(null) }

    Scaffold(
        topBar = {
            AppTopBar("الطلاب والصفوف", schoolName, app::back) {
                IconButton(onClick = { app.go(Screen.Import(selectedClass?.id)) }) {
                    Icon(Icons.Filled.UploadFile, "استيراد الطلاب")
                }
            }
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { if (classes.isEmpty()) addClass = true else adding = true },
                icon = { Icon(Icons.Filled.PersonAdd, null) },
                text = { Text("إضافة طالب") },
                containerColor = Gold,
                contentColor = NavyDark,
            )
        },
    ) { pad ->
        Column(Modifier.fillMaxSize().padding(pad)) {
            Spacer(Modifier.height(10.dp))
            ClassChips(classes, selectedClass?.id, { classId = it }, allLabel = "الكل", onAdd = { addClass = true })
            if (selectedClass != null) {
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "${selectedClass.name}: ${selectedClass.count} طالب",
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.weight(1f),
                    )
                    TextButton(onClick = { renameClass = selectedClass }) {
                        Icon(Icons.Filled.Edit, null)
                        Spacer(Modifier.width(4.dp))
                        Text("تعديل")
                    }
                    TextButton(onClick = { deleteClass = selectedClass }) {
                        Icon(Icons.Filled.Delete, null, tint = AbsentRed)
                        Spacer(Modifier.width(4.dp))
                        Text("حذف", color = AbsentRed)
                    }
                }
            }
            OutlinedTextField(
                value = search,
                onValueChange = { search = it },
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp),
                placeholder = { Text("بحث بالاسم أو الرقم") },
                leadingIcon = { Icon(Icons.Filled.Search, null) },
                trailingIcon = {
                    if (search.isNotEmpty()) IconButton(onClick = { search = "" }) { Icon(Icons.Filled.Clear, "مسح") }
                },
                singleLine = true,
                shape = RoundedCornerShape(14.dp),
            )
            if (students.isEmpty()) {
                EmptyState(
                    Icons.Filled.Groups,
                    if (search.isBlank()) "لا يوجد طلاب بعد" else "لا توجد نتائج",
                    if (search.isBlank()) "أضف الطلاب يدوياً أو استوردهم من Excel أو Word أو بالنسخ واللصق" else null,
                ) {
                    if (search.isBlank()) {
                        Button(onClick = { app.go(Screen.Import(selectedClass?.id)) }) {
                            Icon(Icons.Filled.UploadFile, null)
                            Spacer(Modifier.width(6.dp))
                            Text("استيراد الطلاب")
                        }
                    }
                }
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 4.dp, bottom = 96.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(students, key = { it.id }) { s ->
                        StudentCard(
                            app, s, showClass = selectedClass == null,
                            onEdit = { editing = s }, onDelete = { deleting = s },
                        )
                    }
                }
            }
        }
    }

    if (adding || editing != null) {
        StudentDialog(
            classes = classes,
            initial = editing,
            defaultClassId = selectedClass?.id,
            onDismiss = { adding = false; editing = null },
        ) { name, phone, cid ->
            val e = editing
            if (e == null) app.db.addStudent(sid, cid, name, phone) else app.db.updateStudent(e.id, cid, name, phone)
            app.changed()
        }
    }
    deleting?.let { s ->
        ConfirmDialog(
            "حذف طالب", "هل تريد حذف الطالب ${s.name} وكل سجل حضوره؟", "حذف", danger = true,
            onDismiss = { deleting = null },
        ) { app.db.deleteStudent(s.id); app.changed() }
    }
    if (addClass) {
        TextInputDialog("صف جديد", "اسم الصف (مثال: الرابع العلمي - أ)", onDismiss = { addClass = false }) {
            classId = app.db.addClass(sid, it)
            app.changed()
        }
    }
    renameClass?.let { c ->
        TextInputDialog("تعديل اسم الصف", "اسم الصف", c.name, onDismiss = { renameClass = null }) {
            app.db.renameClass(c.id, it)
            app.changed()
        }
    }
    deleteClass?.let { c ->
        ConfirmDialog(
            "حذف الصف",
            "سيتم حذف صف ${c.name} مع جميع طلابه (${c.count}) وسجل حضورهم. هل أنت متأكد؟",
            "حذف", danger = true, onDismiss = { deleteClass = null },
        ) {
            app.db.deleteClass(c.id)
            classId = null
            app.changed()
        }
    }
}

@Composable
private fun StudentCard(app: AppState, s: Student, showClass: Boolean, onEdit: () -> Unit, onDelete: () -> Unit) {
    val ctx = LocalContext.current
    var menu by remember { mutableStateOf(false) }
    Card(
        onClick = { app.go(Screen.StudentDetail(s.id)) },
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Avatar(s.name)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(s.name, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    if (s.phone.isBlank()) "لا يوجد رقم ولي أمر" else s.phone,
                    color = if (s.phone.isBlank()) AbsentRed else Color.Gray,
                    style = MaterialTheme.typography.bodySmall,
                )
                if (showClass) Text(s.className, color = Navy, style = MaterialTheme.typography.labelSmall)
            }
            if (s.phone.isNotBlank()) {
                IconButton(onClick = { Phone.dial(ctx, s.phone) }) { Icon(Icons.Filled.Call, "اتصال", tint = PresentGreen) }
            }
            Box {
                IconButton(onClick = { menu = true }) { Icon(Icons.Filled.MoreVert, "المزيد") }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    DropdownMenuItem(
                        text = { Text("إرسال تبليغ") },
                        leadingIcon = { Icon(Icons.Filled.Sms, null) },
                        onClick = { menu = false; app.go(Screen.Messages(s.id)) },
                    )
                    DropdownMenuItem(
                        text = { Text("تعديل") },
                        leadingIcon = { Icon(Icons.Filled.Edit, null) },
                        onClick = { menu = false; onEdit() },
                    )
                    DropdownMenuItem(
                        text = { Text("حذف", color = AbsentRed) },
                        leadingIcon = { Icon(Icons.Filled.Delete, null, tint = AbsentRed) },
                        onClick = { menu = false; onDelete() },
                    )
                }
            }
        }
    }
}
