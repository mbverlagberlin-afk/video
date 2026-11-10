package de.onemultimedia.oneclean.calendar

import android.Manifest
import android.content.ContentUris
import android.content.Context
import android.content.pm.PackageManager
import android.provider.CalendarContract.Events
import androidx.core.content.ContextCompat

data class CalEvent(
    val id: Long,
    val calendarId: Long,
    val calendarName: String,
    val title: String,
    val start: Long,
    val end: Long,
    val allDay: Boolean,
    val recurring: Boolean,
    /** Bei Duplikaten: die ID des Termins, der behalten wird. */
    val duplicateOf: Long? = null
)

class CalendarCleaner(private val context: Context) {

    fun hasPermission(): Boolean =
        listOf(Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR).all {
            ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
        }

    fun loadEvents(): List<CalEvent> {
        val projection = arrayOf(
            Events._ID,
            Events.CALENDAR_ID,
            Events.CALENDAR_DISPLAY_NAME,
            Events.TITLE,
            Events.DTSTART,
            Events.DTEND,
            Events.ALL_DAY,
            Events.RRULE
        )
        val result = mutableListOf<CalEvent>()
        context.contentResolver.query(
            Events.CONTENT_URI,
            projection,
            "${Events.DELETED} = 0",
            null,
            "${Events.DTSTART} ASC"
        )?.use { c ->
            while (c.moveToNext()) {
                result += CalEvent(
                    id = c.getLong(0),
                    calendarId = c.getLong(1),
                    calendarName = c.getString(2) ?: "Kalender",
                    title = c.getString(3) ?: "(ohne Titel)",
                    start = if (c.isNull(4)) 0L else c.getLong(4),
                    end = if (c.isNull(5)) 0L else c.getLong(5),
                    allDay = !c.isNull(6) && c.getInt(6) == 1,
                    recurring = !c.isNull(7) && c.getString(7).isNotBlank()
                )
            }
        }
        return result
    }

    /**
     * Duplikate = gleicher Titel (ohne Groß/Klein & Leerzeichen), gleicher Start, gleiches Ende.
     * Der älteste Eintrag (kleinste ID) bleibt erhalten, alle weiteren werden als Duplikat gemeldet.
     */
    fun findDuplicates(events: List<CalEvent>): List<CalEvent> =
        events.groupBy { Triple(it.title.trim().lowercase(), it.start, it.end to it.allDay) }
            .values
            .filter { it.size > 1 }
            .flatMap { group ->
                val sorted = group.sortedBy { it.id }
                val keep = sorted.first()
                sorted.drop(1).map { it.copy(duplicateOf = keep.id) }
            }
            .sortedBy { it.start }

    /** Einmalige Termine, die vor mehr als [months] Monaten geendet haben. Serientermine bleiben unberührt. */
    fun findOld(events: List<CalEvent>, months: Int): List<CalEvent> {
        val cutoff = System.currentTimeMillis() - months * 30L * 24 * 60 * 60 * 1000
        return events.filter { !it.recurring && it.start > 0 && maxOf(it.start, it.end) < cutoff }
    }

    /** Löscht die Termine und gibt die Anzahl erfolgreich gelöschter zurück. */
    fun delete(ids: Collection<Long>): Int {
        var count = 0
        for (id in ids) {
            try {
                count += context.contentResolver.delete(
                    ContentUris.withAppendedId(Events.CONTENT_URI, id), null, null
                )
            } catch (_: Exception) {
                // z. B. schreibgeschützter Kalender (Feiertage, abonnierte Kalender)
            }
        }
        return count
    }
}
