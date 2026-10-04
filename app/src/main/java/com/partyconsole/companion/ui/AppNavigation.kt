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
import com.partyconsole.companion.ui.account.BankScreen
import com.partyconsole.companion.ui.account.BestiaryScreen
import com.partyconsole.companion.ui.account.CatalogScreen
import com.partyconsole.companion.ui.account.LogsScreen
import com.partyconsole.companion.ui.account.MailScreen
import com.partyconsole.companion.ui.account.MarketScreen
import com.partyconsole.companion.ui.account.HuntSettingsScreen
import com.partyconsole.companion.ui.account.MerchantCommerceScreen
import com.partyconsole.companion.ui.account.OfferingsScreen
import com.partyconsole.companion.ui.account.RoutinesScreen
import com.partyconsole.companion.ui.account.SettingsScreen
import com.partyconsole.companion.ui.account.SkillsScreen
import com.partyconsole.companion.ui.account.StandScreen
import com.partyconsole.companion.ui.account.WtbScreen
import com.partyconsole.companion.ui.characterdetail.CharacterDetailScreen
import com.partyconsole.companion.ui.characterdetail.EquipmentScreen
import com.partyconsole.companion.ui.characterdetail.InventoryScreen
import com.partyconsole.companion.ui.characterlist.CharacterListScreen
import com.partyconsole.companion.ui.connection.ConnectionScreen
import com.partyconsole.companion.ui.connection.PairingScreen
import com.partyconsole.companion.ui.connection.PairingViewModel

/** Every screen shares one PartyViewModel (one live SSE connection) via
 *  getBackStackEntry(CHARACTER_LIST) scoping - see the comment on the
 *  detail route below, which explains why this matters. */
internal object Routes {
    const val CONNECTION = "connection"
    const val PAIRING = "pairing"
    const val CHARACTER_LIST = "characters"
    const val CHARACTER_DETAIL = "characters/{name}"
    const val INVENTORY = "characters/{name}/inventory"
    const val EQUIPMENT = "characters/{name}/equipment"
    const val ACCOUNT_MAIL = "account/mail"
    const val ACCOUNT_CATALOG = "account/catalog"
    const val ACCOUNT_BESTIARY = "account/bestiary"
    const val ACCOUNT_SKILLS = "account/skills"
    const val ACCOUNT_STAND = "account/stand"
    const val ACCOUNT_MARKET = "account/market"
    const val ACCOUNT_BANK = "account/bank"
    const val ACCOUNT_OFFERINGS = "account/offerings"
    const val ACCOUNT_LOGS = "account/logs"
    const val ACCOUNT_SETTINGS = "account/settings"
    const val MERCHANT_COMMERCE = "merchant/{mode}"
    const val ROUTINES = "routines"
    const val HUNT_SETTINGS = "characters/{name}/hunt-settings"
    const val WTB = "wtb"

    fun characterDetail(name: String) = "characters/$name"
    fun merchantCommerce(mode: String) = "merchant/$mode"
    fun huntSettings(name: String) = "characters/$name/hunt-settings"
    fun inventory(name: String) = "characters/$name/inventory"
    fun equipment(name: String) = "characters/$name/equipment"
}

