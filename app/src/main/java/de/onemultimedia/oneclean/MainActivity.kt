package de.onemultimedia.oneclean

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
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
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import de.onemultimedia.oneclean.billing.BillingManager
import de.onemultimedia.oneclean.ui.AppsScreen
import de.onemultimedia.oneclean.ui.CalendarScreen
import de.onemultimedia.oneclean.ui.HomeScreen
import de.onemultimedia.oneclean.ui.LocalBilling
import de.onemultimedia.oneclean.ui.ProScreen
import de.onemultimedia.oneclean.ui.StorageScreen
import de.onemultimedia.oneclean.ui.UpdatesScreen
import de.onemultimedia.oneclean.ui.theme.OneCleanTheme

private data class TabItem(val label: String, val icon: ImageVector)

private val tabs = listOf(
    TabItem("Übersicht", Icons.Filled.Home),
    TabItem("Kalender", Icons.Filled.DateRange),
    TabItem("Speicher", Icons.Filled.Delete),
    TabItem("Apps", Icons.AutoMirrored.Filled.List),
    TabItem("Updates", Icons.Filled.Refresh)
)

/** Index der Pro-Seite (nicht in der unteren Leiste, sondern über den Stern oben). */
const val PRO_TAB = 5

class MainActivity : ComponentActivity() {

    private lateinit var billing: BillingManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        billing = BillingManager(this)
        billing.start()
        enableEdgeToEdge()
        setContent {
            OneCleanTheme {
                CompositionLocalProvider(LocalBilling provides billing) { OneCleanApp() }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        // z. B. ausstehende Zahlungen, die inzwischen bestätigt wurden
        billing.refresh()
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun OneCleanApp() {
    val billing = LocalBilling.current
    var tab by rememberSaveable { mutableIntStateOf(0) }
    val snackbar = remember { SnackbarHostState() }
    val billingMessage by billing.message.collectAsState()

    LaunchedEffect(billingMessage) {
        billingMessage?.let {
            snackbar.showSnackbar(it)
            billing.clearMessage()
        }
    }

    BackHandler(enabled = tab != 0) { tab = 0 }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("OneClean") },
                actions = {
                    IconButton(onClick = { tab = PRO_TAB }) {
                        Icon(Icons.Filled.Star, contentDescription = "OneClean Pro")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = MaterialTheme.colorScheme.onPrimary,
                    actionIconContentColor = MaterialTheme.colorScheme.tertiary
                )
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
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
            val openPro = { tab = PRO_TAB }
            when (tab) {
                0 -> HomeScreen(onOpen = { tab = it })
                1 -> CalendarScreen(onOpenPro = openPro)
                2 -> StorageScreen(onOpenPro = openPro)
                3 -> AppsScreen(onOpenPro = openPro)
                4 -> UpdatesScreen()
                else -> ProScreen()
            }
        }
    }
}
