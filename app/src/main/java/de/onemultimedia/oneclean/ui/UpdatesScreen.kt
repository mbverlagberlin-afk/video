package de.onemultimedia.oneclean.ui

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import de.onemultimedia.oneclean.BuildConfig
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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import de.onemultimedia.oneclean.apps.AppEntry
import de.onemultimedia.oneclean.apps.AppScanner
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private fun systemUpdateIntents(): List<Intent> = listOf(
    Intent("android.settings.SYSTEM_UPDATE_SETTINGS"),
    Intent(Settings.ACTION_DEVICE_INFO_SETTINGS),
    Intent(Settings.ACTION_SETTINGS)
).map { it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }

private fun playStorePage(packageName: String): List<Intent> = listOf(
    Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$packageName")),
    Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$packageName"))
).map { it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }

@Composable
fun UpdatesScreen() {
    val context = LocalContext.current
    val scanner = remember { AppScanner(context) }
    var apps by remember { mutableStateOf<List<AppEntry>>(emptyList()) }

    LaunchedEffect(Unit) {
        apps = withContext(Dispatchers.IO) { scanner.userApps().sortedBy { it.lastUpdated } }
    }

    LazyColumn(
        Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item { Text("Updates", style = MaterialTheme.typography.headlineSmall) }

        item {
            SectionCard("OneClean") {
                Text("Installiert: Version ${BuildConfig.VERSION_NAME}")
                Text(
                    "OneClean wird automatisch über Google Play aktualisiert.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                TextButton(onClick = { context.startFirst(playStorePage(context.packageName)) }) {
                    Text("Im Play Store ansehen")
                }
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
                    Button(onClick = { context.startFirst(systemUpdateIntents()) }) {
                        Text("System-Update")
                    }
                    OutlinedButton(onClick = {
                        context.startFirst(
                            listOfNotNull(
                                context.packageManager.getLaunchIntentForPackage("com.android.vending")
                                    ?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            )
                        )
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
                        context.startFirst(playStorePage(app.packageName))
                    }) { Text("Prüfen") }
                }
                HorizontalDivider()
            }
        }
    }
}
