import { App } from "@capacitor/app";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Share } from "@capacitor/share";

const STORAGE_KEY = "studyflow-native-notification-ids";
const FOCUS_NOTIFICATION_KEY = "focus:active-session";
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
let lastScheduleSignature = "";
let notificationListener;
let appStateListener;

const ExactAlarmPlugin = registerPlugin("ExactAlarm", {
  web: {
    async checkExactAlarmPermission() {
      return { available: false, granted: false, supported: false };
    },
    async openExactAlarmSettings() {
      return { opened: false, supported: false };
    }
  }
});

export function isAndroidNative() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

function stableId(key) {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 2147483646 + 1;
}

function makeNotification(key, title, body, page, schedule) {
  return {
    id: stableId(key),
    title,
    body,
    schedule,
    channelId: "studyflow-reminders",
    smallIcon: "ic_stat_icon_config_sample",
    iconColor: "#92f3f5",
    extra: { studyflow: true, key, page }
  };
}

function weeklyNotification(notifications, key, title, body, page, weekday, time) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time || "");
  if (!match) return;
  const [, hour, minute] = match;
  notifications.push(makeNotification(
    key,
    title,
    body,
    page,
    { on: { weekday: weekday + 1, hour: Number(hour), minute: Number(minute) } }
  ));
}

function notificationPreferences(state) {
  const preferences = state.notificationPreferences || {};
  return {
    categories: {
      tasks: true,
      timetable: true,
      study: true,
      water: false,
      gym: false,
      skincare: false,
      ...preferences.categories
    },
    waterIntervalMinutes: Number(preferences.waterIntervalMinutes) || 120,
    waterStart: preferences.waterStart || "08:00",
    waterEnd: preferences.waterEnd || "22:00",
    skincareMorningTime: preferences.skincareMorningTime || "08:00",
    skincareNightTime: preferences.skincareNightTime || "22:00",
    gymTime: preferences.gymTime || "17:00"
  };
}

