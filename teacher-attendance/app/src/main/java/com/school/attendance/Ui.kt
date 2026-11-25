package com.school.attendance

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

fun Context.dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

fun Context.vbox(): LinearLayout = LinearLayout(this).apply {
    orientation = LinearLayout.VERTICAL
    layoutDirection = View.LAYOUT_DIRECTION_RTL
}

fun Context.hbox(): LinearLayout = LinearLayout(this).apply {
    orientation = LinearLayout.HORIZONTAL
    layoutDirection = View.LAYOUT_DIRECTION_RTL
}

fun Context.text(s: String, size: Float = 16f, bold: Boolean = false, color: Int = Color.parseColor("#212121")) =
    TextView(this).apply {
        text = s
        textSize = size
        setTextColor(color)
        if (bold) setTypeface(typeface, Typeface.BOLD)
        textDirection = View.TEXT_DIRECTION_RTL
        gravity = Gravity.START
    }

fun Context.button(s: String, onClick: () -> Unit) = Button(this).apply {
    text = s
    isAllCaps = false
    setOnClickListener { onClick() }
}

/** صف بخلفية ملونة (للحاضر/المتأخر/الغائب). */
fun Context.card(bg: String): LinearLayout = vbox().apply {
    setPadding(dp(12), dp(10), dp(12), dp(10))
    background = GradientDrawable().apply {
        setColor(Color.parseColor(bg))
        cornerRadius = dp(10).toFloat()
    }
    layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
    ).apply { bottomMargin = dp(8) }
}

fun weighted() = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
