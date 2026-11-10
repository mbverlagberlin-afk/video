package de.onemultimedia.oneclean.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import de.onemultimedia.oneclean.apps.AppEntry
import de.onemultimedia.oneclean.apps.AppScanner
import de.onemultimedia.oneclean.update.DownloadState
import de.onemultimedia.oneclean.update.ReleaseInfo
import de.onemultimedia.oneclean.update.UpdateManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun UpdatesScreen() {
    val context = LocalContext.current
    val updater = remember { UpdateManager(context) }
    val scanner = remember { AppScanner(context) }
    val scope = rememberCoroutineScope()

    var checking by remember { mutableStateOf(false) }
    var release by remember { mutableStateOf<ReleaseInfo?>(null) }
    var status by remember { mutableStateOf<String?>(null) }
    var download by remember { mutableStateOf<DownloadState?>(null) }
    var apps by remember { mutableStateOf<List<AppEntry>>(emptyList()) }

    fun check() {
        scope.launch {
            checking = true
            status = null
            try {
                val r = updater.fetchLatest()
                release = r
                status = if (updater.isNewer(r.version)) "Neue Version ${r.version} verfügbar!"
                else "OneClean ist aktuell."
            } catch (e: Exception) {
                status = "Prüfung fehlgeschlagen: ${e.message ?: "keine Verbindung"}"
            }
            checking = false
        }
    }

    LaunchedEffect(Unit) {
        check()
        apps = withContext(Dispatchers.IO) { scanner.userApps().sortedBy { it.lastUpdated } }
    }

    LazyColumn(
        Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item { Text("Updates", style = MaterialTheme.typography.headlineSmall) }

        item {
            SectionCard("OneClean-Update") {
                Text("Installiert: Version ${updater.currentVersion}")
                if (checking) LinearProgressIndicator(Modifier.fillMaxWidth())
                status?.let { Text(it, style = MaterialTheme.typography.bodyLarge) }
                val r = release
                if (r != null && updater.isNewer(r.version)) {
                    if (r.notes.isNotBlank()) {
                        Text(r.notes.take(600), style = MaterialTheme.typography.bodySmall)
                    }
                    when (val d = download) {
                        is DownloadState.Running -> {
                            LinearProgressIndicator(progress = { d.progress }, modifier = Modifier.fillMaxWidth())
                            Text("Wird heruntergeladen … ${(d.progress * 100).toInt()} %")
                        }
                        is DownloadState.Done -> Button(onClick = {
                            if (updater.canInstall()) context.startActivity(updater.installIntent(d.file))
                            else context.startFirst(listOf(updater.unknownSourcesIntent()))
                        }) {
                            Text(if (updater.canInstall()) "Jetzt installieren" else "Installation erlauben")
                        }
                        is DownloadState.Failed -> {
                            Text(d.reason, color = MaterialTheme.colorScheme.error)
                            OutlinedButton(onClick = {
                                context.startFirst(listOf(Intent(Intent.ACTION_VIEW, Uri.parse(r.pageUrl))))
                            }) { Text("Im Browser herunterladen") }
                        }
                        null -> Button(onClick = {
                            scope.launch { updater.download(r) { download = it } }
                        }) { Text("Update herunterladen") }
                    }
                }
                TextButton(onClick = { check() }, enabled = !checking) { Text("Erneut prüfen") }
            }
        }

        item {
            SectionCard("Geräte- und App-Updates") {
                Text(
                    "Android erlaubt Apps nicht, andere Apps selbst zu aktualisieren. OneClean bringt dich " +
                        "direkt an die richtige Stelle:",
                    style = MaterialTheme.typography.bodyMedium
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { context.startFirst(updater.systemUpdateIntents()) }) {
                        Text("System-Update")
                    }
                    OutlinedButton(onClick = {
                        val ps = updater.playStoreIntent()
                        if (ps != null) context.startActivity(ps)
                        else context.startFirst(emptyList())
                    }) { Text("Play Store") }
                }
                Text(
                    "Im Play Store: Profilbild → „Apps und Gerät verwalten“ → „Alle aktualisieren“.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        if (apps.isNotEmpty()) {
            item {
                Text(
                    "Am längsten nicht aktualisiert",
                    style = MaterialTheme.typography.titleMedium
                )
            }
            items(apps.take(40), key = { it.packageName }) { app ->
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(app.label, style = MaterialTheme.typography.bodyLarge)
                        Text(
                            "Version ${app.versionName} · aktualisiert ${formatDate(app.lastUpdated)}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    TextButton(onClick = {
                        context.startFirst(
                            listOf(
                                scanner.playStoreIntent(app.packageName),
                                Intent(
                                    Intent.ACTION_VIEW,
                                    Uri.parse("https://play.google.com/store/apps/details?id=${app.packageName}")
                                )
                            )
                        )
                    }) { Text("Prüfen") }
                }
                HorizontalDivider()
            }
        }
    }
}
