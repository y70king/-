@file:OptIn(ExperimentalMaterial3Api::class)

package com.hayalnaft.attendance.ui

import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.PlaylistAdd
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.hayalnaft.attendance.AppState
import com.hayalnaft.attendance.data.Stages
import com.hayalnaft.attendance.data.Subject

@Composable
fun SubjectsScreen(app: AppState) {
    val v = app.version
    val sid = app.schoolId
    val subjects = remember(v, sid) { app.db.subjects(sid) }
    val school = remember(v, sid) { app.db.school(sid) }
    var adding by remember { mutableStateOf(false) }
    var renaming by remember { mutableStateOf<Subject?>(null) }
    var deleting by remember { mutableStateOf<Subject?>(null) }

    fun addDefaults() {
        val existing = subjects.map { it.name }.toSet()
        Stages.defaultSubjects(school?.stage ?: Stages.SECONDARY).filter { it !in existing }.forEach { app.db.addSubject(sid, it) }
        app.changed()
    }

    Scaffold(
        topBar = { AppTopBar("المواد الدراسية", "المواد التي تدرّسها أو تتابع درجاتها", app::back) },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { adding = true },
                icon = { Icon(Icons.Filled.Add, null) },
                text = { Text("إضافة مادة") },
                containerColor = Gold,
                contentColor = NavyDark,
            )
        },
    ) { pad ->
        LazyColumn(
            Modifier.fillMaxSize().padding(pad),
            contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 12.dp, bottom = 96.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (subjects.isEmpty()) {
                item {
                    EmptyState(Icons.Filled.MenuBook, "لا توجد مواد بعد", "أضف المواد يدوياً أو أضف مواد المرحلة الدراسية دفعة واحدة") {
                        Button(onClick = ::addDefaults) {
                            Icon(Icons.Filled.PlaylistAdd, null)
                            Spacer(Modifier.width(6.dp))
                            Text("إضافة مواد المرحلة")
                        }
                    }
                }
            }
            items(subjects, key = { it.id }) { s ->
                Card(colors = CardDefaults.cardColors(containerColor = CardBg), shape = RoundedCornerShape(14.dp)) {
                    Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Avatar(s.name, Color(0xFF2E7D32))
                        Spacer(Modifier.width(12.dp))
                        Text(s.name, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                        IconButton(onClick = { renaming = s }) { Icon(Icons.Filled.Edit, "تعديل") }
                        IconButton(onClick = { deleting = s }) { Icon(Icons.Filled.Delete, "حذف", tint = AbsentRed) }
                    }
                }
            }
            if (subjects.isNotEmpty()) {
                item {
                    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                        androidx.compose.material3.TextButton(onClick = ::addDefaults) { Text("إضافة باقي مواد المرحلة") }
                    }
                }
            }
        }
    }

    if (adding) {
        TextInputDialog("مادة جديدة", "اسم المادة", onDismiss = { adding = false }) {
            app.db.addSubject(sid, it)
            app.changed()
        }
    }
    renaming?.let { s ->
        TextInputDialog("تعديل اسم المادة", "اسم المادة", s.name, onDismiss = { renaming = null }) {
            app.db.renameSubject(s.id, it)
            app.changed()
        }
    }
    deleting?.let { s ->
        ConfirmDialog(
            "حذف المادة",
            "سيتم حذف مادة ${s.name} مع درجاتها وحصصها في الجدول وسجل حضور حصصها. هل أنت متأكد؟",
            "حذف", danger = true, onDismiss = { deleting = null },
        ) {
            app.guard {
                app.db.deleteSubject(s.id)
                app.changed()
            }
        }
    }
}
