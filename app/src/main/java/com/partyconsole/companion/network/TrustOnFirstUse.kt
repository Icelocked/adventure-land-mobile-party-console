package com.partyconsole.companion.network

import java.security.MessageDigest
import java.security.SecureRandom
import java.security.cert.Certificate
import java.security.cert.X509Certificate
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocketFactory
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

/** SHA-256 fingerprint of a certificate, formatted the same way `openssl
 *  x509 -fingerprint -sha256` and browser cert-detail UIs show it
 *  (colon-separated uppercase hex) - so what this app displays can be
 *  compared directly against what the server operator sees, the same
 *  verification step a browser's "this site's certificate" dialog is
 *  for. This is the actual security-relevant check for a self-signed/
 *  local-CA server: whoever set up the server reads the fingerprint off
 *  it directly (Caddy logs it, or `openssl s_client` against the server
 *  shows it) and the app user confirms the two match before trusting it. */
fun Certificate.sha256Fingerprint(): String {
    val digest = MessageDigest.getInstance("SHA-256").digest(this.encoded)
    return digest.joinToString(":") { "%02X".format(it) }
}

/** Connects with no trust validation at all purely to read the server's
 *  presented certificate chain, so the connection screen can show its
 *  fingerprint to the user before anything is trusted or any real request
 *  is sent. Never used for an actual API call - see PartyApiClient, which
 *  always builds its client from a specific, already-decided TrustMode. */
object CertificateInspector {
    class UntrustedButRecorded : Exception("inspection-only connection")

    /** Returns the leaf certificate's SHA-256 fingerprint, or null if the
     *  host could not be reached at all (DNS failure, connection refused,
     *  timeout - a genuine reachability problem, distinct from "reachable
     *  but untrusted" which this function is specifically for). */
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

/** Trusts exactly one pinned certificate fingerprint and nothing else -
 *  deliberately narrower than "trust this CA" (which would trust anything
 *  else that CA ever issues): this app only ever talks to one server, so
 *  pinning that server's own leaf certificate is both simpler and safer
 *  than importing a CA. If the server's certificate ever legitimately
 *  changes (renewal, reinstall), the connection screen's fingerprint
 *  mismatch is expected and the user re-confirms the new one - the same
 *  experience as a browser warning about a changed certificate. */
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
