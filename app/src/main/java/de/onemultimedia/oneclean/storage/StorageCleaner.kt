package de.onemultimedia.oneclean.storage

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Environment
import android.os.StatFs
import androidx.core.content.ContextCompat
import java.io.File

enum class JunkType(val label: String, val preselected: Boolean) {
    APK("Installationsdateien (APK)", true),
    TEMP("Temporäre Dateien", true),
    LOG("Log-Dateien", true),
    THUMBS("Vorschaubilder-Cache", true),
    EMPTY_DIR("Leere Ordner", true),
    LARGE("Große Dateien (über 100 MB) – bitte prüfen", false)
}

data class JunkItem(val file: File, val type: JunkType, val size: Long)

data class StorageInfo(val total: Long, val free: Long) {
    val used: Long get() = total - free
}

class StorageCleaner(private val context: Context) {

    private val root: File = Environment.getExternalStorageDirectory()
    private val largeLimit = 100L * 1024 * 1024
    private val tempExt = setOf("tmp", "temp", "bak", "old", "part", "crdownload")
    private val logExt = setOf("log", "trace", "dmp")

    fun hasAccess(): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Environment.isExternalStorageManager()
        } else {
            ContextCompat.checkSelfPermission(
                context, Manifest.permission.WRITE_EXTERNAL_STORAGE
            ) == PackageManager.PERMISSION_GRANTED
        }

    fun storageInfo(): StorageInfo {
        val stat = StatFs(Environment.getDataDirectory().path)
        return StorageInfo(stat.totalBytes, stat.availableBytes)
    }

    fun scan(): List<JunkItem> {
        val items = mutableListOf<JunkItem>()
        walk(root, 0, items)
        return items.sortedWith(compareBy<JunkItem> { it.type.ordinal }.thenByDescending { it.size })
    }

    private fun walk(dir: File, depth: Int, out: MutableList<JunkItem>) {
        if (depth > 14) return
        // Android/data und Android/obb sind ab Android 11 gesperrt und enthalten App-Daten
        val androidDir = File(root, "Android").absolutePath
        if (dir.absolutePath == androidDir || dir.absolutePath.startsWith("$androidDir/")) return
        val children = dir.listFiles() ?: return

        if (depth > 0 && children.isEmpty()) {
            out += JunkItem(dir, JunkType.EMPTY_DIR, 0)
            return
        }
        val inThumbs = dir.name.equals(".thumbnails", ignoreCase = true)

        for (f in children) {
            if (f.isDirectory) {
                walk(f, depth + 1, out)
                continue
            }
            val ext = f.extension.lowercase()
            val size = f.length()
            val type = when {
                inThumbs -> JunkType.THUMBS
                ext == "apk" -> JunkType.APK
                ext in tempExt || f.name.startsWith("~") -> JunkType.TEMP
                ext in logExt -> JunkType.LOG
                size >= largeLimit -> JunkType.LARGE
                else -> null
            }
            if (type != null) out += JunkItem(f, type, size)
        }
    }

    /** Leert den eigenen Cache von OneClean. */
    fun clearOwnCache(): Long {
        val size = context.cacheDir.walkBottomUp().filter { it.isFile }.sumOf { it.length() }
        context.cacheDir.listFiles()?.forEach { it.deleteRecursively() }
        return size
    }

    /** Löscht die Einträge und gibt die frei gewordene Größe zurück. */
    fun delete(items: Collection<JunkItem>): Long {
        var freed = 0L
        for (item in items) {
            val ok = if (item.type == JunkType.EMPTY_DIR) {
                item.file.listFiles()?.isEmpty() == true && item.file.delete()
            } else {
                item.file.delete()
            }
            if (ok) freed += item.size
        }
        return freed
    }
}
