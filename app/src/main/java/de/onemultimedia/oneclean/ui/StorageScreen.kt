package de.onemultimedia.oneclean.ui

import android.app.DownloadManager
import android.content.Intent
import android.os.storage.StorageManager
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import de.onemultimedia.oneclean.billing.FreeLimits
import de.onemultimedia.oneclean.storage.JunkItem
import de.onemultimedia.oneclean.storage.ScanFolder
import de.onemultimedia.oneclean.storage.StorageCleaner
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun StorageScreen(onOpenPro: () -> Unit) {
    val context = LocalContext.current
    val cleaner = remember { StorageCleaner(context) }
    val scope = rememberCoroutineScope()
    val pro = isPro()

    var legacyGranted by remember { mutableStateOf(cleaner.hasLegacyAccess()) }
    var folders by remember { mutableStateOf<List<ScanFolder>>(if (cleaner.usesFolderAccess) cleaner.folders() else emptyList()) }
    val permLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { legacyGranted = cleaner.hasLegacyAccess() }
    val folderLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
        if (uri != null) {
            runCatching { cleaner.addFolder(uri) }
            folders = cleaner.folders()
        }
    }

    var info by remember { mutableStateOf(cleaner.storageInfo()) }
    var loading by remember { mutableStateOf(false) }
    var junk by remember { mutableStateOf<List<JunkItem>>(emptyList()) }
    var selected by remember { mutableStateOf<Set<String>>(emptySet()) }
    var message by remember { mutableStateOf<String?>(null) }
    var confirm by remember { mutableStateOf(false) }
    var limitDialog by remember { mutableStateOf(false) }

    val selectedItems = junk.filter { it.key in selected }
    val selectedSize = selectedItems.sumOf { it.size }
    val canScan = if (cleaner.usesFolderAccess) folders.isNotEmpty() else legacyGranted

    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Speicher bereinigen", style = MaterialTheme.typography.headlineSmall)

        LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            item(key = "info") {
                SectionCard("Gerätespeicher") {
                    LinearProgressIndicator(
                        progress = { if (info.total > 0) info.used.toFloat() / info.total else 0f },
                        modifier = Modifier.fillMaxWidth()
                    )
                    Text("${formatBytes(info.used)} von ${formatBytes(info.total)} belegt · ${formatBytes(info.free)} frei")
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        TextButton(onClick = {
                            context.startFirst(
                                listOf(
                                    Intent(StorageManager.ACTION_MANAGE_STORAGE),
                                    Intent(Settings.ACTION_INTERNAL_STORAGE_SETTINGS),
                                    Intent(Settings.ACTION_SETTINGS)
                                )
                            )
                        }) { Text("Speicher-Manager") }
                        TextButton(onClick = {
                            val freed = cleaner.clearOwnCache()
                            message = "OneClean-Cache geleert (${formatBytes(freed)})."
                        }) { Text("Eigenen Cache leeren") }
                    }
                }
            }

            item(key = "access") {
                if (cleaner.usesFolderAccess) {
                    SectionCard("Ordner zum Durchsuchen") {
                        Text(
                            "Wähle die Ordner, die OneClean prüfen darf – z. B. DCIM, Pictures, Movies, Documents " +
                                "oder Unterordner von Download. Android erlaubt keinen Zugriff auf den gesamten Speicher.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        folders.forEach { f ->
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text("📁 ${f.name}", Modifier.weight(1f))
                                TextButton(onClick = {
                                    cleaner.removeFolder(f.uri)
                                    folders = cleaner.folders()
                                    junk = emptyList()
                                    selected = emptySet()
                                }) { Text("Entfernen") }
                            }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            OutlinedButton(onClick = { folderLauncher.launch(null) }) { Text("Ordner hinzufügen") }
                            TextButton(onClick = {
                                context.startFirst(listOf(Intent(DownloadManager.ACTION_VIEW_DOWNLOADS)))
                            }) { Text("Downloads öffnen") }
                        }
                    }
                } else if (!legacyGranted) {
                    SectionCard("Zugriff auf Dateien") {
                        Text(
                            "Damit OneClean überflüssige Dateien (alte APKs, temporäre Dateien, Logs, Vorschaubilder, " +
                                "leere Ordner) finden kann, braucht die App Zugriff auf den Speicher. " +
                                "Es wird nichts ohne deine Bestätigung gelöscht.",
                            style = MaterialTheme.typography.bodyMedium
                        )
                        Button(onClick = { permLauncher.launch(cleaner.legacyPermissions()) }) { Text("Zugriff erlauben") }
                    }
                }
            }

            item(key = "scan") {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = {
                            scope.launch {
                                loading = true
                                message = null
                                junk = withContext(Dispatchers.IO) { cleaner.scan() }
                                selected = junk.filter { it.type.preselected }.map { it.key }.toSet()
                                message = if (junk.isEmpty()) "Alles sauber – nichts gefunden." else "${junk.size} Einträge gefunden."
                                loading = false
                            }
                        },
                        enabled = !loading && canScan,
                        modifier = Modifier.fillMaxWidth()
                    ) { Text("Speicher scannen") }
                    if (loading) LinearProgressIndicator(Modifier.fillMaxWidth())
                    message?.let { Text(it) }
                }
            }

            junk.groupBy { it.type }.forEach { (type, group) ->
                item(key = "header_${type.name}") {
                    val allOn = group.all { it.key in selected }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = allOn, onCheckedChange = { on ->
                            val keys = group.map { it.key }
                            selected = if (on) selected + keys else selected - keys.toSet()
                        })
                        Text(
                            "${type.label} · ${group.size} · ${formatBytes(group.sumOf { it.size })}",
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
                items(group, key = { "item_${it.key}" }) { item ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clickable { selected = if (item.key in selected) selected - item.key else selected + item.key }
                            .padding(start = 24.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Checkbox(
                            checked = item.key in selected,
                            onCheckedChange = { on -> selected = if (on) selected + item.key else selected - item.key }
                        )
                        Column(Modifier.weight(1f)) {
                            Text(item.name, style = MaterialTheme.typography.bodyMedium)
                            Text(
                                item.location + if (item.size > 0) " · ${formatBytes(item.size)}" else "",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
                item(key = "divider_${type.name}") { HorizontalDivider() }
            }
        }

        if (selectedItems.isNotEmpty()) {
            OutlinedButton(
                onClick = {
                    if (pro || selectedItems.size <= FreeLimits.DELETE_PER_ACTION) confirm = true else limitDialog = true
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("${selectedItems.size} Einträge löschen (${formatBytes(selectedSize)})")
            }
        }
    }

    if (limitDialog) {
        ProLimitDialog(
            text = "Kostenlos kannst du bis zu ${FreeLimits.DELETE_PER_ACTION} Einträge auf einmal löschen. " +
                "Mit OneClean Pro löschst du alle ${selectedItems.size} (${formatBytes(selectedSize)}) in einem Rutsch.",
            onOpenPro = onOpenPro,
            onDismiss = { limitDialog = false },
            freeLabel = "Nur ${FreeLimits.DELETE_PER_ACTION} löschen",
            onFree = {
                selected = selectedItems.sortedByDescending { it.size }
                    .take(FreeLimits.DELETE_PER_ACTION).map { it.key }.toSet()
                confirm = true
            }
        )
    }

    if (confirm) {
        ConfirmDialog(
            title = "Dateien löschen?",
            text = "${selectedItems.size} Einträge (${formatBytes(selectedSize)}) werden endgültig gelöscht.",
            confirm = "Löschen",
            onConfirm = {
                scope.launch {
                    loading = true
                    val toDelete = selectedItems
                    val gone = withContext(Dispatchers.IO) { cleaner.delete(toDelete) }
                    val freed = toDelete.filter { it.key in gone }.sumOf { it.size }
                    junk = junk.filterNot { it.key in gone }
                    selected = selected - gone
                    info = cleaner.storageInfo()
                    message = "${formatBytes(freed)} freigegeben." +
                        if (gone.size < toDelete.size) " ${toDelete.size - gone.size} Einträge konnten nicht gelöscht werden." else ""
                    loading = false
                }
            },
            onDismiss = { confirm = false }
        )
    }
}
