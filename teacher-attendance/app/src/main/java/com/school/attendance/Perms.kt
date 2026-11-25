package com.school.attendance

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.Build

object Perms {
    /** الصلاحيات اللازمة حتى يشتغل الفحص. */
    fun required(): Array<String> =
        if (Build.VERSION.SDK_INT >= 31) arrayOf(
            Manifest.permission.BLUETOOTH_SCAN,
            Manifest.permission.BLUETOOTH_CONNECT,
            Manifest.permission.ACCESS_FINE_LOCATION,
        ) else arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)

    /** صلاحيات نطلبها ويانا بس التطبيق يشتغل بدونها. */
    fun optional(): Array<String> =
        if (Build.VERSION.SDK_INT >= 33) arrayOf(Manifest.permission.POST_NOTIFICATIONS) else emptyArray()

    fun missing(ctx: Context, perms: Array<String>): List<String> =
        perms.filter { ctx.checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }

    fun hasRequired(ctx: Context) = missing(ctx, required()).isEmpty()

    fun locationOn(ctx: Context): Boolean {
        val lm = ctx.getSystemService(LocationManager::class.java) ?: return true
        return if (Build.VERSION.SDK_INT >= 28) lm.isLocationEnabled
        else lm.isProviderEnabled(LocationManager.GPS_PROVIDER) || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
    }
}
