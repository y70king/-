package com.hayalnaft.attendance

import android.app.AlarmManager
import android.app.KeyguardManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Alarm
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.hayalnaft.attendance.data.Period
import com.hayalnaft.attendance.ui.AppTheme
import com.hayalnaft.attendance.ui.Gold
import com.hayalnaft.attendance.ui.Navy
import com.hayalnaft.attendance.ui.NavyDark
import com.hayalnaft.attendance.util.Dates
import com.hayalnaft.attendance.util.Prefs
import java.util.Calendar

/** Rings before each lesson of the weekly timetable. Only the next alarm is scheduled at any time. */
object Alarms {
    const val EXTRA_PERIOD = "period_id"
    const val EXTRA_CLASS = "class_id"
    const val EXTRA_SUBJECT = "subject_id"
    const val EXTRA_SCHOOL = "school_id"
    private const val ACTION_DISMISS = "com.hayalnaft.attendance.DISMISS_ALARM"
    private const val CHANNEL = "lesson_alarm"
    private const val NOTIFICATION_ID = 7001

    /** Week days in the Iraqi order, as [Calendar.DAY_OF_WEEK] values with their names. */
    val weekDays = listOf(
        Calendar.SATURDAY to "السبت",
        Calendar.SUNDAY to "الأحد",
        Calendar.MONDAY to "الاثنين",
        Calendar.TUESDAY to "الثلاثاء",
        Calendar.WEDNESDAY to "الأربعاء",
        Calendar.THURSDAY to "الخميس",
        Calendar.FRIDAY to "الجمعة",
    )

    fun dayName(day: Int) = weekDays.firstOrNull { it.first == day }?.second ?: ""

    /** The next period whose alarm time (start minus [leadMinutes]) is after [now], with that time. */
    fun next(periods: List<Period>, now: Calendar, leadMinutes: Int): Pair<Period, Long>? {
        var best: Pair<Period, Long>? = null
        for (p in periods) {
            for (week in 0..1) {
                val c = (now.clone() as Calendar).apply {
                    set(Calendar.HOUR_OF_DAY, 0)
                    set(Calendar.MINUTE, 0)
                    set(Calendar.SECOND, 0)
                    set(Calendar.MILLISECOND, 0)
                    val diff = (p.day - get(Calendar.DAY_OF_WEEK) + 7) % 7 + week * 7
                    add(Calendar.DAY_OF_YEAR, diff)
                    add(Calendar.MINUTE, p.startMin - leadMinutes)
                }
                if (c.timeInMillis > now.timeInMillis) {
                    if (best == null || c.timeInMillis < best.second) best = p to c.timeInMillis
                    break
                }
            }
        }
        return best
    }

