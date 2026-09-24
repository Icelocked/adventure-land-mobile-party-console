package com.partyconsole.companion.ui.itemicon

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import com.partyconsole.companion.model.CatalogItem
import com.partyconsole.companion.model.MerchantCatalog

/** Builds an id->catalog-entry lookup once per catalog update instead of a
 *  linear scan per icon (the catalog can hold thousands of items) - an
 *  item instance's `.name` field is the game's internal identifier and
 *  matches a catalog entry's `.id`, NOT its `.name` - `.name` on the
 *  catalog entry is the human-readable display name ("Ring of Strength"
 *  vs. the instance's internal "strearring"). Every place that shows an
 *  item should show [displayName], not the raw instance field. */
@Composable
fun rememberCatalogLookup(catalog: MerchantCatalog?): (String) -> CatalogItem? {
    val byId = remember(catalog) {
        catalog?.allItems?.associateBy { it.id }.orEmpty()
    }
    return { name -> byId[name] }
}

/** Human-readable display name for an item instance's internal
 *  identifier, falling back to the raw identifier itself when it isn't
 *  (yet) present in the catalog (e.g. catalog still loading). */
fun displayName(internalName: String, catalogFor: (String) -> CatalogItem?): String =
    catalogFor(internalName)?.name ?: internalName
