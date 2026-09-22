package com.partyconsole.companion.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.CreationExtras
import com.partyconsole.companion.network.ServerConfigStore
import com.partyconsole.companion.network.ServerSettings
import com.partyconsole.companion.ui.connection.ConnectionViewModel

/** Manual ViewModel factories - deliberately no DI framework (Hilt/Koin)
 *  for this v1 skeleton. Two ViewModels, two obvious dependencies each;
 *  worth introducing real DI once the app grows past that, not before. */
class ConnectionViewModelFactory(private val store: ServerConfigStore) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>, extras: CreationExtras): T {
        @Suppress("UNCHECKED_CAST")
        return ConnectionViewModel(store) as T
    }
}

class PartyViewModelFactory(private val settings: ServerSettings) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>, extras: CreationExtras): T {
        @Suppress("UNCHECKED_CAST")
        return PartyViewModel(settings) as T
    }
}
