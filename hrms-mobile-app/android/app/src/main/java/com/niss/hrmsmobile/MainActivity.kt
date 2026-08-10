package com.niss.hrmsmobile

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Promise
import java.io.File

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {

  // Native camera capture built on the original, most fundamental Android
  // APIs — startActivityForResult/onActivityResult and
  // requestPermissions/onRequestPermissionsResult — deliberately avoiding BOTH
  // suspects investigated so far: React Native's legacy PermissionAwareActivity
  // bridge, and androidx.activity's newer Activity Result API (used by
  // registerForActivityResult and by expo-image-picker's own camera launcher).
  // Camera works fine in every other app on this device/emulator, so the fault
  // is in how THIS app is notified of a result — not the camera hardware or OS
  // camera app. These classic callbacks are delivered directly by the
  // Activity/Instrumentation layer with no intermediate registry to fail.
  private var pendingCameraPromise: Promise? = null
  private var pendingCameraUri: Uri? = null

  private val cameraPermissionRequestCode = 5001
  private val cameraCaptureRequestCode = 5002

  fun takePictureClassic(promise: Promise) {
    if (pendingCameraPromise != null) {
      promise.reject("IN_PROGRESS", "A camera capture is already in progress")
      return
    }
    pendingCameraPromise = promise

    if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
      ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.CAMERA), cameraPermissionRequestCode)
      return
    }
    launchCameraIntent()
  }

  private fun launchCameraIntent() {
    try {
      val file = File(cacheDir, "camera_${System.currentTimeMillis()}.jpg")
      // Reuses expo-image-picker's own FileProvider authority, already
      // registered in the manifest with cache-path coverage — a static
      // resolution against that manifest entry, not tied to its Kotlin class.
      val uri = FileProvider.getUriForFile(this, "$packageName.ImagePickerFileProvider", file)
      pendingCameraUri = uri
      val intent = Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
        putExtra(MediaStore.EXTRA_OUTPUT, uri)
        addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
      }
      if (intent.resolveActivity(packageManager) == null) {
        pendingCameraPromise?.reject("NO_CAMERA_APP", "No camera app available to handle this request")
        pendingCameraPromise = null
        return
      }
      @Suppress("DEPRECATION")
      startActivityForResult(intent, cameraCaptureRequestCode)
    } catch (e: Exception) {
      pendingCameraPromise?.reject("LAUNCH_FAILED", e.message ?: "Could not launch the camera", e)
      pendingCameraPromise = null
    }
  }

  override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
    // super first: preserves expo-modules-core's own PermissionsService
    // forwarding for any request it has pending under its own request code.
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (requestCode == cameraPermissionRequestCode) {
      val granted = grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED
      if (granted) {
        launchCameraIntent()
      } else {
        pendingCameraPromise?.reject("PERMISSION_DENIED", "Camera permission was denied")
        pendingCameraPromise = null
      }
    }
  }

  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    // super first: preserves React Native's own ActivityEventListener
    // forwarding for any other library using the classic result callback.
    super.onActivityResult(requestCode, resultCode, data)
    if (requestCode == cameraCaptureRequestCode) {
      val promise = pendingCameraPromise
      val uri = pendingCameraUri
      pendingCameraPromise = null
      pendingCameraUri = null
      if (resultCode == Activity.RESULT_OK && uri != null) {
        promise?.resolve(uri.toString())
      } else {
        // Null result reads as "user backed out" on the JS side, not an error.
        promise?.resolve(null)
      }
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    setTheme(R.style.AppTheme);
    super.onCreate(null)
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "main"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  /**
    * Align the back button behavior with Android S
    * where moving root activities to background instead of finishing activities.
    * @see <a href="https://developer.android.com/reference/android/app/Activity#onBackPressed()">onBackPressed</a>
    */
  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              // For non-root activities, use the default implementation to finish them.
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      // Use the default back button implementation on Android S
      // because it's doing more than [Activity.moveTaskToBack] in fact.
      super.invokeDefaultOnBackPressed()
  }
}
