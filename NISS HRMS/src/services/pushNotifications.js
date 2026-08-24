import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { API_BASE_URL } from '../config/apiUrl';
import { loadToken } from './secureStore';

const BASE_URL = API_BASE_URL;
const TASK = 'hrms-notification-poll';
const SURFACED_KEY = 'hrms_notif_surfaced';
const CHANNEL = 'hrms-default';

function getNotifications() {
  try { return require('expo-notifications'); } catch (e) { return null; }
}

function getTaskManager() {
  try { return require('expo-task-manager'); } catch (e) { return null; }
}

function getBackgroundFetch() {
  try { return require('expo-background-fetch'); } catch (e) { return null; }
}

// Safely setup handler
try {
  const Notifs = getNotifications();
  if (Notifs && Notifs.setNotificationHandler) {
    Notifs.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  }
} catch (e) {}

async function loadSurfaced() {
  try {
    const raw = await AsyncStorage.getItem(SURFACED_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch (e) {
    return new Set();
  }
}

async function saveSurfaced(set) {
  const trimmed = [...set].slice(-200);
  try {
    await AsyncStorage.setItem(SURFACED_KEY, JSON.stringify(trimmed));
  } catch (e) {}
}

export async function syncNotificationsToTray() {
  const Notifs = getNotifications();
  if (!Notifs) return 0;
  const session = await loadToken();
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
      await Notifs.scheduleNotificationAsync({
        content: {
          title: n.title || 'NISS',
          body: n.description || '',
          data: { id: n.id, module: n.module },
          ...(Platform.OS === 'android' ? { channelId: CHANNEL } : {}),
        },
        trigger: null,
      });
      surfaced.add(`n${n.id}`);
    } catch (e) {}
  }

  await saveSurfaced(surfaced);
  return fresh.length;
}

try {
  const TaskMgr = getTaskManager();
  if (TaskMgr && TaskMgr.defineTask) {
    TaskMgr.defineTask(TASK, async () => {
      try {
        const count = await syncNotificationsToTray();
        const BgFetch = getBackgroundFetch();
        if (BgFetch) {
          return count > 0 ? BgFetch.BackgroundFetchResult.NewData : BgFetch.BackgroundFetchResult.NoData;
        }
      } catch (e) {
        const BgFetch = getBackgroundFetch();
        if (BgFetch) return BgFetch.BackgroundFetchResult.Failed;
      }
    });
  }
} catch (e) {}

export async function setupPushNotifications() {
  try {
    const Notifs = getNotifications();
    const TaskMgr = getTaskManager();
    const BgFetch = getBackgroundFetch();
    if (!Notifs || !TaskMgr || !BgFetch) return false;

    const { status } = await Notifs.getPermissionsAsync();
    let granted = status === 'granted';
    if (!granted) {
      const req = await Notifs.requestPermissionsAsync();
      granted = req.status === 'granted';
    }
    if (!granted) return false;

    if (Platform.OS === 'android') {
      await Notifs.setNotificationChannelAsync(CHANNEL, {
        name: 'HRMS alerts',
        importance: Notifs.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#4F46E5',
      });
    }

    const registered = await TaskMgr.isTaskRegisteredAsync(TASK);
    if (!registered) {
      await BgFetch.registerTaskAsync(TASK, {
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