    private fun alarmIntent(context: Context, periodId: Long) = PendingIntent.getBroadcast(
        context, 0,
        Intent(context, AlarmReceiver::class.java).putExtra(EXTRA_PERIOD, periodId),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    fun reschedule(context: Context) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        am.cancel(alarmIntent(context, 0))
        val prefs = Prefs(context)
        if (!prefs.alarmsEnabled) return
        val app = (context.applicationContext as App).state
        val now = Calendar.getInstance().apply { add(Calendar.SECOND, 30) }
        val (period, at) = next(app.db.allPeriods(), now, prefs.alarmLead) ?: return
        val pi = alarmIntent(context, period.id)
        val canExact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()
        if (canExact) {
            val show = PendingIntent.getActivity(
                context, 1, Intent(context, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE,
            )
            am.setAlarmClock(AlarmManager.AlarmClockInfo(at, show), pi)
        } else {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        }
    }

    private fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        val nm = context.getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CHANNEL) != null) return
        val ch = NotificationChannel(CHANNEL, "منبه الحصص", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "يرن قبل موعد كل حصة"
            setSound(
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
                AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build(),
            )
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 800, 400, 800)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        }
        nm.createNotificationChannel(ch)
    }

    fun attendanceIntent(context: Context, p: Period) = Intent(context, MainActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        .putExtra(EXTRA_SCHOOL, p.schoolId)
        .putExtra(EXTRA_CLASS, p.classId)
        .putExtra(EXTRA_SUBJECT, p.subjectId)

    fun ring(context: Context, p: Period) {
        ensureChannel(context)
        val full = PendingIntent.getActivity(
            context, 2, Intent(context, AlarmActivity::class.java).putExtra(EXTRA_PERIOD, p.id)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val take = PendingIntent.getActivity(
            context, 3, attendanceIntent(context, p), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val dismiss = PendingIntent.getBroadcast(
            context, 4, Intent(context, AlarmReceiver::class.java).setAction(ACTION_DISMISS), PendingIntent.FLAG_IMMUTABLE,
        )
        val n = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle("حان موعد حصة ${p.subjectName}")
            .setContentText("${p.classTitle} • الساعة ${Dates.clock(p.startMin)}")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM), android.media.AudioManager.STREAM_ALARM)
            .setVibrate(longArrayOf(0, 800, 400, 800))
            .setFullScreenIntent(full, true)
            .setContentIntent(take)
            .setAutoCancel(true)
            .setTimeoutAfter(3 * 60_000L)
            .addAction(0, "أخذ الحضور", take)
            .addAction(0, "إيقاف", dismiss)
            .build()
        n.flags = n.flags or Notification.FLAG_INSISTENT
        try {
            NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, n)
        } catch (e: SecurityException) {
            // Notifications not allowed; the full-screen activity cannot be shown either.
        }
    }

    fun stop(context: Context) = NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)

    internal fun isDismiss(intent: Intent) = intent.action == ACTION_DISMISS
}

class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (Alarms.isDismiss(intent)) {
            Alarms.stop(context)
            return
        }
        val app = (context.applicationContext as App).state
        val id = intent.getLongExtra(Alarms.EXTRA_PERIOD, 0)
        app.db.period(id)?.let { Alarms.ring(context, it) }
        Alarms.reschedule(context)
    }
}

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        Alarms.reschedule(context)
    }
}

/** Full-screen alarm shown over the lock screen when a lesson is about to start. */
class AlarmActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            (getSystemService(KEYGUARD_SERVICE) as KeyguardManager).requestDismissKeyguard(this, null)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                    WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD,
            )
        }
        val app = (application as App).state
        val period = app.db.period(intent.getLongExtra(Alarms.EXTRA_PERIOD, 0))
        if (period == null) {
            finish()
            return
        }
        setContent {
            AppTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Column(
                        Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(NavyDark, Navy))).padding(32.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                    ) {
                        Icon(Icons.Filled.Alarm, null, tint = Gold, modifier = Modifier.size(96.dp))
                        Spacer(Modifier.height(24.dp))
                        Text("حان موعد الحصة", color = Color.White, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(12.dp))
                        Text(period.subjectName, color = Gold, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                        Text(period.classTitle, color = Color.White, style = MaterialTheme.typography.titleLarge)
                        Text(
                            "${Alarms.dayName(period.day)} • ${Dates.clock(period.startMin)} • ${period.duration} دقيقة",
                            color = Color.White.copy(alpha = 0.8f),
                            textAlign = TextAlign.Center,
                        )
                        Spacer(Modifier.height(40.dp))
                        Button(
                            onClick = {
                                Alarms.stop(this@AlarmActivity)
                                startActivity(Alarms.attendanceIntent(this@AlarmActivity, period))
                                finish()
                            },
                            modifier = Modifier.fillMaxWidth().height(56.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Gold, contentColor = NavyDark),
                        ) { Text("أخذ الحضور الآن", fontWeight = FontWeight.Bold) }
                        Spacer(Modifier.height(12.dp))
                        OutlinedButton(
                            onClick = {
                                Alarms.stop(this@AlarmActivity)
                                finish()
                            },
                            modifier = Modifier.fillMaxWidth().height(52.dp),
                        ) { Text("إيقاف المنبه", color = Color.White) }
                    }
                }
            }
        }
    }
}
