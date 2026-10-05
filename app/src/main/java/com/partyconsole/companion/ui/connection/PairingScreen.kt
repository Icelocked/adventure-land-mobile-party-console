package com.partyconsole.companion.ui.connection

import android.Manifest
import android.content.pm.PackageManager
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import kotlinx.coroutines.launch

/** Shown between the connection screen and the character list until this
 *  phone completes party-console's browser-pairing handshake (see
 *  PairingViewModel). Scan the QR code on an already-paired browser's Setup
 *  page, or paste its invite link. */
@Composable
fun PairingScreen(viewModel: PairingViewModel, onPaired: () -> Unit) {
    val state by viewModel.state.collectAsState()
    val submitting by viewModel.submitting.collectAsState()
    val error by viewModel.error.collectAsState()
    var manualInput by remember { mutableStateOf("") }
    var scanning by remember { mutableStateOf(false) }

    LaunchedEffect(state) {
        if (state is PairingState.Paired) onPaired()
    }

    Scaffold { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            when (state) {
                is PairingState.Checking -> CircularProgressIndicator()
                is PairingState.Paired -> Text("Paired.", color = MaterialTheme.colorScheme.primary)
                is PairingState.Unpaired -> {
                    Text("Pair this device", style = MaterialTheme.typography.headlineSmall)
                    Text(
                        "On your computer, open the party-console dashboard's Setup page, then under " +
                            "\"Connection settings\" click \"Pair another browser\". Scan the code it shows, " +
                            "or paste the link it gives you below.",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    if (scanning) {
                        QrScanner(
                            modifier = Modifier.fillMaxWidth().aspectRatio(1f),
                            onScanned = { value ->
                                scanning = false
                                viewModel.submitToken(value)
                            },
                        )
                        OutlinedButton(onClick = { scanning = false }, modifier = Modifier.fillMaxWidth()) {
                            Text("Cancel scan")
                        }
                    } else {
                        Button(onClick = { scanning = true }, modifier = Modifier.fillMaxWidth()) {
                            Text("Scan QR code")
                        }
                    }
                    OutlinedTextField(
                        value = manualInput,
                        onValueChange = { manualInput = it },
                        label = { Text("Or paste the invite link") },
                        placeholder = { Text("http://.../setup#...") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                    Button(
                        onClick = { viewModel.submitToken(manualInput) },
                        enabled = !submitting && manualInput.isNotBlank(),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(if (submitting) "Pairing…" else "Pair this device")
                    }
                    error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                }
            }
        }
    }
}

/** CameraX preview + on-device ML Kit QR decoding (no network call). Requests
 *  CAMERA at most once per screen visit; declining leaves the manual paste
 *  field, which is always present. */
@Composable
private fun QrScanner(modifier: Modifier = Modifier, onScanned: (String) -> Unit) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()
    var hasPermission by remember {
        mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED)
    }
    val permissionLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.RequestPermission(),
    ) { granted -> hasPermission = granted }

    LaunchedEffect(Unit) {
        if (!hasPermission) permissionLauncher.launch(Manifest.permission.CAMERA)
    }

    if (!hasPermission) {
        Text(
            "Camera permission was declined - paste the invite link below instead.",
            style = MaterialTheme.typography.bodySmall,
            modifier = modifier,
        )
        return
    }

    val scanner = remember {
        BarcodeScanning.getClient(BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build())
    }
    var scanned = remember { false }
    // bindToLifecycle ties the camera to the Activity's lifecycle, not this
    // composable's - without explicitly unbinding here, leaving this screen
    // (Cancel scan, or a successful scan) leaves the back camera bound and
    // running in the background until the host Activity itself stops.
    val boundCameraProvider = remember { arrayOfNulls<ProcessCameraProvider>(1) }
    DisposableEffect(Unit) {
        onDispose {
            boundCameraProvider[0]?.unbindAll()
            scanner.close()
        }
    }

    AndroidView(
        modifier = modifier,
        factory = { ctx ->
            val previewView = PreviewView(ctx)
            val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)
            cameraProviderFuture.addListener({
                val cameraProvider = cameraProviderFuture.get()
                boundCameraProvider[0] = cameraProvider
                val preview = androidx.camera.core.Preview.Builder().build().also {
                    it.setSurfaceProvider(previewView.surfaceProvider)
                }
                val analysis = ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()
                analysis.setAnalyzer(ContextCompat.getMainExecutor(ctx)) { imageProxy: ImageProxy ->
                    val mediaImage = imageProxy.image
                    if (mediaImage == null || scanned) {
                        imageProxy.close()
                        return@setAnalyzer
                    }
                    val input = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
                    scanner.process(input)
                        .addOnSuccessListener { barcodes ->
                            val value = barcodes.firstOrNull()?.rawValue
                            if (value != null && !scanned) {
                                scanned = true
                                scope.launch { onScanned(value) }
                            }
                        }
                        .addOnCompleteListener { imageProxy.close() }
                }
                cameraProvider.unbindAll()
                cameraProvider.bindToLifecycle(lifecycleOwner, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
            }, ContextCompat.getMainExecutor(ctx))
            previewView
        },
    )
}
