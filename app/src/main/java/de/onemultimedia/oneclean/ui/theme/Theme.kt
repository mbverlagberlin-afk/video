package de.onemultimedia.oneclean.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Navy = Color(0xFF0F2A44)
private val Teal = Color(0xFF2EC4B6)
private val Gold = Color(0xFFFFD166)

private val LightColors = lightColorScheme(
    primary = Navy,
    onPrimary = Color.White,
    secondary = Teal,
    onSecondary = Navy,
    tertiary = Gold,
    primaryContainer = Color(0xFFD6E6F5),
    onPrimaryContainer = Navy,
    secondaryContainer = Color(0xFFCFF3EF),
    onSecondaryContainer = Navy,
    background = Color(0xFFF6F8FB),
    surface = Color.White,
    error = Color(0xFFC62828)
)

private val DarkColors = darkColorScheme(
    primary = Teal,
    onPrimary = Navy,
    secondary = Gold,
    onSecondary = Navy,
    tertiary = Gold,
    primaryContainer = Color(0xFF1C3D5E),
    onPrimaryContainer = Color.White,
    secondaryContainer = Color(0xFF1E4F4A),
    onSecondaryContainer = Color.White,
    background = Color(0xFF0A1726),
    surface = Color(0xFF112236),
    error = Color(0xFFEF5350)
)

@Composable
fun OneCleanTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (isSystemInDarkTheme()) DarkColors else LightColors,
        content = content
    )
}
