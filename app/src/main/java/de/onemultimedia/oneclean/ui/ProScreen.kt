package de.onemultimedia.oneclean.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import de.onemultimedia.oneclean.billing.BillingManager
import de.onemultimedia.oneclean.billing.FreeLimits

val LocalBilling = staticCompositionLocalOf<BillingManager> { error("BillingManager fehlt") }

@Composable
fun isPro(): Boolean = LocalBilling.current.isPro.collectAsState().value

fun Context.findActivity(): Activity? {
    var c: Context? = this
    while (c is ContextWrapper) {
        if (c is Activity) return c
        c = c.baseContext
    }
    return null
}

private val proFeatures = listOf(
    "Unbegrenzt auf einmal löschen – Termine und Dateien (kostenlos: ${FreeLimits.DELETE_PER_ACTION} pro Durchgang)",
    "Ungenutzte Apps anzeigen, nach Größe sortiert, und mit einem Tipp deinstallieren",
    "Einmal kaufen, für immer nutzen – kein Abo, keine Werbung",
    "Gilt auf allen Android-Geräten mit deinem Google-Konto"
)

@Composable
fun ProScreen() {
    val context = LocalContext.current
    val billing = LocalBilling.current
    val pro by billing.isPro.collectAsState()
    val price by billing.price.collectAsState()

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("OneClean Pro", style = MaterialTheme.typography.headlineSmall)
        SectionCard(if (pro) "Pro ist aktiv – danke für deine Unterstützung!" else "Mehr Aufräumen mit Pro") {
            proFeatures.forEach { Text("✓  $it", style = MaterialTheme.typography.bodyMedium) }
        }
        if (!pro) {
            Button(
                onClick = { context.findActivity()?.let { billing.buy(it) } },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(if (price != null) "Pro freischalten für $price" else "Pro freischalten", fontWeight = FontWeight.SemiBold)
            }
            TextButton(onClick = { billing.start(); billing.refresh() }) { Text("Kauf wiederherstellen") }
            Text(
                "Die Zahlung läuft sicher über Google Play. Die kostenlose Version bleibt voll nutzbar.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

/** Hinweis, wenn eine Aktion die kostenlose Grenze überschreitet. */
@Composable
fun ProLimitDialog(
    text: String,
    onOpenPro: () -> Unit,
    onDismiss: () -> Unit,
    freeLabel: String? = null,
    onFree: () -> Unit = {}
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("OneClean Pro") },
        text = { Text(text) },
        confirmButton = { TextButton(onClick = { onDismiss(); onOpenPro() }) { Text("Pro ansehen") } },
        dismissButton = {
            if (freeLabel != null) TextButton(onClick = { onDismiss(); onFree() }) { Text(freeLabel) }
            else TextButton(onClick = onDismiss) { Text("Schließen") }
        }
    )
}
