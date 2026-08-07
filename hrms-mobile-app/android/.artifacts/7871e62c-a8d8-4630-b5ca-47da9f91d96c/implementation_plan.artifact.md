# Implementation Plan - Fix "Illegal character in path" Errors (UNC Paths)

The previous changes introduced a build failure because `file()` and relative path strings in Gradle do not automatically URI-encode spaces when used in contexts that expect a URI (like `maven { url ... }` or `apply from: ...`), especially on UNC paths.

## User Review Required

> [!IMPORTANT]
> The project is located on a network share (`//192.168.1.53/...`) and contains spaces in the path (`HRMS oldd`). This is a complex environment for Gradle. I will use the `uri()` helper method which is designed to handle path resolution and URI encoding correctly.

## Proposed Changes

### [Component] Gradle Build Configuration

#### [MODIFY] [build.gradle](file:////192.168.1.53/f/HRMS oldd/hrms-mobile-app/android/build.gradle)
- Use `uri()` for maven repository URLs. This will ensure spaces in the UNC path are correctly encoded (e.g., `%20`).

#### [MODIFY] [app/build.gradle](file:////192.168.1.53/f/HRMS oldd/hrms-mobile-app/android/app/build.gradle)
- Ensure all path resolutions that might be used as URIs use `uri()` or are handled as `File` objects explicitly.

#### [MODIFY] [settings.gradle](file:////192.168.1.53/f/HRMS oldd/hrms-mobile-app/android/settings.gradle)
- Use `uri()` for `apply from:` and `from(files(...))` if necessary, or revert to `new File(rootDir, ...)` which is more robust for joining paths in this specific environment.
- Actually, `apply from: uri(...)` or `apply from: file(...)`.

## Verification Plan

### Automated Tests
- Run `gradlew help` (though it might fail in the shell due to UNC limitations, it's a good check).
- I will rely on the user to confirm the IDE build works, as the IDE handles UNC paths better than the basic shell.

### Manual Verification
- Ask the user to trigger a Gradle Sync/Build in Android Studio.
