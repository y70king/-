package com.hayalnaft.attendance.ui

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Backspace
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.School
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hayalnaft.attendance.AppState
import com.hayalnaft.attendance.util.Reports

/** Full-screen PIN pad shown when the app lock is on. */
@Composable
fun LockScreen(app: AppState) {
    var pin by remember { mutableStateOf("") }
    var wrong by remember { mutableStateOf(false) }
    val expected = app.prefs.pin

    fun press(d: String) {
        if (pin.length >= 8) return
        pin += d
        wrong = false
        if (pin == expected) {
            app.locked = false
        } else if (pin.length >= expected.length) {
            wrong = true
            pin = ""
        }
    }

    Surface(Modifier.fillMaxSize()) {
        Column(
            Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(NavyDark, Navy))).padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            SchoolLogo(app, 84.dp)
            Spacer(Modifier.height(14.dp))
            Text(app.schoolName(), color = Color.White, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Lock, null, tint = Gold, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp))
                Text(if (wrong) "الرمز غير صحيح، حاول مرة أخرى" else "أدخل الرمز السري", color = if (wrong) Color(0xFFFF8A80) else Color.White)
            }
            Spacer(Modifier.height(18.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                repeat(maxOf(4, expected.length)) { i ->
                    Box(Modifier.size(14.dp).clip(CircleShape).background(if (i < pin.length) Gold else Color.White.copy(alpha = 0.25f)))
                }
            }
            Spacer(Modifier.height(28.dp))
            val keys = listOf(listOf("1", "2", "3"), listOf("4", "5", "6"), listOf("7", "8", "9"), listOf("", "0", "⌫"))
            keys.forEach { row ->
                // Digits read left to right like a phone keypad, whatever the text direction.
                androidx.compose.runtime.CompositionLocalProvider(
                    androidx.compose.ui.platform.LocalLayoutDirection provides androidx.compose.ui.unit.LayoutDirection.Ltr,
                ) {
                    Row(horizontalArrangement = Arrangement.spacedBy(18.dp), modifier = Modifier.padding(vertical = 7.dp)) {
                        row.forEach { k ->
                            when (k) {
                                "" -> Spacer(Modifier.size(72.dp))
                                "⌫" -> IconButton(onClick = { pin = pin.dropLast(1) }, modifier = Modifier.size(72.dp)) {
                                    Icon(Icons.AutoMirrored.Filled.Backspace, "حذف", tint = Color.White)
                                }
                                else -> Surface(
                                    onClick = { press(k) },
                                    modifier = Modifier.size(72.dp),
                                    shape = CircleShape,
                                    color = Color.White.copy(alpha = 0.12f),
                                    contentColor = Color.White,
                                ) {
                                    Box(contentAlignment = Alignment.Center) { Text(k, fontSize = 28.sp, fontWeight = FontWeight.Bold) }
                                }
                            }
                        }
                    }
                }
            }
            Spacer(Modifier.height(10.dp))
            TextButton(onClick = { app.toast("إذا نسيت الرمز، يمكن إعادة ضبطه بحذف بيانات التطبيق من إعدادات الهاتف (تُحذف البيانات)") }) {
                Text("نسيت الرمز؟", color = Color.White.copy(alpha = 0.7f))
            }
        }
    }
}

/** The school logo chosen in settings, or the default cap icon on a gold circle. */
@Composable
fun SchoolLogo(app: AppState, size: androidx.compose.ui.unit.Dp) {
    val ctx = LocalContext.current
    val bitmap = remember(app.logoVersion) {
        Reports.logoFile(ctx).takeIf { it.exists() }?.let { BitmapFactory.decodeFile(it.path) }
    }
    Box(Modifier.size(size).clip(CircleShape).background(if (bitmap == null) Gold else Color.White), contentAlignment = Alignment.Center) {
        if (bitmap != null) {
            Image(bitmap.asImageBitmap(), "شعار المدرسة", contentScale = ContentScale.Crop, modifier = Modifier.size(size))
        } else {
            Icon(Icons.Filled.School, null, tint = NavyDark, modifier = Modifier.size(size * 0.56f))
        }
    }
}
