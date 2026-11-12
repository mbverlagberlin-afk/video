plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// Version kommt beim Release-Build aus GitHub Actions (Tag v1.2.3 -> 1.2.3)
val appVersionName = (project.findProperty("appVersionName") as String?) ?: "1.0.0"
val appVersionCode = (project.findProperty("appVersionCode") as String?)?.toInt() ?: 1

// Upload-Schlüssel für Google Play (wird in GitHub Actions aus den Secrets gesetzt)
val releaseKeystore: String? = System.getenv("ONECLEAN_KEYSTORE")

android {
    namespace = "de.onemultimedia.oneclean"
    compileSdk = 36

    defaultConfig {
        applicationId = "de.onemultimedia.oneclean"
        minSdk = 26
        targetSdk = 36
        versionCode = appVersionCode
        versionName = appVersionName
    }

    signingConfigs {
        if (releaseKeystore != null) {
            create("release") {
                storeFile = file(releaseKeystore)
                storePassword = System.getenv("ONECLEAN_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ONECLEAN_KEY_ALIAS")
                keyPassword = System.getenv("ONECLEAN_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // Ohne Schlüssel entsteht ein unsigniertes App Bundle, das nachträglich signiert werden kann
            signingConfig = if (releaseKeystore != null) signingConfigs.getByName("release") else null
        }
        debug {
            // Test-Version kann parallel zur Play-Store-Version installiert werden
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-test"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2025.01.01")
    implementation(composeBom)
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-core")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    // Google Play Billing für „OneClean Pro“
    implementation("com.android.billingclient:billing:8.0.0")
}
