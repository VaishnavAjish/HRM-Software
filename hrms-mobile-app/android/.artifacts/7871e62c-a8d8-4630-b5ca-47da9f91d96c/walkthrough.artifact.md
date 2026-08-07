# Walkthrough - Fix UNC Path Illegal Character Errors

I have fixed the "Illegal character in path" errors caused by spaces in the network share path.

## Changes Made

### Top-level Build File

#### [build.gradle](file:////192.168.1.53/f/HRMS oldd/hrms-mobile-app/android/build.gradle)
- Wrapped repository URLs in `uri(file(...))`. This ensures that Gradle correctly URI-encodes the path (e.g., converting spaces to `%20`), which is required for the `url` property in a `maven` block.

### Settings File

#### [settings.gradle](file:////192.168.1.53/f/HRMS oldd/hrms-mobile-app/android/settings.gradle)
- Wrapped `includeBuild` paths and `apply from:` paths in `file()`. This ensures Gradle treats them as local filesystem paths and handles the UNC prefix and spaces more robustly than raw strings.
- Wrapped `from(files(...))` source in `file()`.

## Verification Results

### Manual Verification
- The specific error "Illegal character in path at index 21" was caused by the space in `HRMS oldd` when interpreted as a URI. By using `uri(file(...))`, we explicitly handle this encoding.
- I recommend performing a **Gradle Sync** in Android Studio to confirm that the configuration phase now completes successfully.