export function buildNotificationSchedule(state, now = new Date()) {
  if (!state?.settings?.notifications) return [];

  const preferences = notificationPreferences(state);
  const notifications = [];

  if (preferences.categories.tasks) {
    for (const task of state.tasks || []) {
      if (!task.reminder || task.completed || !task.dueDate || !task.dueTime) continue;
      const scheduledAt = new Date(`${task.dueDate}T${task.dueTime}:00`);
      if (Number.isNaN(scheduledAt.getTime()) || scheduledAt <= now) continue;
      notifications.push(makeNotification(
        `task:${task.id}`,
        "StudyFlow · Task reminder",
        task.title,
        "tasks",
        { at: scheduledAt }
      ));
    }
  }

  if (preferences.categories.timetable || preferences.categories.study) {
    for (const [weekdayName, activities] of Object.entries(state.timetable || {})) {
      const weekday = WEEKDAY_NAMES.indexOf(weekdayName);
      if (weekday < 0) continue;
      for (const activity of activities || []) {
        const isStudy = activity.studyTracking ?? /study|revision/i.test(activity.name || "");
        const enabled = isStudy
          ? preferences.categories.study || (preferences.categories.timetable && activity.reminder)
          : preferences.categories.timetable && activity.reminder;
        if (!enabled) continue;
        if (isStudy && state.studyTracking?.automaticEnabled && preferences.categories.study) {
          const startMinutes = timeToMinutes(activity.start);
          if (startMinutes !== null && startMinutes >= 5) {
            const reminderMinutes = startMinutes - 5;
            const reminderTime = `${String(Math.floor(reminderMinutes / 60)).padStart(2, "0")}:${String(reminderMinutes % 60).padStart(2, "0")}`;
            weeklyNotification(
              notifications,
              `study-upcoming:${activity.id}:${weekday}`,
              "StudyFlow · Study period soon",
              `${activity.name} starts in 5 minutes. StudyFlow only tracks time while the app is visible and recently active.`,
              "focus",
              weekday,
              reminderTime
            );
          }
        }
        weeklyNotification(
          notifications,
          `activity:${activity.id}:${weekday}`,
          isStudy ? "StudyFlow · Study session" : "StudyFlow · Timetable",
          activity.name,
          isStudy ? "study" : "timetable",
          weekday,
          activity.start
        );
      }
    }
  }

  if (preferences.categories.water) {
    const startMinutes = timeToMinutes(preferences.waterStart);
    const endMinutes = timeToMinutes(preferences.waterEnd);
    const interval = Math.max(60, Math.min(240, preferences.waterIntervalMinutes));
    if (startMinutes !== null && endMinutes !== null && endMinutes > startMinutes) {
      for (let minuteOfDay = startMinutes + interval; minuteOfDay <= endMinutes; minuteOfDay += interval) {
        const time = `${String(Math.floor(minuteOfDay / 60)).padStart(2, "0")}:${String(minuteOfDay % 60).padStart(2, "0")}`;
        for (let weekday = 0; weekday < 7; weekday += 1) {
          weeklyNotification(notifications, `water:${weekday}:${time}`, "StudyFlow · Water break", "Pause for a moment and have some water.", "water", weekday, time);
        }
      }
    }
  }

  if (preferences.categories.gym) {
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const day = WEEKDAY_NAMES[weekday];
      const workout = state.gymRoutine?.[day] || "Rest";
      if (workout === "Rest") continue;
      weeklyNotification(notifications, `gym:${day}`, "StudyFlow · Workout time", `Today's plan: ${workout}.`, "gym", weekday, preferences.gymTime);
    }
  }

  if (preferences.categories.skincare) {
    for (let weekday = 0; weekday < 7; weekday += 1) {
      weeklyNotification(notifications, `skincare:morning:${weekday}`, "StudyFlow · Morning routine", "A gentle start: face wash and your usual sunscreen.", "skincare", weekday, preferences.skincareMorningTime);
      weeklyNotification(notifications, `skincare:night:${weekday}`, "StudyFlow · Night routine", "Take a moment for your simple night routine.", "skincare", weekday, preferences.skincareNightTime);
    }
  }

  const session = state.activeStudySession;
  if (preferences.categories.study && session?.deadlineAt) {
    const deadline = new Date(session.deadlineAt);
    if (!Number.isNaN(deadline.getTime()) && deadline > now) {
      const isBreak = session.mode === "break";
      notifications.push(makeNotification(
        FOCUS_NOTIFICATION_KEY,
        isBreak ? "StudyFlow · Break complete" : "StudyFlow · Focus session complete",
        isBreak ? "Your break timer is complete. Return when you are ready." : `Your ${session.subjectName || "study"} focus session is complete. Take a short break.`,
        isBreak ? "focus" : "study",
        { at: deadline }
      ));
    }
  }

  return notifications;
}

function timeToMinutes(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value || "");
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function scheduledIds() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value.filter(Number.isInteger) : [];
  } catch (error) {
    console.error("Could not read the StudyFlow notification schedule index.", error);
    return [];
  }
}

async function cancelScheduledIds(ids) {
  if (!ids.length) return;
  await LocalNotifications.cancel({ notifications: ids.map(id => ({ id })) });
}

export async function getExactAlarmPermissionStatus() {
  if (!isAndroidNative()) return { native: false, available: false, granted: false };
  try {
    const result = await ExactAlarmPlugin.checkExactAlarmPermission();
    return {
      native: true,
      available: Boolean(result?.available ?? result?.supported ?? false),
      granted: Boolean(result?.granted ?? false),
      permission: result?.granted ? "granted" : "denied"
    };
  } catch (error) {
    console.error("StudyFlow exact alarm permission check failed.", error);
    return { native: true, available: false, granted: false, permission: "unavailable" };
  }
}

export async function openExactAlarmSettings() {
  if (!isAndroidNative()) return { native: false, opened: false };
  try {
    const result = await ExactAlarmPlugin.openExactAlarmSettings();
    return { native: true, opened: Boolean(result?.opened), supported: Boolean(result?.supported ?? false), fallback: Boolean(result?.fallback ?? false) };
  } catch (error) {
    console.error("StudyFlow exact alarm settings launch failed.", error);
    return { native: true, opened: false, supported: false };
  }
}

