import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

// The app version comes from the release tag (`-PappVersion=1.0.0`, set by
// .github/workflows/release.yml); local builds use the fallback. versionCode
// is derived from it so every release upgrades in place:
// major * 10000 + minor * 100 + patch.
val appVersion = (findProperty("appVersion") as String?)?.removePrefix("v") ?: "1.0.0"
val appVersionCode = appVersion.split(".").map { it.takeWhile(Char::isDigit).ifEmpty { "0" }.toInt() }
    .let { (it.getOrElse(0) { 0 } * 10000) + (it.getOrElse(1) { 0 } * 100) + it.getOrElse(2) { 0 } }

// Release signing: one permanent key, so a new APK installs over the old one.
// CI writes keystore.properties from repository secrets; locally it lives in
// the repo root (gitignored). Without it, release builds are unsigned.
val keystoreProperties = Properties().apply {
    val file = rootProject.file("keystore.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}

android {
    namespace = "com.partyconsole.companion"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.partyconsole.companion"
        minSdk = 26
        targetSdk = 35
        versionCode = appVersionCode
        versionName = appVersion
    }

    signingConfigs {
        if (keystoreProperties.getProperty("storeFile") != null) {
            create("release") {
                storeFile = file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            // Installs next to the release app, so development builds can be
            // tried on the same phone without replacing it.
            applicationIdSuffix = ".dev"
            versionNameSuffix = "-dev"
        }
        release {
            // R8 stays off until a shrunk build has been tested on a device
            // (kotlinx.serialization and Compose reflection need keep rules).
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
        // Card(onClick=...) and a few other Material3 APIs are still
        // experimental; opt in project-wide rather than per composable.
        freeCompilerArgs += listOf(
            "-opt-in=androidx.compose.material3.ExperimentalMaterial3Api",
            // FlowRow, for wrapping chip rows.
            "-opt-in=androidx.compose.foundation.layout.ExperimentalLayoutApi",
        )
    }

    buildFeatures {
        compose = true
    }

    testOptions {
        unitTests {
            // Robolectric needs the merged resources; android.* stubs return
            // defaults instead of throwing in plain JVM tests.
            isIncludeAndroidResources = true
            isReturnDefaultValues = true
            all { test ->
                // CI shows only the console, so print why a test failed there.
                test.testLogging {
                    events("failed")
                    exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
                }
            }
        }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    // ProcessLifecycleOwner: polling pauses while the app is in the background.
    implementation("androidx.lifecycle:lifecycle-process:2.8.7")
    implementation("androidx.activity:activity-compose:1.9.3")

    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.navigation:navigation-compose:2.8.5")

    // OkHttp for REST, and its SSE extension for the live dashboard stream.
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:okhttp-sse:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")

    // Encrypted pairing cookie and the saved server settings.
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    implementation("androidx.datastore:datastore-preferences:1.1.1")
    // Background alert checks (notify/): the 15-minute periodic job.
    implementation("androidx.work:work-runtime-ktx:2.9.1")

    // Sprite sheets load from adventure.land; Coil caches them so a sheet
    // isn't re-fetched per item.
    implementation("io.coil-kt:coil-compose:2.7.0")

    // Pairing-QR scanning: CameraX for the preview, ML Kit for on-device
    // barcode decoding (no network call).
    val cameraxVersion = "1.4.1"
    implementation("androidx.camera:camera-core:$cameraxVersion")
    implementation("androidx.camera:camera-camera2:$cameraxVersion")
    implementation("androidx.camera:camera-lifecycle:$cameraxVersion")
    implementation("androidx.camera:camera-view:$cameraxVersion")
    implementation("com.google.mlkit:barcode-scanning:17.3.0")

    testImplementation("junit:junit:4.13.2")
    // JVM tests against a mock server serving the shared fixtures, and
    // Compose screens through Robolectric without an emulator.
    testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
    testImplementation("androidx.work:work-testing:2.9.1")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.8.1")
    testImplementation("org.robolectric:robolectric:4.14.1")
    testImplementation(composeBom)
    testImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
    androidTestImplementation(composeBom)
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
}
