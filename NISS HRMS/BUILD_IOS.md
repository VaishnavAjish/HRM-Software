# NISS HRMS — iOS Build Guide

Expo SDK 51 / React Native 0.74.5 app. Everything buildable off-Mac is already done:

- iOS JS bundle compiles cleanly (2,333 modules, Hermes) — verified via `npx expo export --platform ios`
- Native Xcode project already generated at `ios/` (`NISSHRMS.xcworkspace` appears after pod install)
- Bundle ID `com.niss.hrmsmobile`, display name "NISS HRMS", app icon, permission
  strings, and the plain-HTTP (LAN) App Transport Security exception are all applied

Only CocoaPods + the Xcode compile remain, and those must run on macOS.

## One-time Mac prerequisites

- Xcode 15+ (App Store), then: `sudo xcode-select -s /Applications/Xcode.app`
- Node 18+ (`brew install node`)
- CocoaPods: `sudo gem install cocoapods` (or `brew install cocoapods`)

## Run and test

```bash
cd "NISS HRMS"
npm ci              # fresh install — the Windows node_modules should not be reused on macOS
npx expo run:ios    # installs pods automatically, builds, launches the Simulator
```

On a physical iPhone:

```bash
npx expo run:ios --device
```

First time on a device: open `ios/NISSHRMS.xcworkspace` in Xcode → project →
Signing & Capabilities → select your Apple ID team. A free Apple ID works for
testing (re-sign needed every 7 days). If signing fails with a Push
Notifications capability error on a free account, delete the `aps-environment`
key from `ios/NISSHRMS/NISSHRMS.entitlements` and build again.

## Backend URL

The app calls `http://192.168.1.53:8000/api` (see `src/config/apiUrl.js`).
The Mac/iPhone must be on the same LAN as the HRMS server with the backend
running. To point elsewhere without editing code:

```bash
EXPO_PUBLIC_API_URL=http://<server-ip>:8000/api npx expo run:ios
```

## Notes

- Do not run `npx expo prebuild` again unless you intend to regenerate `ios/`
  from scratch — it can overwrite the checked-in native project.
- Remote push notifications need a paid Apple Developer account (APNs); local
  notifications work without one.
- All Android-only code paths are guarded with `Platform.OS === 'android'` and
  have iOS fallbacks — no source changes needed.
