package de.onemultimedia.oneclean.storage

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.StatFs
import android.provider.DocumentsContract
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

/** Wo eine gefundene Datei liegt: direkter Dateipfad (Android 8–10) oder freigegebener Ordner (ab Android 11). */
sealed interface JunkTarget {
    data class LocalFile(val file: File) : JunkTarget
    data class Document(val uri: Uri) : JunkTarget
}

data class JunkItem(
    val key: String,
    val name: String,
    val location: String,
    val type: JunkType,
    val size: Long,
    val target: JunkTarget
)

data class StorageInfo(val total: Long, val free: Long) {
    val used: Long get() = total - free
}

/** Ein vom Nutzer freigegebener Ordner. */
data class ScanFolder(val uri: Uri, val name: String)

class StorageCleaner(private val context: Context) {

    private val largeLimit = 100L * 1024 * 1024
    private val tempExt = setOf("tmp", "temp", "bak", "old", "part", "crdownload")
    private val logExt = setOf("log", "trace", "dmp")

    /**
     * Ab Android 11 bekommen Play-Store-Apps keinen Vollzugriff mehr – dort wählt der Nutzer Ordner aus
     * (Storage Access Framework). Bis Android 10 reicht die normale Speicher-Berechtigung.
     */
    val usesFolderAccess: Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R

    fun legacyPermissions(): Array<String> =
        arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE)

    fun hasLegacyAccess(): Boolean = legacyPermissions().all {
        ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
    }

    fun storageInfo(): StorageInfo {
        val stat = StatFs(Environment.getDataDirectory().path)
        return StorageInfo(stat.totalBytes, stat.availableBytes)
    }

    // ---------- Freigegebene Ordner (ab Android 11) ----------

    fun folders(): List<ScanFolder> =
        context.contentResolver.persistedUriPermissions
            .filter { it.isReadPermission && it.isWritePermission && DocumentsContract.isTreeUri(it.uri) }
            .map { ScanFolder(it.uri, folderName(it.uri)) }
            .sortedBy { it.name.lowercase() }

    fun addFolder(uri: Uri) {
        context.contentResolver.takePersistableUriPermission(
            uri, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
        )
    }

    fun removeFolder(uri: Uri) {
        runCatching {
            context.contentResolver.releasePersistableUriPermission(
                uri, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            )
        }
    }

    private fun folderName(tree: Uri): String {
        // Dokument-ID z. B. "primary:DCIM/Camera" -> "DCIM/Camera"
        val id = runCatching { DocumentsContract.getTreeDocumentId(tree) }.getOrDefault("")
        val path = id.substringAfter(':', id)
        return path.ifBlank { "Speicher" }
    }

    // ---------- Scannen ----------

    fun scan(): List<JunkItem> {
        val items = mutableListOf<JunkItem>()
        if (usesFolderAccess) {
            for (folder in folders()) {
                val rootId = runCatching { DocumentsContract.getTreeDocumentId(folder.uri) }.getOrNull() ?: continue
                walkDocuments(folder.uri, rootId, folder.name, 0, items)
            }
        } else {
            val root = Environment.getExternalStorageDirectory()
            walkFiles(root, root, 0, items)
        }
        return items
            .distinctBy { it.key }
            .sortedWith(compareBy<JunkItem> { it.type.ordinal }.thenByDescending { it.size })
    }

    private fun classify(name: String, size: Long, inThumbs: Boolean): JunkType? {
        val ext = name.substringAfterLast('.', "").lowercase()
        return when {
            inThumbs -> JunkType.THUMBS
            ext == "apk" -> JunkType.APK
            ext in tempExt || name.startsWith("~") -> JunkType.TEMP
            ext in logExt -> JunkType.LOG
            size >= largeLimit -> JunkType.LARGE
            else -> null
        }
    }

    private fun walkFiles(root: File, dir: File, depth: Int, out: MutableList<JunkItem>) {
        if (depth > 14) return
        val androidDir = File(root, "Android").absolutePath
        if (dir.absolutePath == androidDir || dir.absolutePath.startsWith("$androidDir/")) return
        val children = dir.listFiles() ?: return

        if (depth > 0 && children.isEmpty()) {
            out += JunkItem(dir.absolutePath, dir.name, dir.parent ?: "", JunkType.EMPTY_DIR, 0, JunkTarget.LocalFile(dir))
            return
        }
        val inThumbs = dir.name.equals(".thumbnails", ignoreCase = true)
        for (f in children) {
            if (f.isDirectory) {
                walkFiles(root, f, depth + 1, out)
                continue
            }
            val size = f.length()
            val type = classify(f.name, size, inThumbs) ?: continue
            out += JunkItem(f.absolutePath, f.name, f.parent ?: "", type, size, JunkTarget.LocalFile(f))
        }
    }

    private fun walkDocuments(tree: Uri, docId: String, path: String, depth: Int, out: MutableList<JunkItem>) {
        if (depth > 14) return
        val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(tree, docId)
        val projection = arrayOf(
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
            DocumentsContract.Document.COLUMN_SIZE
        )
        data class Child(val id: String, val name: String, val isDir: Boolean, val size: Long)

        val children = mutableListOf<Child>()
        runCatching {
            context.contentResolver.query(childrenUri, projection, null, null, null)?.use { c ->
                while (c.moveToNext()) {
                    children += Child(
                        id = c.getString(0),
                        name = c.getString(1) ?: "",
                        isDir = c.getString(2) == DocumentsContract.Document.MIME_TYPE_DIR,
                        size = if (c.isNull(3)) 0L else c.getLong(3)
                    )
                }
            }
        }.onFailure { return }

        if (depth > 0 && children.isEmpty()) {
            val name = path.substringAfterLast('/')
            out += JunkItem(
                key = docId,
                name = name,
                location = path.substringBeforeLast('/', ""),
                type = JunkType.EMPTY_DIR,
                size = 0,
                target = JunkTarget.Document(DocumentsContract.buildDocumentUriUsingTree(tree, docId))
            )
            return
        }
        val inThumbs = path.substringAfterLast('/').equals(".thumbnails", ignoreCase = true)
        for (child in children) {
            if (child.isDir) {
                walkDocuments(tree, child.id, "$path/${child.name}", depth + 1, out)
                continue
            }
            val type = classify(child.name, child.size, inThumbs) ?: continue
            out += JunkItem(
                key = child.id,
                name = child.name,
                location = path,
                type = type,
                size = child.size,
                target = JunkTarget.Document(DocumentsContract.buildDocumentUriUsingTree(tree, child.id))
            )
        }
    }

    // ---------- Löschen ----------

    /** Leert den eigenen Cache von OneClean. */
    fun clearOwnCache(): Long {
        val size = context.cacheDir.walkBottomUp().filter { it.isFile }.sumOf { it.length() }
        context.cacheDir.listFiles()?.forEach { it.deleteRecursively() }
        return size
    }

    /** Löscht die Einträge und gibt die Schlüssel der erfolgreich gelöschten zurück. */
    fun delete(items: Collection<JunkItem>): Set<String> {
        val deleted = mutableSetOf<String>()
        for (item in items) {
            val ok = when (val t = item.target) {
                is JunkTarget.LocalFile ->
                    if (item.type == JunkType.EMPTY_DIR) t.file.listFiles()?.isEmpty() == true && t.file.delete()
                    else t.file.delete()
                is JunkTarget.Document ->
                    runCatching { DocumentsContract.deleteDocument(context.contentResolver, t.uri) }.getOrDefault(false)
            }
            if (ok) deleted += item.key
        }
        return deleted
    }
}