export async function syncNativeNotifications(state, force = false) {
  if (!isAndroidNative()) return { native: false };

  const signature = JSON.stringify({
    enabled: state.settings.notifications,
    preferences: state.notificationPreferences,
    tasks: state.tasks,
    timetable: state.timetable,
    studyTracking: state.studyTracking,
    gymRoutine: state.gymRoutine,
    activeStudySession: state.activeStudySession
  });
  if (!force && signature === lastScheduleSignature) return { native: true, unchanged: true };

  const oldIds = scheduledIds();
  if (!state.settings.notifications) {
    await cancelScheduledIds(oldIds);
    localStorage.setItem(STORAGE_KEY, "[]");
    lastScheduleSignature = signature;
    return { native: true, scheduled: 0 };
  }

  const permission = await LocalNotifications.checkPermissions();
  const exactAlarmPermission = await getExactAlarmPermissionStatus();
  if (permission.display !== "granted") {
    await cancelScheduledIds(oldIds);
    localStorage.setItem(STORAGE_KEY, "[]");
    lastScheduleSignature = signature;
    return { native: true, permission: permission.display, exactAlarmPermission: exactAlarmPermission.permission, scheduled: 0 };
  }
  if (exactAlarmPermission.available && !exactAlarmPermission.granted) {
    await cancelScheduledIds(oldIds);
    localStorage.setItem(STORAGE_KEY, "[]");
    lastScheduleSignature = signature;
    return {
      native: true,
      permission: permission.display,
      exactAlarmPermission: exactAlarmPermission.permission,
      scheduled: 0,
      warning: "Allow Alarms & reminders for StudyFlow in Android settings so exact timed reminders and focus alerts can fire."
    };
  }

  await LocalNotifications.createChannel({
    id: "studyflow-reminders",
    name: "StudyFlow reminders",
    description: "Study, timetable, water and routine reminders",
    importance: 4,
    vibration: true
  });

  const notifications = buildNotificationSchedule(state);
  const nextIds = notifications.map(notification => notification.id);
  const nextSet = new Set(nextIds);
  await cancelScheduledIds(oldIds.filter(id => !nextSet.has(id)));
  const result = notifications.length
    ? await LocalNotifications.schedule({ notifications })
    : { notifications: [] };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextIds));
  lastScheduleSignature = signature;

  return {
    native: true,
    permission: permission.display,
    scheduled: result.notifications.length,
    warning: result.warning?.message || ""
  };
}

export async function requestNativeNotificationPermission() {
  if (!isAndroidNative()) return { native: false, granted: false };
  const current = await LocalNotifications.checkPermissions();
  const result = current.display === "granted" ? current : await LocalNotifications.requestPermissions();
  const exactAlarmPermission = await getExactAlarmPermissionStatus();
  if (exactAlarmPermission.available && !exactAlarmPermission.granted) {
    await openExactAlarmSettings();
    return {
      native: true,
      granted: false,
      permission: result.display,
      exactAlarmPermission: exactAlarmPermission.permission,
      settingsOpened: true
    };
  }
  return {
    native: true,
    granted: result.display === "granted" && (!exactAlarmPermission.available || exactAlarmPermission.granted),
    permission: result.display,
    exactAlarmPermission: exactAlarmPermission.permission
  };
}

export async function initializeNativeNotifications(onOpenPage, onResume) {
  if (!isAndroidNative()) return { native: false };
  await LocalNotifications.createChannel({
    id: "studyflow-reminders",
    name: "StudyFlow reminders",
    description: "Study, timetable, water and routine reminders",
    importance: 4,
    vibration: true
  });
  notificationListener = await LocalNotifications.addListener("localNotificationActionPerformed", event => {
    const page = event.notification.extra?.page;
    if (typeof page === "string") onOpenPage(page);
  });
  appStateListener = await App.addListener("appStateChange", event => {
    if (event.isActive) onResume();
  });
  const notificationPermission = await LocalNotifications.checkPermissions();
  const exactAlarmPermission = await getExactAlarmPermissionStatus();
  return {
    native: true,
    permission: notificationPermission.display,
    exactAlarmPermission: exactAlarmPermission.granted ? "granted" : exactAlarmPermission.available ? "denied" : "unavailable"
  };
}

export async function exportNativeBackup(filename, contents) {
  const result = await Filesystem.writeFile({
    path: filename,
    data: contents,
    directory: Directory.Cache,
    encoding: Encoding.UTF8
  });
  await Share.share({
    title: "StudyFlow backup",
    text: "StudyFlow planner backup",
    url: result.uri,
    dialogTitle: "Save or share your StudyFlow backup"
  });
}
