package de.onemultimedia.oneclean

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import de.onemultimedia.oneclean.ui.AppsScreen
import de.onemultimedia.oneclean.ui.CalendarScreen
import de.onemultimedia.oneclean.ui.HomeScreen
import de.onemultimedia.oneclean.ui.StorageScreen
import de.onemultimedia.oneclean.ui.UpdatesScreen
import de.onemultimedia.oneclean.ui.theme.OneCleanTheme
import de.onemultimedia.oneclean.update.UpdateManager

private data class TabItem(val label: String, val icon: ImageVector)

private val tabs = listOf(
    TabItem("Übersicht", Icons.Filled.Home),
    TabItem("Kalender", Icons.Filled.DateRange),
    TabItem("Speicher", Icons.Filled.Delete),
    TabItem("Apps", Icons.AutoMirrored.Filled.List),
    TabItem("Updates", Icons.Filled.Refresh)
)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            OneCleanTheme { OneCleanApp() }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun OneCleanApp() {
    val context = LocalContext.current
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var updateVersion by remember { mutableStateOf<String?>(null) }

    // Beim Start still nach einer neuen OneClean-Version suchen
    LaunchedEffect(Unit) {
        val updater = UpdateManager(context)
        val latest = runCatching { updater.fetchLatest() }.getOrNull()
        if (latest != null && latest.apkUrl != null && updater.isNewer(latest.version)) {
            updateVersion = latest.version
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("OneClean") },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = MaterialTheme.colorScheme.onPrimary
                )
            )
        },
        bottomBar = {
            NavigationBar {
                tabs.forEachIndexed { index, item ->
                    NavigationBarItem(
                        selected = tab == index,
                        onClick = { tab = index },
                        icon = { Icon(item.icon, contentDescription = item.label) },
                        label = { Text(item.label) }
                    )
                }
            }
        }
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            when (tab) {
                0 -> HomeScreen(onOpen = { tab = it })
                1 -> CalendarScreen()
                2 -> StorageScreen()
                3 -> AppsScreen()
                else -> UpdatesScreen()
            }
        }
    }

    updateVersion?.let { v ->
        AlertDialog(
            onDismissRequest = { updateVersion = null },
            title = { Text("Update verfügbar") },
            text = { Text("OneClean $v ist erschienen. Jetzt aktualisieren?") },
            confirmButton = {
                TextButton(onClick = { updateVersion = null; tab = 4 }) { Text("Zum Update") }
            },
            dismissButton = { TextButton(onClick = { updateVersion = null }) { Text("Später") } }
        )
    }
}
