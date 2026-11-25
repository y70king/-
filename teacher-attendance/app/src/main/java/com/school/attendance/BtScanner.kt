package com.school.attendance

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Handler
import android.os.Looper

/**
 * دورة فحص وحدة، تشتغل بثلاث طرق سوية:
 *  1) بحث بلوتوث عادي (Classic): يلكه الأجهزة الظاهرة للبحث.
 *  2) فحص BLE: يلكه الأجهزة اللي تبث BLE (والمربوطة يتعرف عليها حتى لو عنوانها عشوائي).
 *  3) "نكز" الأجهزة المربوطة (Paired) للمدرسين واحد واحد: إذا الجهاز قريب والبلوتوث مالته شغال
 *     يصير اتصال قصير (ACL) فنعرف إنه موجود، حتى لو مو ظاهر للبحث. ما يحتاج أي تطبيق على جهاز المدرس.
 */
@SuppressLint("MissingPermission")
class BtScanner(private val ctx: Context, private val listener: Listener) {

    interface Listener {
        fun onDevice(address: String, name: String?, rssi: Int, classic: Boolean)
        fun onFinished()
    }

    private enum class Phase { IDLE, DISCOVERY, PROBE }

    private val adapter: BluetoothAdapter? = ctx.getSystemService(BluetoothManager::class.java)?.adapter
    private val handler = Handler(Looper.getMainLooper())
    private var phase = Phase.IDLE
    private var probeTargets: Set<String> = emptySet()
    private val seen = HashSet<String>()
    private val queue = ArrayDeque<BluetoothDevice>()
    private var probing: BluetoothDevice? = null
    private var leRunning = false
    private var registered = false

    val isRunning get() = phase != Phase.IDLE

    private val discoveryTimeout = Runnable { startProbing() }
    private val probeTimeout = Runnable { nextProbe() }

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context, i: Intent) {
            when (i.action) {
                BluetoothDevice.ACTION_FOUND -> {
                    val d = i.device() ?: return
                    val rssi = i.getShortExtra(BluetoothDevice.EXTRA_RSSI, Short.MIN_VALUE).toInt()
                    report(d.address, i.getStringExtra(BluetoothDevice.EXTRA_NAME) ?: safeName(d), rssi, true)
                }
                BluetoothAdapter.ACTION_DISCOVERY_FINISHED -> if (phase == Phase.DISCOVERY) startProbing()
                BluetoothDevice.ACTION_ACL_CONNECTED -> {
                    val d = i.device() ?: return
                    report(d.address, safeName(d), 0, true)
                    if (phase == Phase.PROBE && probing?.address == d.address) nextProbe()
                }
            }
        }
    }

    private val leCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, r: ScanResult) {
            report(r.device.address, r.scanRecord?.deviceName ?: safeName(r.device), r.rssi, false)
        }
        override fun onBatchScanResults(results: MutableList<ScanResult>) {
            results.forEach { onScanResult(0, it) }
        }
    }

    /** @param probeAddresses عناوين أجهزة المدرسين اللي نريد نتأكد منها بالنكز. */
    fun start(probeAddresses: Set<String>) {
        if (isRunning) return
        val a = adapter
        if (a == null || !a.isEnabled) { listener.onFinished(); return }
        probeTargets = probeAddresses.map { it.uppercase() }.toSet()
        seen.clear()

        val f = IntentFilter().apply {
            addAction(BluetoothDevice.ACTION_FOUND)
            addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED)
            addAction(BluetoothDevice.ACTION_ACL_CONNECTED)
        }
        if (Build.VERSION.SDK_INT >= 33) ctx.registerReceiver(receiver, f, Context.RECEIVER_EXPORTED)
        else ctx.registerReceiver(receiver, f)
        registered = true

        try {
            a.bluetoothLeScanner?.startScan(
                null, ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(), leCallback
            )
            leRunning = true
        } catch (_: Exception) { }

        phase = Phase.DISCOVERY
        if (a.isDiscovering) a.cancelDiscovery()
        if (!a.startDiscovery()) { startProbing(); return }
        handler.postDelayed(discoveryTimeout, 15_000)
    }

    fun cancel() {
        if (!isRunning) return
        try { adapter?.cancelDiscovery() } catch (_: Exception) { }
        finish(notify = false)
    }

    private fun startProbing() {
        if (phase != Phase.DISCOVERY) return
        phase = Phase.PROBE
        handler.removeCallbacks(discoveryTimeout)
        try { adapter?.cancelDiscovery() } catch (_: Exception) { }
        queue.clear()
        val bonded = try { adapter?.bondedDevices.orEmpty() } catch (_: Exception) { emptySet() }
        bonded.filter { it.address.uppercase() in probeTargets && it.address.uppercase() !in seen }
            .forEach { queue.addLast(it) }
        nextProbe()
    }

    private fun nextProbe() {
        handler.removeCallbacks(probeTimeout)
        if (phase != Phase.PROBE) return
        var d = queue.removeFirstOrNull()
        while (d != null && d.address.uppercase() in seen) d = queue.removeFirstOrNull()
        probing = d
        if (d == null) { finish(notify = true); return }
        try { d.fetchUuidsWithSdp() } catch (_: Exception) { }
        handler.postDelayed(probeTimeout, 7_000)
    }

    private fun finish(notify: Boolean) {
        phase = Phase.IDLE
        probing = null
        handler.removeCallbacks(discoveryTimeout)
        handler.removeCallbacks(probeTimeout)
        if (leRunning) {
            try { adapter?.bluetoothLeScanner?.stopScan(leCallback) } catch (_: Exception) { }
            leRunning = false
        }
        if (registered) {
            try { ctx.unregisterReceiver(receiver) } catch (_: Exception) { }
            registered = false
        }
        if (notify) listener.onFinished()
    }

    private fun report(address: String, name: String?, rssi: Int, classic: Boolean) {
        if (phase == Phase.IDLE) return
        seen.add(address.uppercase())
        listener.onDevice(address.uppercase(), name, rssi, classic)
    }

    private fun safeName(d: BluetoothDevice): String? = try { d.name } catch (_: Exception) { null }

    private fun Intent.device(): BluetoothDevice? =
        if (Build.VERSION.SDK_INT >= 33) getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
        else @Suppress("DEPRECATION") getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
}
