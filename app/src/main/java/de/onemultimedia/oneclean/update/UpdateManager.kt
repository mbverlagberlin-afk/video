package de.onemultimedia.oneclean.update

import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Environment
import android.provider.Settings
import androidx.core.content.FileProvider
import de.onemultimedia.oneclean.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

data class ReleaseInfo(
    val version: String,
    val notes: String,
    val apkUrl: String?,
    val pageUrl: String
)

sealed interface DownloadState {
    data class Running(val progress: Float) : DownloadState
    data class Done(val file: File) : DownloadState
    data class Failed(val reason: String) : DownloadState
}

/**
 * Selbst-Update über GitHub Releases: Jeder Tag "v1.2.3" mit angehängter APK wird als neue Version erkannt.
 */
class UpdateManager(private val context: Context) {

    val currentVersion: String = BuildConfig.VERSION_NAME
    private val apiUrl = "https://api.github.com/repos/${BuildConfig.UPDATE_REPO}/releases/latest"
    private val apkFile: File
        get() = File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "OneClean-update.apk")

    suspend fun fetchLatest(): ReleaseInfo = withContext(Dispatchers.IO) {
        val conn = (URL(apiUrl).openConnection() as HttpURLConnection).apply {
            connectTimeout = 10_000
            readTimeout = 15_000
            setRequestProperty("Accept", "application/vnd.github+json")
            setRequestProperty("User-Agent", "OneClean/$currentVersion")
        }
        try {
            when (conn.responseCode) {
                200 -> Unit
                404 -> error("Noch keine Version veröffentlicht")
                else -> error("Server antwortet mit Code ${conn.responseCode}")
            }
            val json = JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
            val assets = json.optJSONArray("assets")
            var apk: String? = null
            if (assets != null) {
                for (i in 0 until assets.length()) {
                    val url = assets.getJSONObject(i).optString("browser_download_url")
                    if (url.endsWith(".apk", ignoreCase = true)) {
                        apk = url
                        break
                    }
                }
            }
            ReleaseInfo(
                version = json.optString("tag_name").removePrefix("v").removePrefix("V"),
                notes = json.optString("body"),
                apkUrl = apk,
                pageUrl = json.optString("html_url")
            )
        } finally {
            conn.disconnect()
        }
    }

    fun isNewer(remote: String, local: String = currentVersion): Boolean {
        fun parts(v: String) = v.substringBefore('-').split('.').map { it.toIntOrNull() ?: 0 }
        val r = parts(remote)
        val l = parts(local)
        for (i in 0 until maxOf(r.size, l.size)) {
            val a = r.getOrElse(i) { 0 }
            val b = l.getOrElse(i) { 0 }
            if (a != b) return a > b
        }
        // gleiche Nummer: Release ist neuer als eine Entwicklerversion (z. B. 1.2.0-dev)
        return local.contains('-') && !remote.contains('-')
    }

    /** Lädt die APK herunter und meldet den Fortschritt. */
    suspend fun download(info: ReleaseInfo, onState: (DownloadState) -> Unit) {
        val url = info.apkUrl ?: run {
            onState(DownloadState.Failed("Diese Version enthält keine APK-Datei"))
            return
        }
        val target = apkFile
        target.parentFile?.mkdirs()
        if (target.exists()) target.delete()

        val dm = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        val request = DownloadManager.Request(Uri.parse(url))
            .setTitle("OneClean ${info.version}")
            .setDescription("Update wird heruntergeladen")
            .setMimeType("application/vnd.android.package-archive")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
            .setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, target.name)
        val id = dm.enqueue(request)

        onState(DownloadState.Running(0f))
        while (true) {
            delay(500)
            val state = withContext(Dispatchers.IO) {
                dm.query(DownloadManager.Query().setFilterById(id))?.use { c ->
                    if (!c.moveToFirst()) return@use DownloadState.Failed("Download abgebrochen")
                    val status = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
                    val done = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
                    val total = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
                    when (status) {
                        DownloadManager.STATUS_SUCCESSFUL -> DownloadState.Done(target)
                        DownloadManager.STATUS_FAILED -> DownloadState.Failed("Download fehlgeschlagen")
                        else -> DownloadState.Running(if (total > 0) done.toFloat() / total else 0f)
                    }
                } ?: DownloadState.Failed("Download nicht gefunden")
            }
            onState(state)
            if (state !is DownloadState.Running) return
        }
    }

    fun canInstall(): Boolean = context.packageManager.canRequestPackageInstalls()

    fun unknownSourcesIntent(): Intent =
        Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))

    fun installIntent(file: File): Intent {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        return Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
    }

    /** Öffnet die System-Update-Seite (Hersteller-abhängig, mit Fallback). */
    fun systemUpdateIntents(): List<Intent> = listOf(
        Intent("android.settings.SYSTEM_UPDATE_SETTINGS"),
        Intent(Settings.ACTION_DEVICE_INFO_SETTINGS),
        Intent(Settings.ACTION_SETTINGS)
    ).map { it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }

    fun playStoreIntent(): Intent? =
        context.packageManager.getLaunchIntentForPackage("com.android.vending")
            ?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
}