@Composable
fun AppNavigation(store: ServerConfigStore) {
    val navController = rememberNavController()
    val settings by store.settings.collectAsState(initial = null)

    // A returning user with an already-saved server shouldn't see the
    // connection screen again - jump straight to the pairing gate (which
    // itself passes straight through to the party view once it confirms
    // this phone is already paired - see PairingViewModel) the first time
    // settings resolves to a real (non-null) value while we're still
    // sitting on the connection screen. Reading a fresh DataStore Flow
    // always completes quickly (local disk, no network), so the brief
    // connection-screen flash before this fires is not worth a separate
    // splash screen for a v1.
    LaunchedEffect(settings) {
        if (settings != null && navController.currentDestination?.route == Routes.CONNECTION) {
            navController.navigate(Routes.PAIRING) {
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
                    navController.navigate(Routes.PAIRING) {
                        popUpTo(Routes.CONNECTION) { inclusive = true }
                    }
                },
            )
        }
        composable(Routes.PAIRING) {
            val active = settings
            if (active == null) {
                navController.navigate(Routes.CONNECTION) { popUpTo(0) }
                return@composable
            }
            val viewModel: PairingViewModel = viewModel(factory = PairingViewModelFactory(active))
            PairingScreen(
                viewModel = viewModel,
                onPaired = {
                    navController.navigate(Routes.CHARACTER_LIST) {
                        popUpTo(Routes.PAIRING) { inclusive = true }
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
                onReconnect = { navController.navigate(Routes.PAIRING) { popUpTo(0) } },
                onNavigate = { route -> navController.navigate(route) },
            )
        }
        composable(
            Routes.CHARACTER_DETAIL,
            arguments = listOf(navArgument("name") { type = NavType.StringType }),
        ) { backStackEntry ->
            val active = settings ?: return@composable
            val name = backStackEntry.arguments?.getString("name") ?: return@composable
            // Shares the character-list screen's ViewModel (and therefore
            // its already-live SSE connection) instead of opening a second
            // one from scratch - every other route below does the same,
            // for the same reason (see this session's "isn't reporting in"
            // bug this fixed originally).
            val parentEntry = remember(backStackEntry) { navController.getBackStackEntry(Routes.CHARACTER_LIST) }
            val viewModel: PartyViewModel = viewModel(parentEntry, factory = PartyViewModelFactory(active))
            CharacterDetailScreen(
                viewModel = viewModel,
                characterName = name,
                onBack = { navController.popBackStack() },
                onSwitchCharacter = { other ->
                    // Replaces rather than stacks - switching repeatedly
                    // shouldn't grow the back stack one entry per tap.
                    navController.navigate(Routes.characterDetail(other)) {
                        popUpTo(Routes.CHARACTER_DETAIL) { inclusive = true }
                    }
                },
                onNavigate = { route -> navController.navigate(route) },
                onOpenMerchantCommerce = { commerceMode -> navController.navigate(Routes.merchantCommerce(commerceMode)) },
                onOpenRoutines = { navController.navigate(Routes.ROUTINES) },
                onOpenHuntSettings = { navController.navigate(Routes.huntSettings(name)) },
            )
        }
        composable(
            Routes.INVENTORY,
            arguments = listOf(navArgument("name") { type = NavType.StringType }),
        ) { backStackEntry ->
            val active = settings ?: return@composable
            val name = backStackEntry.arguments?.getString("name") ?: return@composable
            val parentEntry = remember(backStackEntry) { navController.getBackStackEntry(Routes.CHARACTER_LIST) }
            val viewModel: PartyViewModel = viewModel(parentEntry, factory = PartyViewModelFactory(active))
            InventoryScreen(viewModel, name, onBack = { navController.popBackStack() })
        }
        composable(
            Routes.EQUIPMENT,
            arguments = listOf(navArgument("name") { type = NavType.StringType }),
        ) { backStackEntry ->
            val active = settings ?: return@composable
            val name = backStackEntry.arguments?.getString("name") ?: return@composable
            val parentEntry = remember(backStackEntry) { navController.getBackStackEntry(Routes.CHARACTER_LIST) }
            val viewModel: PartyViewModel = viewModel(parentEntry, factory = PartyViewModelFactory(active))
            EquipmentScreen(viewModel, name, onBack = { navController.popBackStack() })
        }
        composable(Routes.ACCOUNT_MAIL) { backStackEntry ->
            val active = settings ?: return@composable
            val parentEntry = remember(backStackEntry) { navController.getBackStackEntry(Routes.CHARACTER_LIST) }
            val viewModel: PartyViewModel = viewModel(parentEntry, factory = PartyViewModelFactory(active))
            MailScreen(viewModel, onBack = { navController.popBackStack() })
        }
        composable(Routes.ACCOUNT_CATALOG) { backStackEntry ->
            val active = settings ?: return@composable
            val parentEntry = remember(backStackEntry) { navController.getBackStackEntry(Routes.CHARACTER_LIST) }
            val viewModel: PartyViewModel = viewModel(parentEntry, factory = PartyViewModelFactory(active))
            CatalogScreen(viewModel, onBack = { navController.popBackStack() })
        }
        composable(Routes.ACCOUNT_BESTIARY) { backStackEntry ->
            val active = settings ?: return@composable
            val parentEntry = remember(backStackEntry) { navController.getBackStackEntry(Routes.CHARACTER_LIST) }
            val viewModel: PartyViewModel = viewModel(parentEntry, factory = PartyViewModelFactory(active))
            BestiaryScreen(viewModel, onBack = { navController.popBackStack() })
        }
        composable(Routes.ACCOUNT_SKILLS) { backStackEntry ->
            val active = settings ?: return@composable
            val parentEntry = remember(backStackEntry) { navController.getBackStackEntry(Routes.CHARACTER_LIST) }
            val viewModel: PartyViewModel = viewModel(parentEntry, factory = PartyViewModelFactory(active))
            SkillsScreen(viewModel, onBack = { navController.popBackStack() })
        }
        composable(Routes.ACCOUNT_STAND) { backStackEntry ->
            val active = settings ?: return@composable
            val parentEntry = remember(backStackEntry) { navController.getBackStackEntry(Routes.CHARACTER_LIST) }
            val viewModel: PartyViewModel = viewModel(parentEntry, factory = PartyViewModelFactory(active))
            StandScreen(viewModel, onBack = { navController.popBackStack() })
        }
        composable(Routes.ACCOUNT_MARKET) { backStackEntry ->
            val active = settings ?: return@composable
            val parentEntry = remember(backStackEntry) { navController.getBackStackEntry(Routes.CHARACTER_LIST) }
            val viewModel: PartyViewModel = viewModel(parentEntry, factory = PartyViewModelFactory(active))
            MarketScreen(viewModel, onBack = { navController.popBackStack() }, onOpenWtb = { navController.navigate(Routes.WTB) })
        }
        composable(Routes.ACCOUNT_BANK) { backStackEntry ->
            val active = settings ?: return@composable
            val parentEntry = remember(backStackEntry) { navController.getBackStackEntry(Routes.CHARACTER_LIST) }
            val viewModel: PartyViewModel = viewModel(parentEntry, factory = PartyViewModelFactory(active))
            BankScreen(viewModel, onBack = { navController.popBackStack() })
        }
        composable(Routes.ACCOUNT_OFFERINGS) { backStackEntry ->
            val active = settings ?: return@composable
            val parentEntry = remember(backStackEntry) { navController.getBackStackEntry(Routes.CHARACTER_LIST) }
            val viewModel: PartyViewModel = viewModel(parentEntry, factory = PartyViewModelFactory(active))
            OfferingsScreen(viewModel, onBack = { navController.popBackStack() })
        }
        composable(Routes.ACCOUNT_LOGS) { backStackEntry ->
            val active = settings ?: return@composable
            val parentEntry = remember(backStackEntry) { navController.getBackStackEntry(Routes.CHARACTER_LIST) }
            val viewModel: PartyViewModel = viewModel(parentEntry, factory = PartyViewModelFactory(active))
            LogsScreen(viewModel, onBack = { navController.popBackStack() })
        }
        composable(Routes.ACCOUNT_SETTINGS) { backStackEntry ->
            val active = settings ?: return@composable
            val parentEntry = remember(backStackEntry) { navController.getBackStackEntry(Routes.CHARACTER_LIST) }
            val viewModel: PartyViewModel = viewModel(parentEntry, factory = PartyViewModelFactory(active))
            SettingsScreen(viewModel, onBack = { navController.popBackStack() })
        }
        composable(
            Routes.MERCHANT_COMMERCE,
            arguments = listOf(navArgument("mode") { type = NavType.StringType }),
        ) { backStackEntry ->
            val active = settings ?: return@composable
            val mode = backStackEntry.arguments?.getString("mode") ?: "buy"
            val parentEntry = remember(backStackEntry) { navController.getBackStackEntry(Routes.CHARACTER_LIST) }
            val viewModel: PartyViewModel = viewModel(parentEntry, factory = PartyViewModelFactory(active))
            MerchantCommerceScreen(viewModel, mode, onBack = { navController.popBackStack() })
        }
        composable(Routes.ROUTINES) { backStackEntry ->
            val active = settings ?: return@composable
            val parentEntry = remember(backStackEntry) { navController.getBackStackEntry(Routes.CHARACTER_LIST) }
            val viewModel: PartyViewModel = viewModel(parentEntry, factory = PartyViewModelFactory(active))
            RoutinesScreen(viewModel, onBack = { navController.popBackStack() })
        }
        composable(
            Routes.HUNT_SETTINGS,
            arguments = listOf(navArgument("name") { type = NavType.StringType }),
        ) { backStackEntry ->
            val active = settings ?: return@composable
            val name = backStackEntry.arguments?.getString("name") ?: return@composable
            val parentEntry = remember(backStackEntry) { navController.getBackStackEntry(Routes.CHARACTER_LIST) }
            val viewModel: PartyViewModel = viewModel(parentEntry, factory = PartyViewModelFactory(active))
            HuntSettingsScreen(viewModel, name, onBack = { navController.popBackStack() })
        }
        composable(Routes.WTB) { backStackEntry ->
            val active = settings ?: return@composable
            val parentEntry = remember(backStackEntry) { navController.getBackStackEntry(Routes.CHARACTER_LIST) }
            val viewModel: PartyViewModel = viewModel(parentEntry, factory = PartyViewModelFactory(active))
            WtbScreen(viewModel, onBack = { navController.popBackStack() })
        }
    }
}
