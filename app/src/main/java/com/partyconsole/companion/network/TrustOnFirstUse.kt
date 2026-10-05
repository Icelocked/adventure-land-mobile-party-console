package com.partyconsole.companion.network

import java.security.MessageDigest
import java.security.SecureRandom
import java.security.cert.Certificate
import java.security.cert.X509Certificate
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocketFactory
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

/** SHA-256 fingerprint as colon-separated uppercase hex, the format
 *  `openssl x509 -fingerprint -sha256` and browsers show, so the user can
 *  compare it with what the server operator sees before trusting it. */
fun Certificate.sha256Fingerprint(): String {
    val digest = MessageDigest.getInstance("SHA-256").digest(this.encoded)
    return digest.joinToString(":") { "%02X".format(it) }
}

/** Connects without trust validation only to read the server's certificate
 *  so its fingerprint can be shown before anything is trusted. Never used
 *  for API calls. */
object CertificateInspector {
    class UntrustedButRecorded : Exception("inspection-only connection")

    /** The leaf certificate's SHA-256 fingerprint, or null if the host
     *  could not be reached at all. */
    fun fetchFingerprint(host: String, port: Int): String? {
        val trustAllForInspectionOnly = object : X509TrustManager {
            override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
            override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
            override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
        }
        val context = SSLContext.getInstance("TLS")
        context.init(null, arrayOf(trustAllForInspectionOnly), SecureRandom())
        return try {
            context.socketFactory.createSocket(host, port).use { socket ->
                val ssl = socket as javax.net.ssl.SSLSocket
                ssl.startHandshake()
                val leaf = ssl.session.peerCertificates.firstOrNull() ?: return null
                leaf.sha256Fingerprint()
            }
        } catch (e: Exception) {
            null
        }
    }
}

/** Trusts exactly one leaf certificate fingerprint - narrower than trusting
 *  its CA. When the certificate legitimately changes (renewal, reinstall)
 *  the user re-confirms the new fingerprint on the connection screen. */
class PinnedTrustManager(private val expectedFingerprint: String) : X509TrustManager {
    override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {}

    override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {
        val leaf = chain?.firstOrNull()
            ?: throw java.security.cert.CertificateException("no certificate presented")
        val actual = leaf.sha256Fingerprint()
        if (!actual.equals(expectedFingerprint, ignoreCase = true)) {
            throw java.security.cert.CertificateException(
                "Server certificate changed - expected $expectedFingerprint, got $actual. " +
                    "Re-confirm the new fingerprint on the connection screen before trusting it.",
            )
        }
    }

    override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()

    fun socketFactory(): SSLSocketFactory {
        val context = SSLContext.getInstance("TLS")
        context.init(null, arrayOf<TrustManager>(this), SecureRandom())
        return context.socketFactory
    }
}
