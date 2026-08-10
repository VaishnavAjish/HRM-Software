package com.niss.hrmsmobile

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Native camera capture — see MainActivity.kt's takePictureClassic for why
 * this exists: both expo-image-picker's permission request and its camera
 * launcher have been observed to hang indefinitely on some Android
 * developer-preview builds. This delegates the whole flow (permission +
 * capture) to MainActivity, built on the original startActivityForResult/
 * onActivityResult and requestPermissions/onRequestPermissionsResult APIs.
 */
class CameraPermissionModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "CameraPermissionModule"

  /**
   * Resolves the saved photo's content:// URI, or null if the user backed out
   * without one. Rejects (e.g. code PERMISSION_DENIED) on failure.
   */
  @ReactMethod
  fun takePicture(promise: Promise) {
    val activity = currentActivity as? MainActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "No current MainActivity instance to launch the camera from")
      return
    }
    activity.takePictureClassic(promise)
  }
}
