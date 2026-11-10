package de.onemultimedia.oneclean.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import de.onemultimedia.oneclean.BuildConfig
import de.onemultimedia.oneclean.storage.StorageCleaner

@Composable
fun HomeScreen(onOpen: (Int) -> Unit) {
    val context = LocalContext.current
    val info = remember { StorageCleaner(context).storageInfo() }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("Willkommen bei OneClean", style = MaterialTheme.typography.headlineSmall)
        Text(
            "Räum Kalender und Android-Geräte in wenigen Schritten auf.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        SectionCard("Speicher") {
            LinearProgressIndicator(
                progress = { if (info.total > 0) info.used.toFloat() / info.total else 0f },
                modifier = Modifier.fillMaxWidth()
            )
            Text("${formatBytes(info.free)} frei von ${formatBytes(info.total)}")
            TextButton(onClick = { onOpen(2) }) { Text("Speicher bereinigen →") }
        }

        SectionCard("Kalender") {
            Text("Doppelte Termine und alte, abgelaufene Einträge finden und löschen.")
            TextButton(onClick = { onOpen(1) }) { Text("Kalender aufräumen →") }
        }

        SectionCard("Apps") {
            Text("Apps finden, die du seit Wochen nicht geöffnet hast – und Platz schaffen.")
            TextButton(onClick = { onOpen(3) }) { Text("Ungenutzte Apps anzeigen →") }
        }

        SectionCard("Updates") {
            Text("OneClean ${BuildConfig.VERSION_NAME} – Selbst-Update, System- und App-Updates prüfen.")
            TextButton(onClick = { onOpen(4) }) { Text("Nach Updates suchen →") }
        }

        SectionCard("Mehrere Geräte") {
            Text(
                "• Kalender: Google-Kalender werden synchronisiert – einmal aufräumen genügt für alle Geräte.\n" +
                    "• Alle Geräte auf einmal: Mit dem PC-Tool „OneClean Multi“ räumst du jedes per USB oder " +
                    "WLAN verbundene Android-Gerät gleichzeitig auf (App-Caches leeren, Junk löschen, " +
                    "OneClean installieren/aktualisieren).",
                style = MaterialTheme.typography.bodyMedium
            )
            TextButton(onClick = {
                context.startFirst(
                    listOf(
                        Intent(
                            Intent.ACTION_VIEW,
                            Uri.parse("https://github.com/${BuildConfig.UPDATE_REPO}#mehrere-ger%C3%A4te")
                        )
                    )
                )
            }) { Text("Anleitung öffnen →") }
        }

        Text(
            "OneClean · OneMultimedia · MB Verlag & Media Sounds",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}
