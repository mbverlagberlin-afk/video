package de.onemultimedia.oneclean.ui

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
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
import de.onemultimedia.oneclean.storage.JunkItem
import de.onemultimedia.oneclean.storage.StorageCleaner
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun StorageScreen() {
    val context = LocalContext.current
    val cleaner = remember { StorageCleaner(context) }
    val scope = rememberCoroutineScope()

    var granted by remember { mutableStateOf(cleaner.hasAccess()) }
    val settingsLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { granted = cleaner.hasAccess() }
    val permLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { granted = cleaner.hasAccess() }

    if (!granted) {
        PermissionCard(
            title = "Zugriff auf Dateien",
            text = "Damit OneClean überflüssige Dateien (alte APKs, temporäre Dateien, Logs, Vorschaubilder, " +
                "leere Ordner) finden kann, braucht die App Zugriff auf den Gerätespeicher. " +
                "Es wird nichts ohne deine Bestätigung gelöscht.",
            button = "Zugriff erlauben"
        ) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val intent = Intent(
                    Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                    Uri.parse("package:${context.packageName}")
                )
                try {
                    settingsLauncher.launch(intent)
                } catch (_: Exception) {
                    settingsLauncher.launch(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION))
                }
            } else {
                permLauncher.launch(
                    arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE)
                )
            }
        }
        return
    }

    var info by remember { mutableStateOf(cleaner.storageInfo()) }
    var loading by remember { mutableStateOf(false) }
    var junk by remember { mutableStateOf<List<JunkItem>>(emptyList()) }
    var selected by remember { mutableStateOf<Set<String>>(emptySet()) }
    var message by remember { mutableStateOf<String?>(null) }
    var confirm by remember { mutableStateOf(false) }

    val selectedItems = junk.filter { it.file.absolutePath in selected }
    val selectedSize = selectedItems.sumOf { it.size }

    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Speicher bereinigen", style = MaterialTheme.typography.headlineSmall)
        SectionCard("Gerätespeicher") {
            LinearProgressIndicator(
                progress = { if (info.total > 0) info.used.toFloat() / info.total else 0f },
                modifier = Modifier.fillMaxWidth()
            )
            Text("${formatBytes(info.used)} von ${formatBytes(info.total)} belegt · ${formatBytes(info.free)} frei")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = {
                    context.startFirst(
                        listOf(
                            Intent(Settings.ACTION_INTERNAL_STORAGE_SETTINGS),
                            Intent(Settings.ACTION_SETTINGS)
                        )
                    )
                }) { Text("App-Cache (System)") }
                TextButton(onClick = {
                    val freed = cleaner.clearOwnCache()
                    message = "OneClean-Cache geleert (${formatBytes(freed)})."
                }) { Text("Eigenen Cache leeren") }
            }
        }

        Button(
            onClick = {
                scope.launch {
                    loading = true
                    message = null
                    junk = withContext(Dispatchers.IO) { cleaner.scan() }
                    selected = junk.filter { it.type.preselected }.map { it.file.absolutePath }.toSet()
                    message = if (junk.isEmpty()) "Alles sauber – nichts gefunden." else "${junk.size} Einträge gefunden."
                    loading = false
                }
            },
            enabled = !loading,
            modifier = Modifier.fillMaxWidth()
        ) { Text("Speicher scannen") }
        if (loading) LinearProgressIndicator(Modifier.fillMaxWidth())
        message?.let { Text(it) }

        LazyColumn(Modifier.weight(1f)) {
            junk.groupBy { it.type }.forEach { (type, group) ->
                item(key = "header_${type.name}") {
                    val allOn = group.all { it.file.absolutePath in selected }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = allOn, onCheckedChange = { on ->
                            val paths = group.map { it.file.absolutePath }
                            selected = if (on) selected + paths else selected - paths.toSet()
                        })
                        Text(
                            "${type.label} · ${group.size} · ${formatBytes(group.sumOf { it.size })}",
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
                items(group, key = { it.file.absolutePath }) { item ->
                    val path = item.file.absolutePath
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clickable { selected = if (path in selected) selected - path else selected + path }
                            .padding(start = 24.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Checkbox(
                            checked = path in selected,
                            onCheckedChange = { on -> selected = if (on) selected + path else selected - path }
                        )
                        Column(Modifier.weight(1f)) {
                            Text(item.file.name, style = MaterialTheme.typography.bodyMedium)
                            Text(
                                (item.file.parent ?: "") + if (item.size > 0) " · ${formatBytes(item.size)}" else "",
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
            OutlinedButton(onClick = { confirm = true }, modifier = Modifier.fillMaxWidth()) {
                Text("${selectedItems.size} Einträge löschen (${formatBytes(selectedSize)})")
            }
        }
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
                    val freed = withContext(Dispatchers.IO) { cleaner.delete(toDelete) }
                    val gone = toDelete.filter { !it.file.exists() }.map { it.file.absolutePath }.toSet()
                    junk = junk.filterNot { it.file.absolutePath in gone }
                    selected = selected - gone
                    info = cleaner.storageInfo()
                    message = "${formatBytes(freed)} freigegeben."
                    loading = false
                }
            },
            onDismiss = { confirm = false }
        )
    }
}
