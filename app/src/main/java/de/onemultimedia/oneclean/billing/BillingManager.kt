package de.onemultimedia.oneclean.billing

import android.app.Activity
import android.content.Context
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Was die kostenlose Version darf. */
object FreeLimits {
    /** So viele Einträge (Termine / Dateien) dürfen kostenlos auf einmal gelöscht werden. */
    const val DELETE_PER_ACTION = 10
}

/**
 * „OneClean Pro“ als Einmalkauf über Google Play.
 * In der Play Console muss dafür ein In-App-Produkt mit der ID [PRODUCT_ID] angelegt und aktiviert sein.
 */
class BillingManager(context: Context) : PurchasesUpdatedListener {

    companion object {
        const val PRODUCT_ID = "oneclean_pro"
        private const val PREFS = "billing"
        private const val KEY_PRO = "pro"
    }

    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private val _isPro = MutableStateFlow(prefs.getBoolean(KEY_PRO, false))
    val isPro: StateFlow<Boolean> = _isPro.asStateFlow()

    /** Formatierter Preis aus dem Play Store, z. B. „2,99 €“ – null, solange unbekannt. */
    private val _price = MutableStateFlow<String?>(null)
    val price: StateFlow<String?> = _price.asStateFlow()

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    private var productDetails: ProductDetails? = null

    private val client: BillingClient = BillingClient.newBuilder(context.applicationContext)
        .setListener(this)
        .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
        .build()

    fun start() {
        if (client.isReady) {
            refresh()
            return
        }
        client.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                if (result.responseCode == BillingClient.BillingResponseCode.OK) refresh()
            }

            override fun onBillingServiceDisconnected() {
                // Wird beim nächsten start() bzw. Kauf erneut verbunden
            }
        })
    }

    fun clearMessage() {
        _message.value = null
    }

    /** Lädt Preis und bestehende Käufe (stellt Pro z. B. nach Neuinstallation wieder her). */
    fun refresh() {
        if (!client.isReady) return
        val params = QueryProductDetailsParams.newBuilder()
            .setProductList(
                listOf(
                    QueryProductDetailsParams.Product.newBuilder()
                        .setProductId(PRODUCT_ID)
                        .setProductType(BillingClient.ProductType.INAPP)
                        .build()
                )
            )
            .build()
        client.queryProductDetailsAsync(params) { result, detailsResult ->
            if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                val details = detailsResult.productDetailsList.firstOrNull { it.productId == PRODUCT_ID }
                productDetails = details
                _price.value = details?.oneTimePurchaseOfferDetails?.formattedPrice
            }
        }
        client.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build()
        ) { result, purchases ->
            if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                setPro(purchases.any { it.isProPurchase() })
                purchases.forEach { acknowledge(it) }
            }
        }
    }

    fun buy(activity: Activity) {
        val details = productDetails
        if (!client.isReady || details == null) {
            _message.value = "Der Play Store ist gerade nicht erreichbar. Bitte später erneut versuchen."
            start()
            return
        }
        val params = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(
                listOf(BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(details).build())
            )
            .build()
        client.launchBillingFlow(activity, params)
    }

    override fun onPurchasesUpdated(result: BillingResult, purchases: MutableList<Purchase>?) {
        when (result.responseCode) {
            BillingClient.BillingResponseCode.OK -> purchases.orEmpty().forEach { p ->
                if (p.isProPurchase()) {
                    setPro(true)
                    acknowledge(p)
                    _message.value = "Danke! OneClean Pro ist jetzt freigeschaltet."
                } else if (p.products.contains(PRODUCT_ID) &&
                    p.purchaseState == Purchase.PurchaseState.PENDING
                ) {
                    _message.value = "Zahlung ausstehend – Pro wird freigeschaltet, sobald sie bestätigt ist."
                }
            }
            BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED -> {
                setPro(true)
                _message.value = "Du hast OneClean Pro bereits – wiederhergestellt."
            }
            BillingClient.BillingResponseCode.USER_CANCELED -> Unit
            else -> _message.value = "Kauf nicht möglich (${result.debugMessage.ifBlank { "Code ${result.responseCode}" }})."
        }
    }

    private fun Purchase.isProPurchase() =
        products.contains(PRODUCT_ID) && purchaseState == Purchase.PurchaseState.PURCHASED

    /** Käufe müssen innerhalb von 3 Tagen bestätigt werden, sonst erstattet Google sie automatisch. */
    private fun acknowledge(p: Purchase) {
        if (!p.isProPurchase() || p.isAcknowledged) return
        client.acknowledgePurchase(
            AcknowledgePurchaseParams.newBuilder().setPurchaseToken(p.purchaseToken).build()
        ) { }
    }

    private fun setPro(pro: Boolean) {
        _isPro.value = pro
        prefs.edit().putBoolean(KEY_PRO, pro).apply()
    }
}
