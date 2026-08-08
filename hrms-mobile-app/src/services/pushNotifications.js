import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { TOKEN_STORAGE_KEY } from './api';

const BASE_URL = 'http://192.168.1.53:8000/api';
const TASK = 'hrms-notification-poll';
const SURFACED_KEY = 'hrms_notif_surfaced';
const CHANNEL = 'hrms-default';

// Foreground behaviour: still raise a tray notification, since the bell badge
// alone is easy to miss while the user is on another screen.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/** Ids already pushed to the tray, so a re-poll never double-notifies. */
async function loadSurfaced() {
  try {
    const raw = await AsyncStorage.getItem(SURFACED_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch (e) {
    return new Set();
  }
}

async function saveSurfaced(set) {
  // Keep the tail only — this list exists to dedupe, not to be an archive.
  const trimmed = [...set].slice(-200);
  try {
    await AsyncStorage.setItem(SURFACED_KEY, JSON.stringify(trimmed));
  } catch (e) {
    /* non-fatal */
  }
}

/**
 * Fetches unread notifications and raises anything not seen before.
 *
 * Deliberately does not use ApiService: that keeps its token in memory, which
 * is gone when the OS wakes the background task in a fresh JS context. The
 * persisted session is the only credential available here.
 */
export async function syncNotificationsToTray() {
  let session = null;
  try {
    const raw = await AsyncStorage.getItem(TOKEN_STORAGE_KEY);
    session = raw ? JSON.parse(raw) : null;
  } catch (e) {
    return 0;
  }
  if (!session?.token) return 0;

  let rows = [];
  try {
    const res = await fetch(`${BASE_URL}/notifications?unread_only=true&limit=25`, {
      headers: {
        Accept: 'application/json',
        Authorization: `${session.tokenType || 'Bearer'} ${session.token}`,
      },
    });
    if (!res.ok) return 0;
    const body = await res.json();
    rows = body?.data || [];
  } catch (e) {
    return 0;
  }

  const surfaced = await loadSurfaced();
  const fresh = rows.filter((n) => !surfaced.has(`n${n.id}`));

  for (const n of fresh) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: n.title || 'NISS',
          body: n.description || '',
          data: { id: n.id, module: n.module },
          ...(Platform.OS === 'android' ? { channelId: CHANNEL } : {}),
        },
        trigger: null,
      });
      surfaced.add(`n${n.id}`);
    } catch (e) {
      /* keep going: one bad row shouldn't block the rest */
    }
  }

  await saveSurfaced(surfaced);
  return fresh.length;
}

TaskManager.defineTask(TASK, async () => {
  try {
    const count = await syncNotificationsToTray();
    return count > 0 ? BackgroundFetch.BackgroundFetchResult.NewData : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (e) {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function setupPushNotifications() {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    let granted = status === 'granted';
    if (!granted) {
      const req = await Notifications.requestPermissionsAsync();
      granted = req.status === 'granted';
    }
    if (!granted) return false;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: 'HRMS alerts',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#4F46E5',
      });
    }

    const registered = await TaskManager.isTaskRegisteredAsync(TASK);
    if (!registered) {
      // 15 min is the floor Android enforces for periodic background work;
      // anything smaller is silently rounded up by the OS.
      await BackgroundFetch.registerTaskAsync(TASK, {
        minimumInterval: 15 * 60,
        stopOnTerminate: false,
        startOnBoot: true,
      });
    }
    return true;
  } catch (e) {
    return false;
  }
}
