import { registerRootComponent } from 'expo';

import App from './App';

// Expo SDK 50+ entry point. The native MainApplication asks Metro for
// `.expo/.virtual-metro-entry`, which Expo generates from this file — the older
// `node_modules/expo/AppEntry.js` main field predates that and leaves the
// native side requesting a bundle Metro never builds.
registerRootComponent(App);
