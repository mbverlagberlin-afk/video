package de.onemultimedia.oneclean.apps

import android.app.AppOpsManager
import android.app.usage.StorageStatsManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Process
import android.os.storage.StorageManager

data class AppEntry(
    val packageName: String,
    val label: String,
    /** 0 = in den letzten 12 Monaten nicht benutzt bzw. unbekannt */
    val lastUsed: Long,
    val lastUpdated: Long,
    val versionName: String,
    val size: Long
)

class AppScanner(private val context: Context) {

    private val pm: PackageManager = context.packageManager

    fun hasUsageAccess(): Boolean {
        val ops = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
        } else {
            @Suppress("DEPRECATION")
            ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
        }
        return mode == AppOpsManager.MODE_ALLOWED
    }

    /** Alle vom Nutzer installierten Apps (ohne OneClean selbst). */
    fun userApps(): List<AppEntry> {
        val lastUsedMap = lastUsedTimes()
        val stats = context.getSystemService(Context.STORAGE_STATS_SERVICE) as StorageStatsManager
        val user = Process.myUserHandle()

        @Suppress("DEPRECATION")
        val packages = pm.getInstalledPackages(0)
        return packages.mapNotNull { pkg ->
            val ai = pkg.applicationInfo ?: return@mapNotNull null
            val isSystem = ai.flags and ApplicationInfo.FLAG_SYSTEM != 0 &&
                ai.flags and ApplicationInfo.FLAG_UPDATED_SYSTEM_APP == 0
            if (isSystem || pkg.packageName == context.packageName) return@mapNotNull null
            val size = try {
                val s = stats.queryStatsForPackage(StorageManager.UUID_DEFAULT, pkg.packageName, user)
                s.appBytes + s.dataBytes + s.cacheBytes
            } catch (_: Exception) {
                0L
            }
            AppEntry(
                packageName = pkg.packageName,
                label = ai.loadLabel(pm).toString(),
                lastUsed = lastUsedMap[pkg.packageName] ?: 0L,
                lastUpdated = pkg.lastUpdateTime,
                versionName = pkg.versionName ?: "",
                size = size
            )
        }
    }

    fun unusedApps(days: Int): List<AppEntry> {
        val cutoff = System.currentTimeMillis() - days * 24L * 60 * 60 * 1000
        return userApps()
            .filter { it.lastUsed < cutoff && it.lastUpdated < cutoff }
            .sortedWith(compareBy<AppEntry> { it.lastUsed }.thenByDescending { it.size })
    }

    private fun lastUsedTimes(): Map<String, Long> {
        if (!hasUsageAccess()) return emptyMap()
        val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val end = System.currentTimeMillis()
        val begin = end - 365L * 24 * 60 * 60 * 1000
        return usm.queryAndAggregateUsageStats(begin, end).mapValues { it.value.lastTimeUsed }
    }

    fun uninstallIntent(packageName: String): Intent =
        Intent(Intent.ACTION_DELETE, Uri.parse("package:$packageName"))

    fun appSettingsIntent(packageName: String): Intent =
        Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))

    fun playStoreIntent(packageName: String): Intent =
        Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$packageName"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
}
