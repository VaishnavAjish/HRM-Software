# Implementation Plan - Run the App

The goal is to build and run the HRMS mobile app on the connected Android emulator.

## User Review Required

> [!IMPORTANT]
> The project is located on a network share (UNC path: `\\192.168.1.53\f\HRMS oldd\hrms-mobile-app`).
> Gradle and some Node.js tools may have issues with UNC paths.
> If the build fails due to the path, I may need to map the directory to a local drive letter or suggest moving the project to a local drive.

## Proposed Changes

No source code changes are proposed. The task involves executing build and run commands.

### Execution Steps

1. **Verify Emulator Connection**
   - Ensure `emulator-5554` is active and responsive.
2. **Start Metro Bundler**
   - Run the development server in the background.
3. **Build and Deploy to Android**
   - Execute `npm run android` (which maps to `expo run:android`) to compile the native code and install it on the emulator.

## Verification Plan

### Manual Verification
- Confirm that the Metro Bundler starts successfully.
- Confirm that the Android build completes without errors.
- Confirm that the app launches on the `emulator-5554` device.
