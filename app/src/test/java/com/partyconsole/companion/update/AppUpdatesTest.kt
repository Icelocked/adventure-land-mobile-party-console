package com.partyconsole.companion.update

import android.content.Intent
import android.content.pm.PackageInstaller
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.ui.account.AppUpdateSection
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

@RunWith(RobolectricTestRunner::class)
class AppUpdatesTest {
    @get:Rule val compose = createComposeRule()
    private val context = ApplicationProvider.getApplicationContext<android.app.Application>()
    private val server = MockWebServer()
    private val apk = ByteArray(200_000) { (it % 251).toByte() }
    private var release = ""

    private fun releaseJson(tag: String, prerelease: Boolean = false, apkName: String = "party-console-companion-$tag.apk") =
        """{"tag_name":"$tag","draft":false,"prerelease":$prerelease,"html_url":"https://github.com/x/y/releases/tag/$tag",
           "assets":[{"name":"party-console-companion-pwa-$tag.zip","browser_download_url":"${server.url("/pwa.zip")}","size":10},
                     {"name":"$apkName","browser_download_url":"${server.url("/app.apk")}","size":${apk.size}}]}"""

    @Before fun start() {
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest) = when (request.path) {
                "/releases/latest" -> if (release.isEmpty()) MockResponse().setResponseCode(404) else MockResponse().setBody(release)
                "/app.apk" -> MockResponse().setBody(okio.Buffer().write(apk))
                else -> MockResponse().setResponseCode(404)
            }
        }
        server.start()
        AppUpdates.releasesUrl = server.url("/releases/latest").toString()
        androidx.work.testing.WorkManagerTestInitHelper.initializeTestWorkManager(context)
        AppUpdates.resetForTests()
        AppUpdates.devBuildOverride = false
        UpdatePrefs(context).automaticChecks = true
    }

    @After fun stop() {
        server.shutdown()
        AppUpdates.devBuildOverride = null
    }

    @Test
    fun devBuildsNeitherScheduleChecksNorOfferInstalls() {
        AppUpdates.devBuildOverride = true
        UpdateControl.apply(context)
        assertTrue(androidx.work.WorkManager.getInstance(context).getWorkInfosForUniqueWork("app-update-check").get().none { !it.state.isFinished })
        compose.setContent { AppUpdateSection() }
        compose.onNodeWithText("Development build", substring = true).assertExists()
        compose.onNodeWithText("Check now").assertDoesNotExist()
    }

    @Test
    fun aboutCreditsPartyConsoleAndShowsItsLicense() {
        // Failure mode: the app shipped party-console-derived code without its
        // MIT notice or any credit.
        compose.setContent { com.partyconsole.companion.ui.account.AboutSection() }
        compose.onNodeWithText("by Ryan Haines and contributors", substring = true).assertExists()
        compose.onNodeWithText("Show party-console license").performClick()
        compose.onNodeWithText("Copyright (c) 2026 Adventure Land Party Console contributors", substring = true).assertExists()
    }

    @Test
    fun comparesStableVersionsOnly() {
        assertTrue(AppUpdates.newer("1.10.0", "1.9.9"))
        assertFalse(AppUpdates.newer("1.0.0", "1.0.0"))
        assertFalse(AppUpdates.newer("1.0.0-beta", "0.9.0"))
        assertTrue(AppUpdates.newer("v1.0.0", "0.8.0"))
        assertNull(AppUpdates.parseVersion("1.0"))
    }

    @Test
    fun latestPicksTheReleaseApkAndSkipsPrereleases() = runBlocking {
        release = releaseJson("v1.2.0")
        val found = AppUpdates.latest()!!
        assertEquals("1.2.0", found.version)
        assertTrue(found.apkUrl.endsWith("/app.apk"))
        assertEquals(apk.size.toLong(), found.apkSize)
        release = releaseJson("v1.3.0", prerelease = true)
        assertNull(AppUpdates.latest())
        release = releaseJson("v1.3.0", apkName = "something-else.apk")
        assertNull(AppUpdates.latest())
        release = ""
        assertNull(AppUpdates.latest())
    }

    @Test
    fun checkOffersOnlyNewerReleases() = runBlocking {
        val installed = AppUpdates.installedVersion(context)
        release = releaseJson("v99.0.0")
        assertEquals("99.0.0", AppUpdates.check(context)?.version)
        assertEquals("99.0.0", AppUpdates.state.value.available?.version)
        release = releaseJson("v$installed")
        assertNull(AppUpdates.check(context))
        assertNull(AppUpdates.state.value.available)
    }

    @Test
    fun downloadsIntoAnInstallerSessionAndCommits() = runBlocking {
        release = releaseJson("v99.0.0")
        val found = AppUpdates.check(context)!!
        AppUpdates.downloadAndInstall(context, found)
        assertNull(AppUpdates.state.value.error)
        assertEquals(UpdateState.Phase.INSTALLING, AppUpdates.state.value.phase)
        val sessions = context.packageManager.packageInstaller.mySessions
        assertEquals(1, sessions.size)
        assertEquals(context.packageName, sessions[0].appPackageName)
    }

    @Test
    fun installerResultsReachTheSettingsState() {
        val receiver = InstallResultReceiver()
        receiver.onReceive(context, Intent().putExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE_ABORTED))
        assertEquals("Install cancelled", AppUpdates.state.value.error)
        receiver.onReceive(context, Intent().putExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE_CONFLICT).putExtra(PackageInstaller.EXTRA_STATUS_MESSAGE, "Signatures do not match"))
        assertEquals("Signatures do not match", AppUpdates.state.value.error)
        assertEquals(UpdateState.Phase.IDLE, AppUpdates.state.value.phase)
        // The confirmation prompt Android asks for is launched for the user.
        val confirm = Intent("android.content.pm.action.CONFIRM_INSTALL")
        receiver.onReceive(context, Intent().putExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_PENDING_USER_ACTION).putExtra(Intent.EXTRA_INTENT, confirm))
        assertEquals("android.content.pm.action.CONFIRM_INSTALL", shadowOf(context).nextStartedActivity.action)
    }

    @Test
    fun settingsShowsAnAvailableReleaseAndTheAutomaticToggle() {
        release = releaseJson("v99.0.0")
        compose.setContent { AppUpdateSection() }
        compose.onNodeWithText("Not checked yet.").assertExists()
        compose.onNodeWithText("Check now").performClick()
        eventually { AppUpdates.state.value.available != null }
        compose.onNodeWithText("New release available: 99.0.0").assertExists()
        compose.onNodeWithText("Download and install update").assertExists()
        compose.onNodeWithText("Release notes").assertExists()
        assertTrue(UpdatePrefs(context).automaticChecks)
        compose.onNodeWithText("Check for updates automatically and notify me").assertExists()
        val work = androidx.work.WorkManager.getInstance(context)
        fun scheduled() = work.getWorkInfosForUniqueWork("app-update-check").get().filter { !it.state.isFinished }
        UpdateControl.apply(context)
        assertEquals(1, scheduled().size)
        assertEquals(6 * 3_600_000L, scheduled()[0].periodicityInfo?.repeatIntervalMillis)
        compose.onNode(androidx.compose.ui.test.isToggleable()).assertIsOn().performClick()
        assertFalse(UpdatePrefs(context).automaticChecks)
        assertEquals(0, scheduled().size)
    }
}
