package de.onemultimedia.oneclean.ui

import android.content.Intent
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.graphics.drawable.toBitmap
import de.onemultimedia.oneclean.apps.AppEntry
import de.onemultimedia.oneclean.apps.AppScanner
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun AppsScreen(onOpenPro: () -> Unit) {
    val context = LocalContext.current
    val scanner = remember { AppScanner(context) }
    val scope = rememberCoroutineScope()

    var hasAccess by remember { mutableStateOf(scanner.hasUsageAccess()) }
    var days by remember { mutableIntStateOf(60) }
    var loading by remember { mutableStateOf(false) }
    var apps by remember { mutableStateOf<List<AppEntry>>(emptyList()) }
    var scanned by remember { mutableStateOf(false) }
    val pro = isPro()

    fun scan() {
        scope.launch {
            loading = true
            apps = withContext(Dispatchers.IO) { scanner.unusedApps(days) }
            scanned = true
            loading = false
        }
    }

    val accessLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { hasAccess = scanner.hasUsageAccess() }
    // Nach dem Deinstallieren neu scannen
    val uninstallLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { scan() }

    if (!hasAccess) {
        PermissionCard(
            title = "Nutzungszugriff",
            text = "Um zu erkennen, welche Apps du lange nicht mehr geöffnet hast, braucht OneClean den " +
                "„Nutzungsdatenzugriff“. Tippe auf den Button, wähle OneClean und aktiviere den Schalter.",
            button = "Einstellungen öffnen"
        ) {
            accessLauncher.launch(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
        }
        return
    }

    LaunchedEffect(Unit) { if (!scanned) scan() }

    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Ungenutzte Apps", style = MaterialTheme.typography.headlineSmall)
        Text("Nicht geöffnet seit mindestens:", style = MaterialTheme.typography.bodyMedium)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(30, 60, 90, 180).forEach { d ->
                FilterChip(
                    selected = days == d,
                    onClick = { days = d; scan() },
                    label = { Text("$d Tage") }
                )
            }
        }
        if (loading) LinearProgressIndicator(Modifier.fillMaxWidth())
        if (scanned && !loading) {
            Text(
                if (apps.isEmpty()) "Super – keine ungenutzten Apps gefunden."
                else "${apps.size} Apps · zusammen ${formatBytes(apps.sumOf { it.size })}"
            )
        }

        if (scanned && !loading && apps.isNotEmpty() && !pro) {
            SectionCard("Mit Pro freischalten") {
                Text(
                    "OneClean hat ${apps.size} Apps gefunden, die du seit über $days Tagen nicht benutzt hast " +
                        "(zusammen ${formatBytes(apps.sumOf { it.size })}). Mit OneClean Pro siehst du die Liste " +
                        "und deinstallierst sie mit einem Tipp.",
                    style = MaterialTheme.typography.bodyMedium
                )
                Button(onClick = onOpenPro) { Text("Pro ansehen") }
            }
        }

        LazyColumn(Modifier.weight(1f)) {
            items(if (pro) apps else emptyList(), key = { it.packageName }) { app ->
                val icon: ImageBitmap? = remember(app.packageName) {
                    runCatching {
                        context.packageManager.getApplicationIcon(app.packageName).toBitmap(96, 96).asImageBitmap()
                    }.getOrNull()
                }
                Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (icon != null) Image(icon, contentDescription = null, modifier = Modifier.size(40.dp))
                    else Spacer(Modifier.size(40.dp))
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(app.label, style = MaterialTheme.typography.bodyLarge)
                        Text(
                            "Zuletzt benutzt: " + (if (app.lastUsed > 0) formatDate(app.lastUsed) else "seit über 1 Jahr / nie") +
                                " · ${formatBytes(app.size)}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Row {
                            TextButton(onClick = {
                                uninstallLauncher.launch(scanner.uninstallIntent(app.packageName))
                            }) { Text("Deinstallieren") }
                            TextButton(onClick = {
                                context.startFirst(listOf(scanner.appSettingsIntent(app.packageName)))
                            }) { Text("Cache leeren") }
                        }
                    }
                }
                HorizontalDivider()
            }
        }

        if (!loading) {
            if (scanned) {
                OutlinedButton(onClick = { scan() }, modifier = Modifier.fillMaxWidth()) { Text("Erneut scannen") }
            } else {
                Button(onClick = { scan() }, modifier = Modifier.fillMaxWidth()) { Text("Apps scannen") }
            }
        }
    }
}
