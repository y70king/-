package com.school.attendance

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager

/** خدمة الفحص: كل عمليات الفحص (يدوي أو تلقائي) تمر من هنا وتسجل الحضور بقاعدة البيانات. */
class ScanService : Service(), BtScanner.Listener {

    companion object {
        const val ACTION_ONCE = "com.school.attendance.ONCE"
        const val ACTION_AUTO_START = "com.school.attendance.AUTO_START"
        const val ACTION_AUTO_STOP = "com.school.attendance.AUTO_STOP"
        const val BROADCAST_UPDATED = "com.school.attendance.UPDATED"
        private const val CHANNEL = "scan"
        private const val NOTIF_ID = 1

        @Volatile var autoMode = false; private set
        @Volatile var scanning = false; private set
        /** توكف الفحص التلقائي مؤقتاً (مثلاً أثناء تسجيل مدرس جديد). */
        @Volatile var paused = false

        fun send(ctx: Context, action: String) {
            val i = Intent(ctx, ScanService::class.java).setAction(action)
            if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i) else ctx.startService(i)
        }
    }

    private lateinit var scanner: BtScanner
    private val handler = Handler(Looper.getMainLooper())
    private var wakeLock: PowerManager.WakeLock? = null
    private var teachersByAddr: Map<String, Teacher> = emptyMap()
    private val markedThisCycle = HashSet<Long>()
    private val cycle = Runnable { runCycle() }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        scanner = BtScanner(this, this)
        if (Build.VERSION.SDK_INT >= 26) {
            getSystemService(NotificationManager::class.java).createNotificationChannel(
                NotificationChannel(CHANNEL, "فحص الحضور", NotificationManager.IMPORTANCE_LOW)
            )
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        goForeground("جاهز")
        when (intent?.action) {
            ACTION_AUTO_START -> {
                autoMode = true
                Prefs.setAutoMode(this, true)
                acquireWakeLock()
                handler.removeCallbacks(cycle)
                runCycle()
            }
            ACTION_AUTO_STOP -> {
                autoMode = false
                Prefs.setAutoMode(this, false)
                handler.removeCallbacks(cycle)
                if (!scanning) shutdown()
            }
            ACTION_ONCE -> runCycle()
            null -> { // النظام أعاد تشغيل الخدمة بعد ما سكّرها
                if (Prefs.autoMode(this)) {
                    autoMode = true
                    acquireWakeLock()
                    runCycle()
                } else shutdown()
            }
        }
        notifyUi()
        return START_STICKY
    }

    private fun runCycle() {
        if (scanning) return
        if (paused || !Perms.hasRequired(this)) { scheduleNextOrStop(); return }
        teachersByAddr = Db.get(this).teachers().associateBy { it.address.uppercase() }
        markedThisCycle.clear()
        scanning = true
        goForeground("جارٍ الفحص…")
        notifyUi()
        scanner.start(teachersByAddr.keys)
    }

    override fun onDevice(address: String, name: String?, rssi: Int, classic: Boolean) {
        val t = teachersByAddr[address] ?: return
        if (!markedThisCycle.add(t.id)) return
        val now = System.currentTimeMillis()
        Db.get(this).markSeen(t.id, Clock.day(now), now)
        notifyUi()
    }

    override fun onFinished() {
        scanning = false
        val db = Db.get(this)
        val total = db.teachers().size
        val present = db.recordsForDay(Clock.day()).size
        goForeground("آخر فحص ${Clock.hm(System.currentTimeMillis())} — حاضر $present من $total")
        notifyUi()
        scheduleNextOrStop()
    }

    private fun scheduleNextOrStop() {
        if (autoMode) {
            handler.removeCallbacks(cycle)
            handler.postDelayed(cycle, Prefs.intervalMin(this) * 60_000L)
        } else shutdown()
    }

    private fun shutdown() {
        handler.removeCallbacks(cycle)
        releaseWakeLock()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        scanner.cancel()
        scanning = false
        handler.removeCallbacksAndMessages(null)
        releaseWakeLock()
        notifyUi()
        super.onDestroy()
    }

    private fun notifyUi() = sendBroadcast(Intent(BROADCAST_UPDATED).setPackage(packageName))

    private fun goForeground(text: String) {
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE
        )
        val b = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL)
        else @Suppress("DEPRECATION") Notification.Builder(this)
        val n = b.setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
            .setContentTitle(if (autoMode) "الفحص التلقائي شغال" else "حضور المدرسين")
            .setContentText(text)
            .setContentIntent(open)
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
        else startForeground(NOTIF_ID, n)
    }

    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return
        wakeLock = getSystemService(PowerManager::class.java)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "attendance:scan")
            .apply { acquire(14 * 60 * 60 * 1000L) } // أقصى شي يوم دوام كامل
    }

    private fun releaseWakeLock() {
        wakeLock?.let { if (it.isHeld) it.release() }
        wakeLock = null
    }
}
