package com.partyconsole.companion.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.partyconsole.companion.network.ServerConfigStore
import com.partyconsole.companion.ui.characterdetail.CharacterDetailScreen
import com.partyconsole.companion.ui.characterlist.CharacterListScreen
import com.partyconsole.companion.ui.connection.ConnectionScreen

private object Routes {
    const val CONNECTION = "connection"
    const val CHARACTER_LIST = "characters"
    const val CHARACTER_DETAIL = "characters/{name}"
    fun characterDetail(name: String) = "characters/$name"
}

@Composable
fun AppNavigation(store: ServerConfigStore) {
    val navController = rememberNavController()
    val settings by store.settings.collectAsState(initial = null)

    // A returning user with an already-saved server shouldn't see the
    // connection screen again - jump straight to the party view the first
    // time settings resolves to a real (non-null) value while we're still
    // sitting on the connection screen. Reading a fresh DataStore Flow
    // always completes quickly (local disk, no network), so the brief
    // connection-screen flash before this fires is not worth a separate
    // splash screen for a v1.
    LaunchedEffect(settings) {
        if (settings != null && navController.currentDestination?.route == Routes.CONNECTION) {
            navController.navigate(Routes.CHARACTER_LIST) {
                popUpTo(Routes.CONNECTION) { inclusive = true }
            }
        }
    }

    NavHost(
        navController = navController,
        startDestination = Routes.CONNECTION,
    ) {
        composable(Routes.CONNECTION) {
            val viewModel: com.partyconsole.companion.ui.connection.ConnectionViewModel =
                viewModel(factory = ConnectionViewModelFactory(store))
            ConnectionScreen(
                viewModel = viewModel,
                onConnected = {
                    navController.navigate(Routes.CHARACTER_LIST) {
                        popUpTo(Routes.CONNECTION) { inclusive = true }
                    }
                },
            )
        }
        composable(Routes.CHARACTER_LIST) {
            val active = settings
            if (active == null) {
                // Settings were cleared (e.g. "forget server") while this
                // screen was still on the back stack - bounce back rather
                // than showing a broken party view with no connection.
                navController.navigate(Routes.CONNECTION) { popUpTo(0) }
                return@composable
            }
            val viewModel: PartyViewModel = viewModel(factory = PartyViewModelFactory(active))
            CharacterListScreen(
                viewModel = viewModel,
                onSelectCharacter = { name -> navController.navigate(Routes.characterDetail(name)) },
            )
        }
        composable(
            Routes.CHARACTER_DETAIL,
            arguments = listOf(navArgument("name") { type = NavType.StringType }),
        ) { backStackEntry ->
            val active = settings ?: return@composable
            val name = backStackEntry.arguments?.getString("name") ?: return@composable
            // Reuses the character-list screen's ViewModel instance via the
            // same navigation graph scope would be ideal (one live
            // connection, not two) - left as a v1 simplification (a second
            // PartyRepository/SSE connection opens per detail screen visit)
            // with a clear TODO rather than a silent inefficiency: switch
            // this to a nav-graph-scoped viewModel() once the app has more
            // than these two screens to coordinate.
            val viewModel: PartyViewModel = viewModel(factory = PartyViewModelFactory(active))
            CharacterDetailScreen(
                viewModel = viewModel,
                characterName = name,
                onBack = { navController.popBackStack() },
            )
        }
    }
}
