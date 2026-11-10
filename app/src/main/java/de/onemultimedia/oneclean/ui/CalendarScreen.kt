package de.onemultimedia.oneclean.ui

import android.Manifest
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
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import de.onemultimedia.oneclean.calendar.CalEvent
import de.onemultimedia.oneclean.calendar.CalendarCleaner
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun CalendarScreen() {
    val context = LocalContext.current
    val cleaner = remember { CalendarCleaner(context) }
    val scope = rememberCoroutineScope()

    var granted by remember { mutableStateOf(cleaner.hasPermission()) }
    val permLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { result -> granted = result.values.all { it } }

    if (!granted) {
        PermissionCard(
            title = "Kalender-Zugriff",
            text = "OneClean findet doppelte und veraltete Termine in allen Kalendern auf diesem Gerät " +
                "(auch Google-Kalender – die Änderungen werden auf alle deine Geräte synchronisiert).",
            button = "Zugriff erlauben"
        ) {
            permLauncher.launch(arrayOf(Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR))
        }
        return
    }

    var duplicatesMode by remember { mutableStateOf(true) }
    var months by remember { mutableIntStateOf(12) }
    var loading by remember { mutableStateOf(false) }
    var scanned by remember { mutableStateOf(false) }
    var candidates by remember { mutableStateOf<List<CalEvent>>(emptyList()) }
    var selected by remember { mutableStateOf<Set<Long>>(emptySet()) }
    var message by remember { mutableStateOf<String?>(null) }
    var confirm by remember { mutableStateOf(false) }

    fun scan() {
        scope.launch {
            loading = true
            message = null
            val all = withContext(Dispatchers.IO) { cleaner.loadEvents() }
            candidates = if (duplicatesMode) cleaner.findDuplicates(all) else cleaner.findOld(all, months)
            selected = candidates.map { it.id }.toSet()
            message = "${all.size} Termine geprüft – ${candidates.size} gefunden."
            scanned = true
            loading = false
        }
    }

    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Kalender aufräumen", style = MaterialTheme.typography.headlineSmall)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(
                selected = duplicatesMode,
                onClick = { duplicatesMode = true; scanned = false; candidates = emptyList() },
                label = { Text("Doppelte Termine") }
            )
            FilterChip(
                selected = !duplicatesMode,
                onClick = { duplicatesMode = false; scanned = false; candidates = emptyList() },
                label = { Text("Alte Termine") }
            )
        }
        if (!duplicatesMode) {
            Text("Einmalige Termine löschen, die älter sind als:", style = MaterialTheme.typography.bodyMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(6, 12, 24, 36).forEach { m ->
                    FilterChip(
                        selected = months == m,
                        onClick = { months = m; scanned = false; candidates = emptyList() },
                        label = { Text("$m Monate") }
                    )
                }
            }
        }
        Button(onClick = { scan() }, enabled = !loading, modifier = Modifier.fillMaxWidth()) {
            Text(if (scanned) "Erneut scannen" else "Kalender scannen")
        }
        if (loading) LinearProgressIndicator(Modifier.fillMaxWidth())
        message?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }

        if (candidates.isNotEmpty()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(
                    checked = selected.size == candidates.size,
                    onCheckedChange = { all ->
                        selected = if (all) candidates.map { it.id }.toSet() else emptySet()
                    }
                )
                Text("Alle auswählen (${selected.size}/${candidates.size})")
            }
        }

        LazyColumn(Modifier.weight(1f)) {
            items(candidates, key = { it.id }) { ev ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clickable {
                            selected = if (ev.id in selected) selected - ev.id else selected + ev.id
                        }
                        .padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Checkbox(
                        checked = ev.id in selected,
                        onCheckedChange = { on -> selected = if (on) selected + ev.id else selected - ev.id }
                    )
                    Column(Modifier.weight(1f)) {
                        Text(ev.title, style = MaterialTheme.typography.bodyLarge)
                        Text(
                            "${formatDate(ev.start, withTime = !ev.allDay)} · ${ev.calendarName}" +
                                if (ev.duplicateOf != null) " · Duplikat" else "",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
                HorizontalDivider()
            }
        }

        if (selected.isNotEmpty()) {
            OutlinedButton(onClick = { confirm = true }, modifier = Modifier.fillMaxWidth()) {
                Text("${selected.size} Termine löschen")
            }
        }
    }

    if (confirm) {
        ConfirmDialog(
            title = "Termine löschen?",
            text = "${selected.size} Termine werden endgültig gelöscht. Bei Google-Kalendern gilt das auch " +
                "für alle anderen Geräte mit diesem Konto.",
            confirm = "Löschen",
            onConfirm = {
                scope.launch {
                    loading = true
                    val ids = selected
                    val deleted = withContext(Dispatchers.IO) { cleaner.delete(ids) }
                    candidates = candidates.filterNot { it.id in ids }
                    selected = emptySet()
                    message = "$deleted Termine gelöscht." +
                        if (deleted < ids.size) " ${ids.size - deleted} sind schreibgeschützt und wurden übersprungen." else ""
                    loading = false
                }
            },
            onDismiss = { confirm = false }
        )
    }
}
