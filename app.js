import {
  exportNativeBackup,
  getExactAlarmPermissionStatus,
  initializeNativeNotifications,
  isAndroidNative,
  openExactAlarmSettings,
  requestNativeNotificationPermission,
  syncNativeNotifications
} from "./native-notifications.js";
import {
  addUpdateProgressListener,
  checkForStudyFlowUpdate,
  downloadAndInstallApk,
  getInstalledAppInfo,
  getPackageInstallPermission,
  isAndroidApp,
  requestPackageInstallPermission
} from "./app-updates.js";

"use strict";

const DB_NAME = "studyflow-personal-planner";
const DB_VERSION = 1;
const NAV_ITEMS = [
  ["dashboard", "Home", "◈"], ["study", "Study", "✳"], ["tasks", "Tasks", "☷"],
  ["habits", "Habits", "↻"], ["focus", "Focus", "◷"], ["wellness", "Wellness", "⌁"],
  ["progress", "Analytics", "↗"], ["settings", "Settings", "⚙"]
];
const DEFAULT_NAV_ORDER = NAV_ITEMS.map(([id]) => id);
function defaultNavigationConfig() {
  const visible = Object.fromEntries(NAV_ITEMS.map(([id]) => [id, true]));
  visible.dashboard = true;
  visible.settings = true;
  return { order: [...DEFAULT_NAV_ORDER], visible };
}
function normalizeNavigationConfig(config = {}) {
  const defaults = defaultNavigationConfig();
  const order = Array.isArray(config.order) ? config.order.filter(id => DEFAULT_NAV_ORDER.includes(id)) : [...defaults.order];
  const visible = { ...defaults.visible, ...(config.visible || {}) };
  for (const id of DEFAULT_NAV_ORDER) {
    if (id === "dashboard" || id === "settings") visible[id] = true;
    else if (typeof visible[id] !== "boolean") visible[id] = true;
  }
  return {
    order: [...new Set([...order, ...defaults.order])].filter(id => DEFAULT_NAV_ORDER.includes(id)),
    visible
  };
}
function getNavigationConfig() {
  return normalizeNavigationConfig(state?.navigation || {});
}
function getVisibleNavigationItems() {
  const { order, visible } = getNavigationConfig();
  return NAV_ITEMS.filter(([id]) => visible[id] !== false).sort((a, b) => {
    const aIndex = order.indexOf(a[0]);
    const bIndex = order.indexOf(b[0]);
    return aIndex - bIndex;
  });
}
function getFirstVisiblePage() {
  return getVisibleNavigationItems()[0]?.[0] || "dashboard";
}
const PAGE_GROUPS = {
  dashboard: "dashboard",
  study: "study",
  timetable: "study",
  tasks: "tasks",
  habits: "habits",
  focus: "focus",
  wellness: "wellness",
  water: "wellness",
  gym: "wellness",
  skincare: "wellness",
  progress: "progress",
  settings: "settings"
};
const VALID_PAGES = new Set(Object.keys(PAGE_GROUPS));
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT_DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const DEFAULT_SUBJECTS = [
  { id: "bk", name: "Book-Keeping and Accountancy", chapters: ["Introduction to Partnership", "Admission of a Partner", "Retirement of a Partner", "Death of a Partner", "Dissolution of Partnership Firm", "Accounts of Not-for-Profit Concerns", "Single Entry System", "Company Accounts", "Issue of Shares", "Analysis of Financial Statements", "Cash Flow Statement"] },
  { id: "ocm", name: "OCM", chapters: ["Principles of Management", "Functions of Management", "Entrepreneurship Development", "Business Services", "Emerging Modes of Business", "Social Responsibilities of Business", "Consumer Protection", "Marketing"] },
  { id: "sp", name: "Secretarial Practice", chapters: ["Introduction to Corporate Finance", "Sources of Corporate Finance", "Issue of Shares", "Issue of Debentures", "Deposits", "Correspondence with Members", "Correspondence with Debenture Holders", "Depositories"] },
  { id: "english", name: "English", chapters: ["Prose", "Poetry", "Writing Skills", "Literary Genre", "Novel"] },
  { id: "hindi", name: "Hindi", chapters: ["गद्य", "पद्य", "व्याकरण", "लेखन कौशल"] },
  { id: "granthalaya", name: "Granthalaya ani Mahitishastra", chapters: ["ग्रंथालयाची ओळख", "ग्रंथालय व्यवस्थापन", "माहिती स्रोत", "माहिती तंत्रज्ञान"] }
];
const DEFAULT_TIMETABLE = [
  ["08:00", "08:15", "Wake up"], ["08:15", "08:45", "Breakfast"], ["08:45", "10:45", "Study Session 1"],
  ["10:45", "11:00", "Break"], ["11:00", "12:30", "Study Session 2"], ["12:30", "13:00", "Lunch"],
  ["13:00", "15:00", "Tuition"], ["15:00", "16:30", "Personal Work"], ["16:30", "17:00", "Evening Snack"],
  ["17:00", "18:00", "Gym"], ["18:00", "19:00", "Freshen Up + Dinner"], ["19:00", "20:30", "Study Session 3"],
  ["20:30", "21:00", "Break"], ["21:00", "22:30", "Study Session 4"], ["22:30", "22:45", "Break"],
  ["22:45", "23:45", "Study Session 5"], ["23:45", "24:00", "Night Routine"], ["00:00", "08:00", "Sleep"]
];
const DEFAULT_ROUTINE = {
  Sunday: "Rest",
  Monday: "Chest + Triceps",
  Tuesday: "Back + Biceps",
  Wednesday: "Legs + Shoulders",
  Thursday: "Chest + Triceps",
  Friday: "Back + Biceps",
  Saturday: "Legs + Shoulders"
};
const DEFAULT_SKINCARE = {
  morning: ["Gentle face wash", "Use existing sunscreen if available"],
  night: ["Gentle face wash", "Avoid squeezing pimples", "Keep pillowcase and towel clean"]
};
const EXERCISES = {
  "Chest + Triceps": ["Bench press", "Incline press", "Chest fly", "Triceps pushdown", "Overhead triceps extension"],
  "Back + Biceps": ["Lat pulldown", "Seated row", "Back extension", "Bicep curl", "Hammer curl"],
  "Legs + Shoulders": ["Squats", "Leg press", "Hamstring curl", "Shoulder press", "Lateral raise"]
};
const QUOTES = [
  ["Small steps every day add up to remarkable progress.", "YOUR DAILY REMINDER"],
  ["The secret of getting ahead is getting started.", "MARK TWAIN"],
  ["Success is the sum of small efforts, repeated day in and day out.", "ROBERT COLLIER"],
  ["Focus on progress, not perfection.", "YOUR DAILY REMINDER"],
  ["You do not have to be extreme, just consistent.", "YOUR DAILY REMINDER"],
  ["Great things are done by a series of small things brought together.", "VINCENT VAN GOGH"],
  ["Discipline is choosing what you want most over what you want now.", "YOUR DAILY REMINDER"]
];
const DEFAULT_NOTIFICATION_PREFERENCES = {
  categories: { tasks: true, timetable: true, study: true, water: false, gym: false, skincare: false },
  waterIntervalMinutes: 120,
  waterStart: "08:00",
  waterEnd: "22:00",
  skincareMorningTime: "08:00",
  skincareNightTime: "22:00",
  gymTime: "17:00"
};
const TASK_PRIORITY_ORDER = { High: 0, Medium: 1, Low: 2 };
const DEFAULT_TASK_LIST_ID = "task-list-default";
const DEFAULT_HABITS = [
  ["Wake up early", "daily", 1, "daily"],
  ["Eat healthy food", "daily", 1, "daily"],
  ["Study for 6 hours", "daily", 1, "daily"],
  ["Exercise or walk", "daily", 1, "daily"],
  ["Read something useful", "daily", 1, "daily"],
  ["Control unnecessary phone usage", "focus", 1, "weekly"],
  ["Control unnecessary social media scrolling", "focus", 1, "weekly"],
  ["Reduce unnecessary screen time", "focus", 1, "weekly"],
  ["Avoid distracting notifications", "focus", 1, "weekly"],
  ["Avoid instant-gratification distractions", "focus", 1, "weekly"],
  ["Stay focused during study sessions", "focus", 1, "weekly"]
];
const CLOCK_FORMATTER = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: true });
const STUDY_TYPES = ["Study", "Revision", "Practice", "Class", "Other"];
const AUTOMATIC_TRACK_INTERVAL_MS = 15000;
const MAX_AUTOMATIC_TICK_SECONDS = 30;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
let db;
let state;
let activePage = "dashboard";
let selectedScheduleDay = new Date().getDay();
let progressPeriod = "week";
let timer = {
  running: false,
  mode: "focus",
  remaining: 25 * 60,
  duration: 25 * 60,
  sessionDuration: 0,
  sessionElapsed: 0,
  sessionStartedAt: null,
  sessionDate: "",
  deadlineAt: "",
  subjectId: "",
  studyType: "Study",
  accumulatedSeconds: 0,
  legacyCreditedSeconds: 0,
  sessionCompleted: false,
  interval: null
};
let automaticTrackerInterval;
let automaticTracker = { lastActivityAt: 0, lastTickAt: 0, sessionId: "", activityId: "" };
let editingStudyEntryId = "";
let manualStudyFormOpen = false;
let quickStudySubjectId = "";
let quickStudyType = "Study";
let modalSubmit = null;
let toastTimeout;
let nativeSyncTimeout;
let nativeNotificationStatus = { native: false };
let updateState = {
  appInfo: null,
  checking: false,
  result: null,
  error: "",
  downloading: false,
  progress: { percent: 0, downloadedBytes: 0, totalBytes: 0 },
  dismissed: false
};
let updateProgressListener;
let pageTransitionTimeout = null;
let pageExitHandler = null;
let pageTransitioning = false;
const pageScrollPositions = Object.create(null);

function uid(prefix = "id") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
function localDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function todayName() { return DAYS[new Date().getDay()]; }
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}
function clamp(number, min, max) { return Math.min(max, Math.max(min, number)); }
function isRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function defaultSchedule() {
  const activities = DEFAULT_TIMETABLE.map(([start, end, name]) => ({
    id: uid("activity"),
    start,
    end,
    name,
    reminder: false,
    studyTracking: /study|revision/i.test(name)
  }));
  return Object.fromEntries(DAYS.map(day => [day, activities.map(item => ({ ...item, id: uid("activity") }))]));
}
function normalizeTimetable(timetable) {
  let defaults;
  return Object.fromEntries(DAYS.map(day => {
    if (Array.isArray(timetable?.[day])) return [day, timetable[day]];
    defaults ||= defaultSchedule();
    return [day, defaults[day]];
  }));
}
function freshState() {
  return {
    schemaVersion: 1,
    settings: { theme: "dark", studyTargetHours: 6, waterTargetMl: 2250, focusTargetMinutes: 120, focusDurationMinutes: 25, breakDurationMinutes: 5, pomodoroEnabled: false, examDate: "", notifications: false },
    notificationPreferences: JSON.parse(JSON.stringify(DEFAULT_NOTIFICATION_PREFERENCES)),
    navigation: defaultNavigationConfig(),
    ui: { expandedTaskIds: [], selectedHabitDate: "" },
    activeStudySession: null,
    pausedFocusTimer: null,
    studyTracking: { automaticEnabled: false, idleTimeoutMinutes: 5 },
    activeAutomaticStudySession: null,
    subjects: DEFAULT_SUBJECTS.map(s => ({ ...s, id: uid(s.id), chapters: s.chapters.map((name, i) => ({ id: uid(`chapter${i}`), name, status: "Not Started", revisionDate: "" })) })),
    timetable: defaultSchedule(),
    gymRoutine: { ...DEFAULT_ROUTINE },
    skincare: JSON.parse(JSON.stringify(DEFAULT_SKINCARE)),
    taskLists: [{ id: DEFAULT_TASK_LIST_ID, name: "My Tasks", createdAt: new Date().toISOString() }],
    activeTaskListId: DEFAULT_TASK_LIST_ID,
    tasks: [],
    habits: DEFAULT_HABITS.map(([name, category, target, frequency]) => ({
      id: uid("habit"),
      name,
      category,
      frequency,
      weeklyTarget: target,
      createdAt: new Date().toISOString()
    })),
    habitRecords: {},
    logs: {},
    notes: "",
    pyq: {},
    mockTests: [],
    createdAt: new Date().toISOString()
  };
}
function normalizeTaskListsAndHabits() {
  const taskLists = Array.isArray(state.taskLists) ? state.taskLists.filter(isRecord) : [];
  if (!taskLists.some(list => list.id === DEFAULT_TASK_LIST_ID)) {
    taskLists.unshift({ id: DEFAULT_TASK_LIST_ID, name: "My Tasks", createdAt: state.createdAt || new Date().toISOString() });
  }
  state.taskLists = taskLists.map(list => ({
    id: String(list.id || uid("task-list")),
    name: String(list.name || "Untitled list").trim().slice(0, 60) || "Untitled list",
    createdAt: list.createdAt || new Date().toISOString()
  }));
  state.tasks = Array.isArray(state.tasks) ? state.tasks.filter(isRecord) : [];
  const validListIds = new Set(state.taskLists.map(list => list.id));
  state.tasks.forEach(task => {
    if (!validListIds.has(task.listId)) task.listId = DEFAULT_TASK_LIST_ID;
    task.priority = task.priority === "High" ? "High" : "Low";
  });
  state.activeTaskListId = validListIds.has(state.activeTaskListId) ? state.activeTaskListId : DEFAULT_TASK_LIST_ID;

  const habits = Array.isArray(state.habits) ? state.habits.filter(isRecord) : DEFAULT_HABITS.map(([name, category, target, frequency]) => ({
    id: uid("habit"), name, category, frequency, weeklyTarget: target, createdAt: new Date().toISOString()
  }));
  state.habits = habits.map(habit => ({
    id: String(habit.id || uid("habit")),
    name: String(habit.name || "Untitled habit").trim().slice(0, 100) || "Untitled habit",
    category: habit.category === "focus" ? "focus" : "daily",
    frequency: habit.frequency === "weekly" ? "weekly" : "daily",
    weeklyTarget: clamp(Math.round(Number(habit.weeklyTarget) || 1), 1, 7),
    createdAt: habit.createdAt || new Date().toISOString()
  }));
  state.habitRecords = isRecord(state.habitRecords) ? state.habitRecords : {};
  for (const [date, records] of Object.entries(state.habitRecords)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isRecord(records)) {
      delete state.habitRecords[date];
      continue;
    }
    for (const [habitId, record] of Object.entries(records)) {
      if (!isRecord(record) || !["completed", "missed"].includes(record.status)) delete records[habitId];
    }
  }
}
function dayLog(date = localDate()) {
  if (!state.logs[date]) {
    state.logs[date] = { studySeconds: 0, waterMl: 0, waterEntries: [], skincareDone: { morning: [], night: [] }, activitiesDone: [], gym: null, studySessions: [] };
  }
  const log = state.logs[date];
  if (!Array.isArray(log.waterEntries)) log.waterEntries = [];
  if (!Array.isArray(log.activitiesDone)) log.activitiesDone = [];
  if (!Array.isArray(log.studySessions)) log.studySessions = [];
  if (!log.skincareDone) log.skincareDone = { morning: [], night: [] };
  return log;
}
function parseLocalDateTime(dateValue, timeValue) {
  const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue || "");
  const timeParts = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(timeValue || "");
  if (!dateParts || !timeParts) return null;
  const [, year, month, day] = dateParts.map(Number);
  const [, hour, minute] = timeParts.map(Number);
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day
    || date.getHours() !== hour || date.getMinutes() !== minute) return null;
  return date.getTime();
}
function localTime(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
function studyEntryRange(date, startTime, endTime) {
  const start = parseLocalDateTime(date, startTime);
  if (start === null) return null;
  let end = parseLocalDateTime(date, endTime);
  if (end === null) return null;
  if (end <= start) {
    const endDate = new Date(start);
    endDate.setDate(endDate.getDate() + 1);
    const nextDate = localDate(endDate);
    end = parseLocalDateTime(nextDate, endTime);
  }
  if (end === null || end <= start || end - start > 24 * 60 * 60 * 1000) return null;
  return { start, end, seconds: Math.round((end - start) / 1000) };
}
function creditStudyRange(start, end, direction = 1) {
  let cursor = start;
  while (cursor < end) {
    const date = new Date(cursor);
    const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
    const boundary = Math.min(end, midnight);
    const seconds = Math.round((boundary - cursor) / 1000) * direction;
    const log = dayLog(localDate(date));
    log.studySeconds = Math.max(0, (Number(log.studySeconds) || 0) + seconds);
    cursor = boundary;
  }
}
function studyEntryOverlaps(start, end, excludeId = "") {
  for (const log of Object.values(state.logs)) {
    for (const entry of log.studySessions || []) {
      if (entry.id === excludeId || entry.legacy || !entry.startedAt || !entry.endedAt) continue;
      const entryStart = new Date(entry.startedAt).getTime();
      const entryEnd = new Date(entry.endedAt).getTime();
      if (Number.isFinite(entryStart) && Number.isFinite(entryEnd) && start < entryEnd && end > entryStart) return true;
    }
  }
  const active = state.activeStudySession;
  if (active && active.mode !== "break" && active.startedAt) {
    const activeStart = new Date(active.startedAt).getTime();
    const activeEnd = active.deadlineAt ? new Date(active.deadlineAt).getTime() : Date.now();
    if (Number.isFinite(activeStart) && Number.isFinite(activeEnd) && start < activeEnd && end > activeStart) return true;
  }
  return false;
}
function normalizeStudyTracking() {
  const tracking = state.studyTracking || {};
  state.studyTracking = {
    automaticEnabled: tracking.automaticEnabled === true,
    idleTimeoutMinutes: [3, 5, 10].includes(Number(tracking.idleTimeoutMinutes))
      ? Number(tracking.idleTimeoutMinutes)
      : 5
  };
}
function normalizeStudyRecords() {
  const entries = [];
  for (const [date, log] of Object.entries(state.logs)) {
    if (!isRecord(log)) continue;
    if (!Array.isArray(log.studySessions)) log.studySessions = [];
    else log.studySessions = log.studySessions.filter(isRecord);
    for (const entry of log.studySessions) {
      if (!entry.id) entry.id = uid("study");
      entry.date ||= date;
      const recordedDuration = Number(entry.seconds);
      entry.seconds = Number.isFinite(recordedDuration) ? Math.max(0, Math.round(recordedDuration)) : 0;
      entry.trackingMethod = ["automatic", "timer", "manual"].includes(entry.trackingMethod) ? entry.trackingMethod : "timer";
      entry.studyType = STUDY_TYPES.includes(entry.studyType) ? entry.studyType : "Study";
      entry.subjectName ||= getSubject(entry.subjectId)?.name || "Independent study";
      if (!entry.legacy && entry.startedAt && !entry.endedAt && entry.seconds) {
        const start = new Date(entry.startedAt).getTime();
        if (Number.isFinite(start)) {
          entry.aggregateOnStartDate = true;
          entry.endedAt = new Date(start + entry.seconds * 1000).toISOString();
        }
      }
      entries.push(entry);
    }
  }
  for (const [date, log] of Object.entries(state.logs)) {
    if (!isRecord(log)) continue;
    const dayStart = parseLocalDateTime(date, "00:00");
    const nextDay = dayStart === null ? null : new Date(dayStart);
    if (nextDay) nextDay.setDate(nextDay.getDate() + 1);
    const dayEnd = nextDay ? parseLocalDateTime(localDate(nextDay), "00:00") : null;
    const recordedSeconds = entries.reduce((sum, entry) => {
      if (entry.legacy || entry.aggregateOnStartDate) return sum + (entry.date === date ? entry.seconds : 0);
      const start = new Date(entry.startedAt || "").getTime();
      const end = new Date(entry.endedAt || "").getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end) || dayStart === null || dayEnd === null) {
        return sum + (entry.date === date ? entry.seconds : 0);
      }
      const overlap = Math.max(0, Math.min(end, dayEnd) - Math.max(start, dayStart));
      return sum + Math.round(overlap / 1000);
    }, 0);
    let activeSeconds = 0;
    const activeSession = state.activeStudySession;
    if (activeSession?.mode !== "break" && activeSession?.startedAt) {
      const activeStart = new Date(activeSession.startedAt).getTime();
      const creditedSeconds = Math.max(0, Number(activeSession.creditedSeconds) || 0);
      if (Number.isFinite(activeStart) && dayStart !== null && dayEnd !== null) {
        if (activeSession.ledgerVersion !== 2) {
          activeSeconds = activeSession.sessionDate === date ? creditedSeconds : 0;
        } else {
          const legacySeconds = Math.min(creditedSeconds, Math.max(0, Number(activeSession.legacyCreditedSeconds) || 0));
          const trackedStart = activeStart + legacySeconds * 1000;
          const trackedEnd = activeStart + creditedSeconds * 1000;
          activeSeconds = (activeSession.sessionDate === date ? legacySeconds : 0)
            + Math.max(0, Math.round((Math.min(trackedEnd, dayEnd) - Math.max(trackedStart, dayStart)) / 1000));
        }
      }
    }
    const storedSeconds = Number(log.studySeconds);
    const totalSeconds = Number.isFinite(storedSeconds) ? Math.max(0, Math.round(storedSeconds)) : 0;
    log.studySeconds = totalSeconds;
    const legacySeconds = Math.max(0, totalSeconds - recordedSeconds - activeSeconds);
    if (legacySeconds) {
      log.studySessions.push({
        id: uid("study-legacy"),
        date,
        subjectId: "",
        subjectName: "Earlier recorded time",
        studyType: "Study",
        trackingMethod: "timer",
        seconds: legacySeconds,
        startedAt: "",
        endedAt: "",
        legacy: true
      });
    }
  }
}
function normalizeNotificationPreferences(preferences = {}) {
  const defaults = JSON.parse(JSON.stringify(DEFAULT_NOTIFICATION_PREFERENCES));
  return {
    ...defaults,
    ...preferences,
    categories: { ...defaults.categories, ...(preferences.categories || {}) }
  };
}
function resolveNavigationPage(page) {
  if (!page || !VALID_PAGES.has(page)) return getFirstVisiblePage();
  const visiblePages = new Set(getVisibleNavigationItems().map(([id]) => id));
  const mappedPage = PAGE_GROUPS[page] || page;
  if (visiblePages.has(page)) return page;
  if (visiblePages.has(mappedPage)) return mappedPage;
  return getFirstVisiblePage();
}
function ensureVisibleActivePage() {
  const visiblePages = new Set(getVisibleNavigationItems().map(([id]) => id));
  const activeGroup = PAGE_GROUPS[activePage] || activePage;
  if (!visiblePages.has(activeGroup)) {
    activePage = getFirstVisiblePage();
  }
}
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("planner")) database.createObjectStore("planner", { keyPath: "id" });
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error || new Error("Could not open the local StudyFlow database."));
  });
}
function loadState() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("planner", "readonly");
    const request = tx.objectStore("planner").get("main");
    request.onsuccess = () => resolve(request.result?.data || null);
    request.onerror = () => reject(request.error || new Error("Could not read your saved StudyFlow data."));
  });
}
let saveQueue = Promise.resolve();
function saveState() {
  state.updatedAt = new Date().toISOString();
  const snapshot = JSON.parse(JSON.stringify(state));
  const write = saveQueue.catch(() => {}).then(() => new Promise((resolve, reject) => {
    const tx = db.transaction("planner", "readwrite");
    tx.objectStore("planner").put({ id: "main", data: snapshot });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error("Could not save your StudyFlow data."));
    tx.onabort = () => reject(tx.error || new Error("Saving your StudyFlow data was interrupted."));
  }));
  saveQueue = write;
  write.then(
    () => queueNativeNotificationSync(),
    error => {
      console.error(error);
      showToast("Your changes could not be saved. Check browser storage permissions.");
    }
  );
  return write;
}
function queueNativeNotificationSync(force = false) {
  if (!isAndroidNative()) return;
  clearTimeout(nativeSyncTimeout);
  nativeSyncTimeout = setTimeout(() => {
    syncNativeNotifications(state, force).then(result => {
      if (result.native) {
        nativeNotificationStatus = {
          ...nativeNotificationStatus,
          permission: result.permission || nativeNotificationStatus.permission,
          exactAlarmPermission: result.exactAlarmPermission || nativeNotificationStatus.exactAlarmPermission,
          scheduled: result.scheduled ?? nativeNotificationStatus.scheduled,
          warning: result.warning || ""
        };
        if (activePage === "settings" && !result.unchanged) renderPage();
      }
      if (result.warning) {
        nativeNotificationStatus = { ...nativeNotificationStatus, warning: result.warning };
      }
    }).catch(error => {
      console.error("Could not update StudyFlow Android reminders.", error);
      showToast("Android reminders could not be updated. Check notification settings.");
    });
  }, 450);
}
function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("show"), 2600);
}
function updateStatusMessage() {
  if (updateState.checking) return "Checking the latest StudyFlow release…";
  if (updateState.downloading) {
    const percent = updateState.progress.percent;
    return percent >= 0 ? `Downloading update · ${percent}%` : "Downloading update…";
  }
  if (updateState.error) return updateState.error;
  if (updateState.result?.message) return updateState.result.message;
  if (updateState.result?.available) return `Version ${updateState.result.version} is available.`;
  if (updateState.appInfo) return `Installed version ${updateState.appInfo.versionName}.`;
  return "Check GitHub for the latest signed StudyFlow release.";
}
function updateProgressLabel(progress = updateState.progress) {
  const downloaded = Number(progress.downloadedBytes) || 0;
  const total = Number(progress.totalBytes) || 0;
  const formatBytes = bytes => bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (total) return `${formatBytes(downloaded)} of ${formatBytes(total)}`;
  return downloaded ? `${formatBytes(downloaded)} downloaded` : "Preparing download…";
}
function renderUpdateBanner() {
  const container = $("#app-update-banner");
  if (!container) return;
  const release = updateState.result;
  if (!release?.available || updateState.dismissed) {
    container.replaceChildren();
    container.hidden = true;
    return;
  }
  container.hidden = false;
  const updateAction = isAndroidApp()
    ? `<button class="button update-now-button" type="button" data-action="download-app-update" ${updateState.downloading ? "disabled" : ""}>${updateState.downloading ? "Preparing…" : "Update now"}</button>`
    : `<a class="button update-now-button" href="${escapeHTML(release.pageUrl)}" target="_blank" rel="noopener noreferrer">View release</a>`;
  container.innerHTML = `<section class="app-update-banner card" aria-label="StudyFlow update available">
    <div class="app-update-banner-copy"><span class="update-kicker">STUDYFLOW UPDATE</span><strong>${escapeHTML(release.name)} <span>v${escapeHTML(release.version)}</span></strong><p class="update-notes">${escapeHTML(release.notes)}</p></div>
    <div class="app-update-banner-actions">${updateAction}<button class="button-quiet" type="button" data-action="dismiss-app-update" aria-label="Dismiss update notice">×</button></div>
    <div class="update-progress ${updateState.downloading ? "visible" : ""}"><div class="update-progress-track"><span id="app-update-progress-fill"></span></div><small id="app-update-progress-label"></small></div>
  </section>`;
  refreshUpdateSurfaces();
}
function refreshUpdateSurfaces() {
  const status = updateStatusMessage();
  const statusElement = $("#update-status");
  if (statusElement) statusElement.textContent = status;
  const button = $("#check-app-update");
  if (button) {
    button.disabled = updateState.checking || updateState.downloading;
    button.textContent = updateState.checking ? "Checking…" : "Check for updates";
  }
  const progressLabel = updateProgressLabel();
  const percent = updateState.progress.percent;
  for (const [fillSelector, labelSelector] of [
    ["#update-progress-fill", "#update-progress-label"],
    ["#app-update-progress-fill", "#app-update-progress-label"]
  ]) {
    const fill = $(fillSelector);
    if (fill) fill.style.width = `${percent >= 0 ? percent : 25}%`;
    const label = $(labelSelector);
    if (label) label.textContent = progressLabel;
  }
  const settingsProgress = $("#update-progress");
  if (settingsProgress) settingsProgress.hidden = !updateState.downloading;
  const bannerProgress = $("#app-update-banner .update-progress");
  if (bannerProgress) bannerProgress.classList.toggle("visible", updateState.downloading);
}
async function checkForUpdates(manual = false) {
  if (updateState.checking) return;
  updateState.checking = true;
  updateState.error = "";
  refreshUpdateSurfaces();
  if (activePage === "settings") renderPage();
  try {
    updateState.appInfo = await getInstalledAppInfo();
    updateState.result = await checkForStudyFlowUpdate(updateState.appInfo);
    updateState.dismissed = false;
    if (updateState.result.available && !manual) {
      showToast(`StudyFlow ${updateState.result.version} is ready to update.`);
    }
  } catch (error) {
    console.error("Could not check for StudyFlow updates.", error);
    updateState.error = error.message || "Could not check for updates. Check your internet connection and try again.";
    updateState.result = null;
  } finally {
    updateState.checking = false;
    renderUpdateBanner();
    refreshUpdateSurfaces();
    if (activePage === "settings") renderPage();
    if (manual && updateState.result?.message === "You're using the latest version.") {
      showToast("You're using the latest version.");
    } else if (manual && updateState.error) {
      showToast(updateState.error);
    } else if (manual && updateState.result?.available) {
      showToast(`StudyFlow ${updateState.result.version} is available.`);
    }
  }
}
async function startAppUpdate() {
  const release = updateState.result;
  if (!release?.available) {
    showToast("Check for updates before starting an installation.");
    return;
  }
  if (!isAndroidApp()) {
    window.open(release.pageUrl, "_blank", "noopener,noreferrer");
    return;
  }
  try {
    const permission = await getPackageInstallPermission();
    if (!permission.allowed) {
      const request = await requestPackageInstallPermission();
      if (request.opened) {
        showToast("Allow installs from StudyFlow in Android settings, then tap Update now again.");
      } else {
        showToast("Allow StudyFlow to install apps in Android settings before updating.");
      }
      return;
    }
    updateState.downloading = true;
    updateState.error = "";
    updateState.progress = { percent: 0, downloadedBytes: 0, totalBytes: 0 };
    renderUpdateBanner();
    refreshUpdateSurfaces();
    await downloadAndInstallApk(release.url, release.version);
    showToast("Opening Android installer. Confirm the update to keep your data.");
  } catch (error) {
    console.error("Could not install the StudyFlow update.", error);
    updateState.error = error.message || "The update could not be downloaded. Check your connection and try again.";
    showToast(updateState.error);
  } finally {
    updateState.downloading = false;
    renderUpdateBanner();
    refreshUpdateSurfaces();
    if (activePage === "settings") renderPage();
  }
}
async function initializeAppUpdates() {
  if (!isAndroidApp()) return;
  try {
    updateProgressListener = await addUpdateProgressListener(progress => {
      updateState.progress = {
        percent: Number.isFinite(Number(progress.percent)) ? Number(progress.percent) : -1,
        downloadedBytes: Number(progress.downloadedBytes) || 0,
        totalBytes: Number(progress.totalBytes) || 0
      };
      refreshUpdateSurfaces();
    });
    updateState.appInfo = await getInstalledAppInfo();
    refreshUpdateSurfaces();
    if (activePage === "settings") renderPage();
    setTimeout(() => checkForUpdates(false), 900);
  } catch (error) {
    console.error("Could not initialize StudyFlow update support.", error);
    updateState.error = error.message || "StudyFlow update support is unavailable on this device.";
    refreshUpdateSurfaces();
  }
}
function formatClock(date = new Date()) {
  return CLOCK_FORMATTER.format(date);
}
function formatDate(date = new Date(), options = { weekday: "long", month: "long", day: "numeric" }) {
  return new Intl.DateTimeFormat(undefined, options).format(date);
}
function formatTime24(value) {
  const [hoursRaw, minutesRaw] = String(value).split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return value;
  const suffix = hours >= 12 && hours < 24 ? "PM" : "AM";
  const shown = hours % 12 || 12;
  return `${shown}:${String(minutes).padStart(2, "0")} ${suffix}`;
}
function timeMinutes(value) {
  if (!value) return 0;
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}
function durationLabel(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}
function studyDurationLabel(seconds) {
  const safe = Math.max(0, Math.round(Number(seconds) || 0));
  return safe < 60 ? `${safe}s` : durationLabel(safe);
}
function statusClass(status) {
  if (status === "Completed" || status === "Done") return "good";
  if (status === "In Progress") return "cyan";
  return "";
}
function normalizeTaskSubtasks(task = {}) {
  const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
  task.subtasks = subtasks.map(item => ({
    id: item.id || uid("subtask"),
    title: String(item.title || "").trim(),
    completed: Boolean(item.completed)
  })).filter(item => item.title);
  return task.subtasks;
}
function getTaskProgress(task) {
  const subtasks = normalizeTaskSubtasks(task);
  if (!subtasks.length) {
    return { total: 0, completed: 0, percent: task.completed ? 100 : 0 };
  }
  const completed = subtasks.filter(item => item.completed).length;
  return { total: subtasks.length, completed, percent: Math.round((completed / subtasks.length) * 100) };
}
function studyStats() {
  const { total, completed } = state.subjects.reduce((stats, subject) => {
    stats.total += subject.chapters.length;
    for (const chapter of subject.chapters) {
      if (chapter.status === "Completed") stats.completed += 1;
    }
    return stats;
  }, { total: 0, completed: 0 });
  return { total, completed, percent: total ? Math.round((completed / total) * 100) : 0 };
}
function weekDates(endDate = new Date()) {
  const day = endDate.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(endDate);
    date.setDate(date.getDate() + mondayOffset + i);
    return date;
  });
}
function logFor(date) { return state.logs[typeof date === "string" ? date : localDate(date)] || {}; }
function todayTasks() {
  const today = localDate();
  return state.tasks.filter(task => !task.dueDate || task.dueDate <= today);
}
function getSubject(id) { return state.subjects.find(subject => subject.id === id); }
function renderNavigation() {
  ensureVisibleActivePage();
  const activeNavigationPage = resolveNavigationPage(activePage);
  for (const nav of [$("#side-nav"), $("#mobile-nav")]) {
    const items = getVisibleNavigationItems();
    nav.innerHTML = items.map(([id, label, icon]) => `<button type="button" class="nav-item" data-page="${id}" aria-label="${label}" title="${label}" aria-current="false"><span class="nav-icon" aria-hidden="true">${icon}</span><span>${label}</span></button>`).join("");
    const indicator = document.createElement("span");
    indicator.className = "nav-indicator";
    indicator.setAttribute("aria-hidden", "true");
    nav.prepend(indicator);
    for (const button of nav.querySelectorAll(".nav-item")) {
      const selected = button.dataset.page === PAGE_GROUPS[activeNavigationPage];
      button.classList.toggle("active", selected);
      button.setAttribute("aria-current", selected ? "page" : "false");
    }
    const activeButton = nav.querySelector(`.nav-item[data-page="${PAGE_GROUPS[activeNavigationPage]}"]`);
    if (activeButton) {
      const navBounds = nav.getBoundingClientRect();
      const buttonBounds = activeButton.getBoundingClientRect();
      const left = buttonBounds.left - navBounds.left - nav.clientLeft + nav.scrollLeft;
      const top = buttonBounds.top - navBounds.top - nav.clientTop + nav.scrollTop;
      indicator.style.width = `${activeButton.offsetWidth}px`;
      indicator.style.height = `${activeButton.offsetHeight}px`;
      indicator.style.transform = `translate3d(${left}px, ${top}px, 0)`;
      nav.classList.add("nav-enhanced");
    }
  }
  $("#page-crumb").textContent = NAV_ITEMS.find(item => item[0] === PAGE_GROUPS[activeNavigationPage])?.[1].toUpperCase() || "HOME";
  $("#top-date").textContent = formatDate(new Date(), { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
}
function clearPageTransition() {
  if (pageTransitionTimeout !== null) {
    clearTimeout(pageTransitionTimeout);
    pageTransitionTimeout = null;
  }
  const page = $("#page");
  if (pageExitHandler) {
    page.removeEventListener("animationend", pageExitHandler);
    pageExitHandler = null;
  }
  pageTransitioning = false;
  page.classList.remove("page-exit");
}
function pageHeader(title, description, right = "") {
  const group = PAGE_GROUPS[activePage];
  const tabs = group === "study"
    ? [["study", "Study plan"], ["timetable", "Timetable"]]
    : group === "wellness"
      ? [["wellness", "Overview"], ["water", "Water"], ["gym", "Gym"], ["skincare", "Skincare"]]
      : [];
  return `<div class="page-heading"><div><div class="eyebrow">${escapeHTML(NAV_ITEMS.find(i => i[0] === group)?.[1].toUpperCase() || "STUDYFLOW")}</div><h1>${title}</h1><p>${description}</p></div>${right}</div>${tabs.length ? `<div class="section-tabs" aria-label="${group === "study" ? "Study sections" : "Wellness sections"}">${tabs.map(([page, label]) => `<button type="button" class="tab-button ${activePage === page || (page === "wellness" && activePage === "wellness") ? "active" : ""}" data-page="${page}" aria-current="${activePage === page ? "page" : "false"}">${label}</button>`).join("")}</div>` : ""}`;
}
function cardTitle(title, meta = "", right = "") {
  return `<div class="card-title"><div><h2>${title}</h2>${meta ? `<small>${meta}</small>` : ""}</div>${right}</div>`;
}
function progressRing(percent, label = "OF DAILY GOAL", sizeClass = "") {
  const radius = 47;
  const circumference = Math.PI * 2 * radius;
  const offset = circumference - clamp(percent, 0, 100) / 100 * circumference;
  return `<div class="progress-ring ${sizeClass}" style="--ring-circumference:${circumference};--ring-offset:${offset}"><svg viewBox="0 0 110 110" aria-hidden="true"><circle class="ring-track" cx="55" cy="55" r="${radius}"></circle><circle class="ring-value" cx="55" cy="55" r="${radius}" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"></circle></svg><div class="ring-copy"><strong>${Math.round(percent)}%</strong><small>${label}</small></div></div>`;
}
function weeklyStudyChart() {
  const dates = weekDates();
  const hours = dates.map(date => (logFor(date).studySeconds || 0) / 3600);
  const max = Math.max(1, ...hours, Number(state.settings.studyTargetHours) || 6);
  return `<div class="bar-chart">${dates.map((date, i) => `<div class="bar-column" title="${hours[i].toFixed(1)} study hours"><div class="bar-value" style="height:${Math.max(hours[i] ? 7 : 2, hours[i] / max * 100)}%"></div><span class="bar-label">${SHORT_DAYS[date.getDay()]}</span></div>`).join("")}</div><div class="chart-caption">This week · <b>${hours.reduce((a, b) => a + b, 0).toFixed(1)} hours</b> focused across ${hours.filter(value => value > 0).length} study days</div>`;
}
function findUpcomingActivity() {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const activities = [...(state.timetable[todayName()] || [])].sort((a, b) => timeMinutes(a.start) - timeMinutes(b.start));
  return activities.find(activity => timeMinutes(activity.start) >= currentMinutes && !dayLog().activitiesDone.includes(activity.id)) || null;
}
function renderDashboard() {
  const log = dayLog();
  const targetSeconds = (Number(state.settings.studyTargetHours) || 6) * 3600;
  const studyPercent = targetSeconds ? Math.min(100, log.studySeconds / targetSeconds * 100) : 0;
  const tasks = todayTasks();
  const doneTasks = tasks.filter(task => task.completed).length;
  const upcoming = findUpcomingActivity();
  const date = new Date();
  const greeting = date.getHours() < 12 ? "Good morning" : date.getHours() < 17 ? "Good afternoon" : "Good evening";
  const quote = QUOTES[date.getDay()];
  const waterPercent = Math.min(100, (log.waterMl || 0) / (Number(state.settings.waterTargetMl) || 2250) * 100);
  const gymDone = Boolean(log.gym?.completed);
  const stats = studyStats();
  const focusToday = Number(log.studySeconds) || 0;
  return `${pageHeader("Your day, in focus.", "A little progress each day builds the results you want. Keep your studies at the center of it all.", `<div class="heading-date">TODAY<strong>${escapeHTML(formatDate())}</strong></div>`)}
    <div class="grid dashboard-grid">
      <section class="card hero-card">
        <div class="hero-top"><span class="hero-greeting">${greeting} — welcome back</span><span class="hero-clock" id="live-clock">${formatClock()}</span></div>
        <div class="hero-content">${progressRing(studyPercent)}<div class="hero-summary"><div class="card-kicker">YOUR STUDY PROGRESS</div><h2>Make today count.</h2><p>${log.studySeconds ? `${durationLabel(log.studySeconds)} of focused study today.` : "Your next study session is a chance to move forward."} ${stats.total ? `${stats.completed} of ${stats.total} chapters completed.` : ""}</p><div class="hero-stats"><div class="hero-stat"><strong>${durationLabel(log.studySeconds || 0)}</strong><span>STUDIED TODAY</span></div><div class="hero-stat"><strong>${Number(state.settings.studyTargetHours) || 6}h</strong><span>DAILY TARGET</span></div><div class="hero-stat"><strong>${stats.percent}%</strong><span>SYLLABUS DONE</span></div></div></div></div>
      </section>
      <section class="card quote-card"><div><div class="quote-mark">“</div><p class="quote-text">${escapeHTML(quote[0])}</p></div><div class="quote-source">— ${escapeHTML(quote[1])}</div></section>
      <section class="card mini-card"><div class="card-title"><h3>TASKS TODAY</h3><span class="mini-icon">☷</span></div><div class="task-summary"><div><strong>${doneTasks}<span class="muted"> / ${tasks.length}</span></strong><small>COMPLETED</small></div><div><strong>${tasks.length - doneTasks}</strong><small>REMAINING</small></div></div></section>
      <section class="card mini-card"><div class="card-title"><h3>FOCUS TODAY</h3><span class="mini-icon">◷</span></div><div class="mini-value">${escapeHTML(durationLabel(focusToday))}</div><div class="mini-meta">TRACKED FOCUS TIME · <button class="inline-link" type="button" data-page="focus">Open Focus</button></div></section>
      <section class="card mini-card"><div class="card-title"><h3>WATER INTAKE</h3><span class="mini-icon">◉</span></div><div class="water-mini"><div class="water-ring" style="--p:${waterPercent}%"><span>${Math.round(waterPercent)}%</span></div><div class="water-copy"><strong>${((log.waterMl || 0) / 1000).toFixed(2)} L</strong><small>OF ${(Number(state.settings.waterTargetMl) / 1000).toFixed(2)} L TARGET</small></div></div></section>
      <section class="card mini-card"><div class="card-title"><h3>GYM</h3><span class="mini-icon">⌁</span></div><div class="mini-value">${gymDone ? "Done" : (state.gymRoutine[todayName()] || "Rest")}<span>${gymDone ? `· ${state.logs[localDate()].gym.duration || 0} min` : ""}</span></div><div class="mini-meta">${gymDone ? "Workout saved today" : "Today's planned training"}</div></section>
      <section class="card chart-card">${cardTitle("Study consistency", "HOURS STUDIED · THIS WEEK", `<div class="chart-legend"><span><i class="legend-dot"></i>FOCUS</span></div>`)}${weeklyStudyChart()}</section>
      <section class="card schedule-card">${cardTitle("Coming up", "YOUR NEXT ACTIVITY")}<div class="schedule-next">${upcoming ? `<small>${escapeHTML(formatTime24(upcoming.start))} — UP NEXT</small><strong>${escapeHTML(upcoming.name)}</strong><span>Scheduled for today</span>` : `<small>YOUR SCHEDULE</small><strong>All caught up for now</strong><span>Check your timetable for the full day.</span>`}</div><div class="schedule-list">${(state.timetable[todayName()] || []).filter(a => timeMinutes(a.start) > new Date().getHours() * 60 + new Date().getMinutes()).slice(0, 2).map(item => `<div class="schedule-row"><span class="timeline-dot"></span><span>${escapeHTML(item.name)}</span><strong>${escapeHTML(formatTime24(item.start))}</strong></div>`).join("") || `<div class="schedule-row">No more activities scheduled today.</div>`}</div></section>
      <section class="card section-card dashboard-quick">${cardTitle("Quick access", "YOUR SPACE")}<div class="button-row"><button type="button" class="button-secondary" data-page="tasks">Review tasks</button><button type="button" class="button-secondary" data-page="focus">Start a focus block</button><button type="button" class="button-secondary" data-page="wellness">Wellness</button></div></section>
    </div>`;
}
function timetablePage() {
  const day = DAYS[selectedScheduleDay];
  const activities = [...(state.timetable[day] || [])].sort((a, b) => timeMinutes(a.start) - timeMinutes(b.start));
  const done = day === todayName() ? dayLog().activitiesDone : [];
  return `${pageHeader("Plan your hours.", "Make space for focused study, rest and everything in between. Each weekday can have its own routine.")}
    <div class="grid section-grid">
      <section class="card section-card span-12">${cardTitle("Your daily rhythm", `${day.toUpperCase()} · ${activities.length} ACTIVITIES`)}
        <div class="day-selector">${DAYS.map((name, index) => `<button class="day-button ${index === selectedScheduleDay ? "active" : ""}" data-action="schedule-day" data-day="${index}" type="button">${SHORT_DAYS[index]}</button>`).join("")}</div>
        <div class="subtle-line"></div>
        <div class="table-wrap"><table class="data-table"><thead><tr><th>TIME</th><th>ACTIVITY</th><th>REMINDER</th><th>STATUS</th><th></th></tr></thead><tbody>${activities.map(activity => `<tr><td class="time-cell">${escapeHTML(formatTime24(activity.start))} – ${escapeHTML(formatTime24(activity.end))}</td><td>${escapeHTML(activity.name)}${activity.studyTracking ?? /study|revision/i.test(activity.name || "") ? `<small class="muted"> · Study period</small>` : ""}</td><td>${activity.reminder ? `<span class="status-pill cyan">ON</span>` : `<span class="muted">—</span>`}</td><td>${day === todayName() ? `<label class="meal-check"><input type="checkbox" data-action="activity-done" data-id="${escapeHTML(activity.id)}" ${done.includes(activity.id) ? "checked" : ""}>${done.includes(activity.id) ? "Done" : "Pending"}</label>` : `<span class="muted">—</span>`}</td><td><div class="row-actions"><button class="button-quiet" data-action="edit-activity" data-id="${escapeHTML(activity.id)}" type="button">Edit</button><button class="button-quiet" data-action="delete-activity" data-id="${escapeHTML(activity.id)}" type="button" aria-label="Delete ${escapeHTML(activity.name)}">×</button></div></td></tr>`).join("") || `<tr><td colspan="5"><div class="empty-state">No activities yet. Add one to shape this day.</div></td></tr>`}</tbody></table></div>
      </section>
      <section class="card section-card span-7">${cardTitle("Add an activity", "BUILD A SCHEDULE THAT WORKS FOR YOU")}
        <form id="activity-form"><div class="form-grid"><div class="field"><label for="activity-name">ACTIVITY</label><input class="input" id="activity-name" name="name" required placeholder="e.g. Revision session"></div><div class="field"><label for="activity-day">DAY</label><select class="select" id="activity-day" name="day">${DAYS.map((name, index) => `<option value="${index}" ${index === selectedScheduleDay ? "selected" : ""}>${name}</option>`).join("")}</select></div><div class="field"><label for="activity-start">START TIME</label><input class="input" id="activity-start" name="start" type="time" required value="19:00"></div><div class="field"><label for="activity-end">END TIME</label><input class="input" id="activity-end" name="end" type="time" required value="20:00"></div></div><div class="form-actions"><label class="reminder-row"><input type="checkbox" name="reminder"> Remind me at the start</label><label class="reminder-row"><input type="checkbox" name="studyTracking"> Mark as a study period</label><button class="button" type="submit">＋ Add activity</button></div></form>
      </section>
      <section class="card section-card span-5">${cardTitle("A routine with room to breathe", "STUDY FIRST. REST COUNTS, TOO.")}<div class="notice"><strong>Every day is editable.</strong> Use the weekday tabs to shape different schedules for tuition days, weekends or exam revision. Mark study periods to enable conservative in-app scheduled tracking. Activity completion is recorded by date and never erases your history.</div><div class="subtle-line"></div><div class="list-stack compact"><div class="schedule-row"><span class="timeline-dot"></span><span>Study periods marked</span><strong>${activities.filter(a => a.studyTracking ?? /study|revision/i.test(a.name || "")).length}</strong></div><div class="schedule-row"><span class="timeline-dot"></span><span>Activities completed today</span><strong>${day === todayName() ? done.length : "—"}</strong></div></div></section>
    </div>`;
}
function chapterStatusSelect(subject, chapter) {
  return `<select class="select" data-action="chapter-status" data-subject="${escapeHTML(subject.id)}" data-id="${escapeHTML(chapter.id)}" aria-label="Status for ${escapeHTML(chapter.name)}">${["Not Started", "In Progress", "Completed"].map(status => `<option ${chapter.status === status ? "selected" : ""}>${status}</option>`).join("")}</select>`;
}
function studyPage() {
  const stats = studyStats();
  const todayHours = (dayLog().studySeconds || 0) / 3600;
  const percent = stats.total ? Math.round(stats.completed / stats.total * 100) : 0;
  const subjectOptions = state.subjects.map(s => `<option value="${escapeHTML(s.id)}" ${timer.subjectId === s.id ? "selected" : ""}>${escapeHTML(s.name)}</option>`).join("");
  return `${pageHeader("Build exam-ready momentum.", "Your HSC Commerce syllabus, focus timer and revision tools — all in one study-first workspace.", `<div class="heading-date">EXAM COUNTDOWN<strong id="exam-countdown">${examCountdown()}</strong></div>`)}
    <div class="grid section-grid">
      <section class="card section-card span-8">${cardTitle("Syllabus overview", `${stats.completed} OF ${stats.total} CHAPTERS COMPLETE`, `<span class="status-pill cyan">${percent}% COMPLETE</span>`)}
        <div class="progress-track" style="height:8px;margin-bottom:15px"><div class="progress-fill" style="width:${percent}%"></div></div>
        <div class="subject-list">${state.subjects.map(subject => {
          const total = subject.chapters.length;
          const complete = subject.chapters.filter(ch => ch.status === "Completed").length;
          const p = total ? Math.round(complete / total * 100) : 0;
          return `<div class="subject-row"><div><strong>${escapeHTML(subject.name)}</strong><small>${complete}/${total} chapters · ${subject.chapters.filter(ch => ch.status === "In Progress").length} in progress</small></div><div class="progress-track"><div class="progress-fill" style="width:${p}%"></div></div><span class="subject-progress-label">${p}%</span><span class="status-pill ${p === 100 ? "good" : "cyan"}">${p === 100 ? "Complete" : "In progress"}</span></div>`;
        }).join("")}</div>
      </section>
      <section class="card section-card span-4">${cardTitle("Daily study target", `${todayHours.toFixed(1)} OF ${Number(state.settings.studyTargetHours) || 6} HOURS`)}${progressRing(todayHours / (Number(state.settings.studyTargetHours) || 6) * 100, "TODAY", "timer-ring")}<div class="button-row" style="justify-content:center;margin-top:8px"><button class="button-secondary" type="button" data-page="progress">View reports</button></div></section>
      <section class="card section-card span-6">${cardTitle("Focus timer", "A SESSION THAT COUNTS")}
        <div class="field"><label for="timer-mode">SESSION TYPE</label><select class="select" id="timer-mode" ${timer.running ? "disabled" : ""}><option value="focus" ${timer.mode === "focus" ? "selected" : ""}>Countdown focus</option><option value="break" ${timer.mode === "break" ? "selected" : ""}>Break</option><option value="stopwatch" ${timer.mode === "stopwatch" ? "selected" : ""}>Stopwatch</option></select></div>
        <div class="field"><label for="timer-subject">STUDYING</label><select class="select" id="timer-subject" ${timer.mode === "break" || timer.running ? "disabled" : ""}><option value="independent" ${timer.subjectId ? "" : "selected"}>Independent study</option>${subjectOptions}</select></div>
        <div class="field"><label for="timer-study-type">STUDY TYPE</label><select class="select" id="timer-study-type" ${timer.mode === "break" || timer.running ? "disabled" : ""}>${STUDY_TYPES.map(type => `<option ${type === timer.studyType ? "selected" : ""}>${type}</option>`).join("")}</select></div>
        <div class="timer-display"><div class="timer-time" id="timer-time">${timer.mode === "stopwatch" ? formatStopwatch(timer.accumulatedSeconds + timer.sessionElapsed) : formatTimer(timer.remaining)}</div><div class="timer-label">${timer.running ? timer.mode === "break" ? "TAKE A BREATH" : timer.mode === "stopwatch" ? "STOPWATCH · COUNTING UP" : "STAY WITH THE MOMENT" : timer.mode === "break" ? "READY FOR A BREAK" : "READY WHEN YOU ARE"}</div></div>
        <div class="button-row" style="justify-content:center"><button class="button" type="button" data-action="timer-toggle">${timer.running ? "Ⅱ Pause session" : state.pausedFocusTimer ? `▶ Resume ${timer.mode}` : `▶ Start ${timer.mode}`}</button><button class="button-secondary" type="button" data-action="timer-stop">Stop</button><button class="button-secondary" type="button" data-action="timer-reset">Reset</button><button class="button-secondary" type="button" data-action="focus-toggle">${document.body.classList.contains("focus-active") ? "Exit focus" : "Focus mode"}</button></div>
        <div class="form-actions" style="justify-content:center"><label class="reminder-row">Duration <input class="input" id="timer-duration" type="number" min="1" max="${timer.mode === "break" ? "60" : "180"}" step="1" value="${Math.round(timer.duration / 60)}" ${timer.running || timer.mode === "stopwatch" ? "disabled" : ""} aria-label="Focus session length in minutes" style="width:82px;min-height:30px;padding:4px 6px"> min</label><label class="reminder-row"><input type="checkbox" id="pomodoro-toggle" ${state.settings.pomodoroEnabled ? "checked" : ""} ${timer.running || timer.mode === "stopwatch" ? "disabled" : ""}> Auto-start a break after focus</label><button class="button-quiet" type="button" data-page="focus">Open Focus</button></div>
      </section>
      <section class="card section-card span-6">${cardTitle("Notes & revision", "KEEP THE IMPORTANT THINGS CLOSE")}
        <form id="notes-form"><div class="field"><label for="study-notes">YOUR STUDY NOTES</label><textarea class="textarea" id="study-notes" name="notes" placeholder="Concepts to revisit, questions to ask, or your next study step...">${escapeHTML(state.notes)}</textarea></div><div class="form-actions"><button class="button" type="submit">Save notes</button><span class="muted">Saved locally to this device</span></div></form>
        <div class="subtle-line"></div><div class="list-stack">${state.subjects.flatMap(subject => subject.chapters.filter(ch => ch.revisionDate && ch.revisionDate <= localDate()).map(ch => `<div class="list-row"><span class="mini-icon">↻</span><div class="row-main"><strong>${escapeHTML(ch.name)}</strong><small>${escapeHTML(subject.name)} · Revision due ${escapeHTML(ch.revisionDate)}</small></div><button class="button-quiet" type="button" data-action="revision-done" data-subject="${escapeHTML(subject.id)}" data-id="${escapeHTML(ch.id)}">Reviewed</button></div>`)).slice(0, 3).join("") || `<div class="empty-state">No revisions due. Schedule a reminder on any chapter below.</div>`}</div>
      </section>
      <section class="card section-card span-12">${cardTitle("Chapters & revision plan", "UPDATE STATUS, ADD CHAPTERS, SET A REVISION DATE")}
        ${state.subjects.map(subject => `<div class="subject-block"><div class="subject-block-head"><strong>${escapeHTML(subject.name)}</strong><span class="tag">${subject.chapters.filter(ch => ch.status === "Completed").length}/${subject.chapters.length} complete</span></div><div class="chapter-list">${subject.chapters.map(ch => `<div class="chapter-line"><div><strong>${escapeHTML(ch.name)}</strong>${ch.revisionDate ? `<small class="muted"> · Revise ${escapeHTML(ch.revisionDate)}</small>` : ""}</div><div class="row-actions"><input class="input" type="date" aria-label="Revision reminder for ${escapeHTML(ch.name)}" data-action="revision-date" data-subject="${escapeHTML(subject.id)}" data-id="${escapeHTML(ch.id)}" value="${escapeHTML(ch.revisionDate || "")}" style="width:133px;min-height:30px;padding:4px 6px;font-size:9px">${chapterStatusSelect(subject, ch)}<button class="button-quiet" type="button" data-action="delete-chapter" data-subject="${escapeHTML(subject.id)}" data-id="${escapeHTML(ch.id)}" aria-label="Delete chapter">×</button></div></div>`).join("") || `<div class="empty-state">No chapters added yet.</div>`}</div><form class="inline-form chapter-form" data-subject="${escapeHTML(subject.id)}"><input class="input" name="chapter" required placeholder="Add a chapter to ${escapeHTML(subject.name)}"><button class="button-secondary" type="submit">＋ Add chapter</button></form></div>`).join("")}
        <form id="subject-form" class="inline-form"><input class="input" name="subject" required placeholder="Add another subject"><button class="button-secondary" type="submit">＋ Add subject</button></form>
      </section>
      <section class="card section-card span-6">${cardTitle("Previous-year questions", "TRACK PRACTICE BY SUBJECT AND YEAR")}<form id="pyq-form"><div class="form-grid"><div class="field"><label>SUBJECT</label><select class="select" name="subjectId" required>${subjectOptions}</select></div><div class="field"><label>YEAR</label><input class="input" name="year" type="number" min="2000" max="2100" value="${new Date().getFullYear()}" required></div></div><div class="form-actions"><button class="button" type="submit">＋ Log question practice</button></div></form><div class="subtle-line"></div><div class="list-stack">${Object.entries(state.pyq).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 8).map(([key, item]) => `<div class="list-row"><span class="mini-icon">✓</span><div class="row-main"><strong>${escapeHTML(getSubject(item.subjectId)?.name || "Removed subject")}</strong><small>Question paper ${escapeHTML(item.year)} · ${escapeHTML(item.date)}</small></div><button class="button-quiet" data-action="delete-pyq" data-id="${escapeHTML(key)}" type="button">×</button></div>`).join("") || `<div class="empty-state">Record a past-paper session when you practise.</div>`}</div></section>
      <section class="card section-card span-6">${cardTitle("Mock test records", "MEASURE WHAT YOU KNOW")}
        <form id="mock-form"><div class="form-grid"><div class="field"><label>SUBJECT</label><select class="select" name="subjectId" required>${subjectOptions}</select></div><div class="field"><label>TEST DATE</label><input class="input" name="date" type="date" value="${localDate()}" required></div><div class="field"><label>SCORE</label><input class="input" name="score" type="number" min="0" required placeholder="e.g. 72"></div><div class="field"><label>MAXIMUM MARKS</label><input class="input" name="maxScore" type="number" min="1" value="100" required></div></div><div class="form-actions"><button class="button" type="submit">＋ Save mock test</button></div></form>
        <div class="subtle-line"></div><div class="list-stack">${state.mockTests.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).map(test => `<div class="list-row"><span class="mini-icon">◎</span><div class="row-main"><strong>${escapeHTML(getSubject(test.subjectId)?.name || "Removed subject")} · ${escapeHTML(test.score)}/${escapeHTML(test.maxScore)}</strong><small>${escapeHTML(test.date)} · ${Math.round(Number(test.score) / Number(test.maxScore) * 100)}%</small></div><button class="button-quiet" type="button" data-action="delete-mock" data-id="${escapeHTML(test.id)}">×</button></div>`).join("") || `<div class="empty-state">Your mock test results will appear here.</div>`}</div>
      </section>
    </div>`;
}
function allStudyEntries() {
  return Object.entries(state.logs)
    .flatMap(([date, log]) => (Array.isArray(log.studySessions) ? log.studySessions : []).map(entry => ({ ...entry, date: entry.date || date })))
    .sort((a, b) => new Date(b.startedAt || `${b.date}T00:00:00`).getTime() - new Date(a.startedAt || `${a.date}T00:00:00`).getTime());
}
function findStudyEntry(id) {
  for (const [date, log] of Object.entries(state.logs)) {
    const entry = (log.studySessions || []).find(item => item.id === id);
    if (entry) return { date, log, entry };
  }
  return null;
}
function adjustStudyEntryCredits(entry, direction) {
  const start = new Date(entry.startedAt).getTime();
  const end = new Date(entry.endedAt).getTime();
  if (entry.aggregateOnStartDate) {
    const log = dayLog(entry.date);
    log.studySeconds = Math.max(0, (Number(log.studySeconds) || 0) + direction * entry.seconds);
  } else if (Number.isFinite(start) && Number.isFinite(end)) {
    creditStudyRange(start, end, direction);
  }
}
function saveStudyEntry(entry, excludeId = "") {
  if (studyEntryOverlaps(new Date(entry.startedAt).getTime(), new Date(entry.endedAt).getTime(), excludeId)) return false;
  const existing = excludeId ? findStudyEntry(excludeId) : null;
  if (existing && !existing.entry.legacy) {
    adjustStudyEntryCredits(existing.entry, -1);
    existing.log.studySessions = existing.log.studySessions.filter(item => item.id !== excludeId);
  }
  const log = dayLog(entry.date);
  log.studySessions.push(entry);
  creditStudyRange(new Date(entry.startedAt).getTime(), new Date(entry.endedAt).getTime());
  return true;
}
function deleteStudyEntry(id) {
  const found = findStudyEntry(id);
  if (!found || found.entry.legacy) return false;
  adjustStudyEntryCredits(found.entry, -1);
  found.log.studySessions = found.log.studySessions.filter(entry => entry.id !== id);
  return true;
}
function currentStudyActivity(date = new Date()) {
  const currentMinute = date.getHours() * 60 + date.getMinutes();
  const todayActivities = state.timetable[DAYS[date.getDay()]] || [];
  for (const activity of todayActivities) {
    if (!(activity.studyTracking ?? /study|revision/i.test(activity.name || ""))) continue;
    const start = timeMinutes(activity.start);
    let end = timeMinutes(activity.end);
    if (end <= start) end += 1440;
    if (currentMinute >= start && currentMinute < end) {
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
      return {
        activity,
        startAt: dayStart + start * 60000,
        endAt: dayStart + end * 60000
      };
    }
  }
  if (currentMinute < 1440) {
    const previousDay = DAYS[(date.getDay() + 6) % 7];
    for (const activity of state.timetable[previousDay] || []) {
      if (!(activity.studyTracking ?? /study|revision/i.test(activity.name || ""))) continue;
      const start = timeMinutes(activity.start);
      let end = timeMinutes(activity.end);
      if (end <= start) end += 1440;
      if (end > 1440 && currentMinute < end - 1440) {
        const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
        const previousDayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1).getTime();
        return {
          activity,
          startAt: previousDayStart + start * 60000,
          endAt: dayStart + (end - 1440) * 60000,
          previousDay: true
        };
      }
    }
  }
  return null;
}
function stopAutomaticStudySession() {
  state.activeAutomaticStudySession = null;
  automaticTracker.sessionId = "";
  automaticTracker.activityId = "";
  automaticTracker.lastTickAt = 0;
  saveState();
}
function tickAutomaticStudyTracker() {
  if (!state?.studyTracking?.automaticEnabled || document.visibilityState !== "visible"
    || !automaticTracker.lastActivityAt
    || Date.now() - automaticTracker.lastActivityAt > state.studyTracking.idleTimeoutMinutes * 60 * 1000
    || timer.running) {
    if (state?.activeAutomaticStudySession) stopAutomaticStudySession();
    return;
  }
  const now = Date.now();
  const scheduled = currentStudyActivity(new Date(now));
  if (!scheduled || scheduled.endAt <= now) {
    if (state.activeAutomaticStudySession) stopAutomaticStudySession();
    else automaticTracker.lastTickAt = now;
    return;
  }
  if (automaticTracker.sessionId && automaticTracker.activityId !== scheduled.activity.id) {
    stopAutomaticStudySession();
  }
  const subject = automaticStudySubject(scheduled.activity);
  const previous = automaticTracker.sessionId ? findStudyEntry(automaticTracker.sessionId)?.entry : null;
  const tickStart = Math.max(
    automaticTracker.lastTickAt || automaticTracker.lastActivityAt,
    automaticTracker.lastActivityAt,
    previous ? new Date(previous.endedAt).getTime() : 0,
    scheduled.startAt
  );
  const end = Math.min(now, scheduled.endAt);
  const start = Math.max(tickStart, end - MAX_AUTOMATIC_TICK_SECONDS * 1000);
  automaticTracker.lastTickAt = now;
  if (end <= start) return;
  const entry = {
    id: previous?.id || uid("study-auto"),
    date: previous?.date || localDate(new Date(start)),
    subjectId: subject?.id || "",
    subjectName: subject?.name || "Independent study",
    studyType: "Study",
    trackingMethod: "automatic",
    startedAt: previous?.startedAt || new Date(start).toISOString(),
    endedAt: new Date(end).toISOString(),
    seconds: Math.max(0, Math.round((end - new Date(previous?.endedAt || start).getTime()) / 1000))
      + (previous?.seconds || 0)
  };
  if (entry.seconds <= 0) return;
  if (!saveStudyEntry(entry, previous?.id || "")) {
    stopAutomaticStudySession();
    return;
  }
  automaticTracker.sessionId = entry.id;
  automaticTracker.activityId = scheduled.activity.id;
  state.activeAutomaticStudySession = { id: entry.id, endedAt: entry.endedAt };
  saveState();
  if (activePage === "focus") {
    const analytics = studyAnalytics();
    const todayTotal = $("#study-total-today");
    const weekTotal = $("#study-total-week");
    const monthTotal = $("#study-total-month");
    const averageTotal = $("#study-total-average");
    if (todayTotal) todayTotal.textContent = durationLabel(analytics.todaySeconds);
    if (weekTotal) weekTotal.textContent = durationLabel(analytics.weekSeconds);
    if (monthTotal) monthTotal.textContent = durationLabel(analytics.monthSeconds);
    if (averageTotal) averageTotal.textContent = durationLabel(analytics.averageDailySeconds);
  }
}
function automaticStudySubject(activity) {
  const name = String(activity.name || "").toLowerCase();
  return state.subjects.find(subject => name.includes(subject.name.toLowerCase())) || null;
}
function updateManualStudyDuration() {
  const date = $("#study-entry-date")?.value;
  const start = $("#study-entry-start")?.value;
  const end = $("#study-entry-end")?.value;
  const output = $("#study-entry-duration");
  if (!output) return;
  const range = studyEntryRange(date, start, end);
  output.textContent = range ? durationLabel(range.seconds) : "Enter valid times (up to 24 hours)";
}
function addQuickStudyDuration(minutes) {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
    showToast("Choose a study duration between 1 minute and 24 hours.");
    return;
  }
  const end = Date.now();
  const start = end - minutes * 60 * 1000;
  if (studyEntryOverlaps(start, end)) {
    showToast("This period overlaps another recorded or active study session.");
    return;
  }
  const subject = getSubject(quickStudySubjectId);
  const entry = {
    id: uid("study-manual"),
    date: localDate(new Date(start)),
    startedAt: new Date(start).toISOString(),
    endedAt: new Date(end).toISOString(),
    seconds: minutes * 60,
    subjectId: subject?.id || "",
    subjectName: subject?.name || "Independent study",
    studyType: STUDY_TYPES.includes(quickStudyType) ? quickStudyType : "Study",
    trackingMethod: "manual"
  };
  if (!saveStudyEntry(entry)) {
    showToast("This period overlaps another recorded or active study session.");
    return;
  }
  saveState();
  renderPage();
  showToast(`${durationLabel(entry.seconds)} added to your study history.`);
}
function studyAnalytics() {
  const today = new Date();
  const todayKey = localDate(today);
  const week = weekDates(today).map(localDate);
  const monthPrefix = todayKey.slice(0, 7);
  const dailyTotals = Object.entries(state.logs).map(([date, log]) => [date, Math.max(0, Number(log.studySeconds) || 0)]);
  const todaySeconds = Number(logFor(todayKey).studySeconds) || 0;
  const weekSeconds = week.reduce((sum, date) => sum + (Number(logFor(date).studySeconds) || 0), 0);
  const monthSeconds = dailyTotals.reduce((sum, [date, seconds]) => sum + (date.startsWith(monthPrefix) ? seconds : 0), 0);
  const daysElapsed = today.getDate();
  let streak = 0;
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  if ((Number(logFor(todayKey).studySeconds) || 0) <= 0) cursor.setDate(cursor.getDate() - 1);
  while (streak < 3660 && (Number(logFor(localDate(cursor)).studySeconds) || 0) > 0) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  const entries = allStudyEntries();
  const subjectTotals = new Map();
  for (const entry of entries) {
    const key = entry.subjectId || entry.subjectName || "independent";
    const current = subjectTotals.get(key) || { name: entry.subjectName || "Independent study", seconds: 0 };
    current.seconds += Number(entry.seconds) || 0;
    subjectTotals.set(key, current);
  }
  const dailyHistory = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (13 - index), 12);
    const key = localDate(date);
    return { date, seconds: Number(logFor(key).studySeconds) || 0 };
  });
  return {
    todaySeconds,
    weekSeconds,
    monthSeconds,
    averageDailySeconds: monthSeconds / Math.max(1, daysElapsed),
    streak,
    dailyHistory,
    subjectTotals: [...subjectTotals.values()].sort((a, b) => b.seconds - a.seconds),
    entries
  };
}
function focusPage() {
  const analytics = studyAnalytics();
  const targetMinutes = clamp(Number(state.settings.focusTargetMinutes) || 120, 1, 1440);
  const subjectOptions = `<option value="" ${quickStudySubjectId ? "" : "selected"}>Independent study</option>${state.subjects.map(subject => `<option value="${escapeHTML(subject.id)}" ${quickStudySubjectId === subject.id ? "selected" : ""}>${escapeHTML(subject.name)}</option>`).join("")}`;
  const entryTypeOptions = (selected = "Study") => STUDY_TYPES.map(type => `<option ${type === selected ? "selected" : ""}>${type}</option>`).join("");
  const entries = analytics.entries.slice(0, 50);
  const maxDailySeconds = Math.max(1, ...analytics.dailyHistory.map(day => day.seconds));
  const maxSubjectSeconds = Math.max(1, ...analytics.subjectTotals.map(subject => subject.seconds));
  const manualEntry = editingStudyEntryId
    ? analytics.entries.find(entry => entry.id === editingStudyEntryId && !entry.legacy)
    : null;
  const tracking = state.studyTracking;
  const autoScheduleCount = (state.timetable[todayName()] || []).filter(activity => activity.studyTracking ?? /study|revision/i.test(activity.name || "")).length;
  const timerMode = timer.mode === "stopwatch" ? "Stopwatch" : timer.mode === "break" ? "Break timer" : "Focus timer";
  const timerDisplay = timer.mode === "stopwatch"
    ? formatStopwatch(timer.accumulatedSeconds + timer.sessionElapsed)
    : formatTimer(timer.remaining);
  const totalCompletedSessions = analytics.entries.filter(entry => entry.trackingMethod === "timer" && entry.completed).length;
  const defaultEntryDate = manualEntry?.date || localDate();
  const defaultStartTime = manualEntry?.startedAt ? localTime(new Date(manualEntry.startedAt)) : "";
  const defaultEndTime = manualEntry?.endedAt ? localTime(new Date(manualEntry.endedAt)) : "";
  const manualFormVisible = Boolean(manualEntry || manualStudyFormOpen);
  return `${pageHeader("Make room for deep work.", "Every study minute counts. Track scheduled active time, use the timer, or add a session you forgot to record.")}
    <div class="grid section-grid">
      <section class="card section-card span-12 study-stats-grid">
        <div class="study-stat"><small>TODAY</small><strong id="study-total-today">${durationLabel(analytics.todaySeconds)}</strong></div>
        <div class="study-stat"><small>THIS WEEK</small><strong id="study-total-week">${durationLabel(analytics.weekSeconds)}</strong></div>
        <div class="study-stat"><small>THIS MONTH</small><strong id="study-total-month">${durationLabel(analytics.monthSeconds)}</strong></div>
        <div class="study-stat"><small>DAILY AVERAGE · MONTH</small><strong id="study-total-average">${durationLabel(analytics.averageDailySeconds)}</strong></div>
        <div class="study-stat"><small>STUDY STREAK</small><strong>${analytics.streak} day${analytics.streak === 1 ? "" : "s"}</strong></div>
        <div class="study-stat"><small>COMPLETED FOCUS SESSIONS</small><strong>${totalCompletedSessions}</strong></div>
      </section>
      <section class="card section-card span-7">${cardTitle(timerMode, timer.running ? "SESSION IN PROGRESS" : state.pausedFocusTimer ? "SESSION PAUSED · READY TO RESUME" : "READY WHEN YOU ARE")}
        <div class="field"><label for="timer-mode">SESSION TYPE</label><select class="select" id="timer-mode" ${timer.running ? "disabled" : ""}><option value="focus" ${timer.mode === "focus" ? "selected" : ""}>Countdown focus</option><option value="break" ${timer.mode === "break" ? "selected" : ""}>Break</option><option value="stopwatch" ${timer.mode === "stopwatch" ? "selected" : ""}>Stopwatch</option></select></div>
        <div class="field"><label for="timer-subject">STUDYING</label><select class="select" id="timer-subject" ${timer.mode === "break" || timer.running ? "disabled" : ""}><option value="independent" ${timer.subjectId ? "" : "selected"}>Independent study</option>${state.subjects.map(subject => `<option value="${escapeHTML(subject.id)}" ${timer.subjectId === subject.id ? "selected" : ""}>${escapeHTML(subject.name)}</option>`).join("")}</select></div>
        <div class="field"><label for="timer-study-type">STUDY TYPE</label><select class="select" id="timer-study-type" ${timer.mode === "break" || timer.running ? "disabled" : ""}>${STUDY_TYPES.map(type => `<option ${type === timer.studyType ? "selected" : ""}>${type}</option>`).join("")}</select></div>
        <div class="timer-display"><div class="timer-time" id="timer-time">${timerDisplay}</div><div class="timer-label">${timer.running ? timer.mode === "break" ? "TAKE A BREATH" : timer.mode === "stopwatch" ? "STOPWATCH · COUNTING UP" : "STAY WITH THE MOMENT" : "YOUR TIME, YOUR PACE"}</div></div>
        <div class="button-row" style="justify-content:center"><button class="button" type="button" data-action="timer-toggle">${timer.running ? "Ⅱ Pause session" : state.pausedFocusTimer ? `▶ Resume ${timer.mode === "stopwatch" ? "stopwatch" : timer.mode}` : `▶ Start ${timer.mode === "stopwatch" ? "stopwatch" : timer.mode}`}</button><button class="button-secondary" type="button" data-action="timer-stop">Stop & save</button><button class="button-secondary" type="button" data-action="timer-reset">Reset</button><button class="button-secondary" type="button" data-action="focus-toggle">${document.body.classList.contains("focus-active") ? "Exit focus" : "Full-screen focus"}</button></div>
        <div class="form-actions" style="justify-content:center"><label class="reminder-row">Duration <input class="input" id="timer-duration" type="number" min="1" max="${timer.mode === "break" ? "60" : "180"}" step="1" value="${Math.round(timer.duration / 60)}" ${timer.running || timer.mode === "stopwatch" ? "disabled" : ""} aria-label="Focus session length in minutes" style="width:82px;min-height:30px;padding:4px 6px"> minutes</label><label class="reminder-row"><input type="checkbox" id="pomodoro-toggle" ${state.settings.pomodoroEnabled ? "checked" : ""} ${timer.running || timer.mode === "stopwatch" ? "disabled" : ""}> Auto-start a break after focus</label></div>
        <div class="notice" style="margin-top:14px">Timer sessions are saved locally and restored from timestamps after reopening. Pause or stop to save the current segment; break time is never counted as study.</div>
      </section>
      <section class="card section-card span-5">${cardTitle("Today's study goal", `${durationLabel(analytics.todaySeconds)} OF ${durationLabel(targetMinutes * 60)}`)}
        ${progressRing(analytics.todaySeconds / (targetMinutes * 60) * 100, "TODAY", "timer-ring")}
        <form id="focus-target-form" style="margin-top:12px"><div class="field"><label for="focus-target">DAILY GOAL · MINUTES</label><input class="input" id="focus-target" name="target" type="number" min="1" max="1440" step="5" value="${targetMinutes}" required></div><div class="form-actions"><button class="button" type="submit">Save study goal</button></div></form>
        <div class="subtle-line"></div><div class="schedule-row"><span class="timeline-dot"></span><span>Study this week</span><strong>${durationLabel(analytics.weekSeconds)}</strong></div>
      </section>
      <section class="card section-card span-12 automatic-tracking-card">${cardTitle("Scheduled study tracking", `${autoScheduleCount} STUDY PERIOD${autoScheduleCount === 1 ? "" : "S"} TODAY`)}
        <div class="automatic-tracking-controls"><label class="check-row"><input type="checkbox" id="automatic-study-toggle" ${tracking.automaticEnabled ? "checked" : ""}><span class="row-main"><strong>Track scheduled study time while StudyFlow is active</strong><small>Opt-in · uses study periods in your timetable</small></span></label><label class="field idle-timeout-field"><span>PAUSE AFTER INACTIVITY</span><select class="select" id="automatic-idle-timeout">${[3, 5, 10].map(minutes => `<option value="${minutes}" ${tracking.idleTimeoutMinutes === minutes ? "selected" : ""}>${minutes} minutes</option>`).join("")}</select></label></div>
        <div class="notice">This records scheduled time only while this app is open and visible, with recent interaction. It pauses when you leave the app or are idle. StudyFlow cannot detect whether you are actually studying. <button class="inline-link" type="button" data-page="timetable">Review your study schedule</button></div>
        ${tracking.automaticEnabled ? `<div class="data-info">${autoScheduleCount ? "Automatic tracking is enabled. It starts only after you interact with StudyFlow during a marked study period." : "No study periods are marked for today. Mark study activities in your timetable to use automatic tracking."}</div>` : ""}
      </section>
      <section class="card section-card span-12 quick-study-card">${cardTitle("Quick add study time", "ADD A SESSION YOU ALREADY COMPLETED")}
        <div class="quick-study-controls"><label class="field"><span>SUBJECT</span><select class="select" id="quick-study-subject">${subjectOptions}</select></label><label class="field"><span>STUDY TYPE</span><select class="select" id="quick-study-type">${entryTypeOptions(quickStudyType)}</select></label></div>
        <div class="quick-add-buttons">${[[15, "+15 Minutes"], [30, "+30 Minutes"], [45, "+45 Minutes"], [60, "+1 Hour"], [120, "+2 Hours"]].map(([minutes, label]) => `<button class="button-secondary" type="button" data-action="quick-add-study" data-minutes="${minutes}">${label}</button>`).join("")}<button class="button-quiet" type="button" data-action="custom-add-study">Custom duration</button></div>
        <button class="button manual-entry-toggle" type="button" data-action="toggle-manual-entry">${manualEntry ? "Editing study entry" : "Forgot to Start Timer?"}</button>
      </section>
      <section class="card section-card span-12 ${manualFormVisible ? "" : "hidden"}" id="manual-study-entry-card">${cardTitle(manualEntry ? "Edit study entry" : "Add a past study session", "CHOOSE THE DATE AND TIMES YOU STUDIED")}
        <form id="study-entry-form"><input type="hidden" name="entryId" value="${escapeHTML(manualEntry?.id || "")}"><div class="form-grid"><div class="field"><label for="study-entry-date">STUDY DATE</label><input class="input" id="study-entry-date" name="date" type="date" value="${escapeHTML(defaultEntryDate)}" required></div><div class="field"><label for="study-entry-start">START TIME</label><input class="input" id="study-entry-start" name="startTime" type="time" value="${escapeHTML(defaultStartTime)}" required></div><div class="field"><label for="study-entry-end">END TIME</label><input class="input" id="study-entry-end" name="endTime" type="time" value="${escapeHTML(defaultEndTime)}" required></div><div class="field"><label> TOTAL STUDY DURATION</label><output class="input study-duration-output" id="study-entry-duration">${manualEntry ? durationLabel(manualEntry.seconds) : "Calculated from start and end"}</output></div><div class="field"><label for="study-entry-subject">SUBJECT</label><select class="select" id="study-entry-subject" name="subjectId"><option value="">Independent study</option>${state.subjects.map(subject => `<option value="${escapeHTML(subject.id)}" ${manualEntry?.subjectId === subject.id ? "selected" : ""}>${escapeHTML(subject.name)}</option>`).join("")}</select></div><div class="field"><label for="study-entry-type">STUDY TYPE</label><select class="select" id="study-entry-type" name="studyType">${entryTypeOptions(manualEntry?.studyType || "Study")}</select></div></div><div class="form-actions"><button class="button" type="submit">${manualEntry ? "Save changes" : "Add study session"}</button>${manualEntry ? `<button class="button-secondary" type="button" data-action="cancel-study-edit">Cancel edit</button>` : ""}</div></form>
      </section>
      <section class="card section-card span-12">${cardTitle("Daily study history", "LAST 14 DAYS · ALL TRACKING METHODS")}
        <div class="study-history-chart">${analytics.dailyHistory.map(day => `<div class="study-history-day" title="${escapeHTML(localDate(day.date))}: ${escapeHTML(durationLabel(day.seconds))}"><div class="study-history-bar" style="height:${day.seconds ? Math.max(4, day.seconds / maxDailySeconds * 100) : 2}%"></div><small>${escapeHTML(new Intl.DateTimeFormat(undefined, { weekday: "narrow" }).format(day.date))}</small></div>`).join("")}</div>
      </section>
      <section class="card section-card span-6">${cardTitle("Study time by subject", "SAVED STUDY RECORDS")}
        <div class="study-subject-list">${analytics.subjectTotals.slice(0, 8).map(subject => `<div class="study-subject-row"><div class="row-main"><strong>${escapeHTML(subject.name)}</strong><small>${durationLabel(subject.seconds)}</small></div><div class="progress-track"><div class="progress-fill" style="width:${Math.max(3, subject.seconds / maxSubjectSeconds * 100)}%"></div></div></div>`).join("") || `<div class="empty-state">Your subject totals will appear after you record study time.</div>`}</div>
      </section>
      <section class="card section-card span-6">${cardTitle("Study streak", "CONSECUTIVE DAYS WITH RECORDED STUDY")}
        <div class="study-streak-value">${analytics.streak}<small> day${analytics.streak === 1 ? "" : "s"}</small></div><p class="muted">Daily average this month: ${durationLabel(analytics.averageDailySeconds)} · ${analytics.entries.filter(entry => !entry.legacy).length} saved sessions.</p>
      </section>
      <section class="card section-card span-12">${cardTitle("Study history", `${entries.length} OF ${analytics.entries.length} RECORDS · NEWEST FIRST`)}
        <div class="list-stack study-history-list">${entries.map(entry => {
          const start = entry.startedAt ? new Date(entry.startedAt) : null;
          const end = entry.endedAt ? new Date(entry.endedAt) : null;
          const timeRange = start && end && Number.isFinite(start.getTime()) && Number.isFinite(end.getTime())
            ? `${formatDate(start, { hour: "numeric", minute: "2-digit" })} – ${formatDate(end, { hour: "numeric", minute: "2-digit" })}`
            : "Time not available in this older record";
          const method = entry.legacy ? "Earlier record · method unavailable" : entry.trackingMethod === "automatic" ? "Automatic · scheduled active time" : entry.trackingMethod === "manual" ? "Manual" : "Timer";
          return `<div class="list-row study-history-entry"><span class="mini-icon">◷</span><div class="row-main"><strong>${escapeHTML(entry.subjectName || "Independent study")} · ${escapeHTML(entry.studyType || "Study")}</strong><small>${escapeHTML(entry.date)} · ${escapeHTML(timeRange)} · ${escapeHTML(method)}${entry.completed ? " · completed focus" : ""}</small></div><span class="status-pill cyan">${studyDurationLabel(entry.seconds)}</span>${entry.legacy ? "" : `<div class="row-actions"><button class="button-quiet" type="button" data-action="edit-study-entry" data-id="${escapeHTML(entry.id)}">Edit</button><button class="button-quiet" type="button" data-action="delete-study-entry" data-id="${escapeHTML(entry.id)}" aria-label="Delete study entry">×</button></div>`}</div>`;
        }).join("") || `<div class="empty-state">Recorded focus, automatic, and manual sessions will appear here.</div>`}</div>
      </section>
    </div>`;
}
function wellnessOverviewPage() {
  const log = dayLog();
  const workout = log.gym?.completed ? `${log.gym.duration || 0} min completed` : state.gymRoutine[todayName()] || "Rest";
  return `${pageHeader("Support your energy.", "Keep hydration, movement and simple routines in one calm place.")}
    <div class="grid section-grid">
      <section class="card section-card span-6">${cardTitle("Water", "TODAY'S INTAKE")}<div class="list-row"><div class="row-main"><strong>${((Number(log.waterMl) || 0) / 1000).toFixed(2)} L</strong><small>Target ${((Number(state.settings.waterTargetMl) || 2250) / 1000).toFixed(2)} L</small></div><button class="button-secondary" type="button" data-page="water">Log water</button></div></section>
      <section class="card section-card span-6">${cardTitle("Today's workout", "MOVEMENT")}<div class="list-row"><div class="row-main"><strong>${escapeHTML(workout)}</strong><small>${log.gym?.completed ? "Workout recorded" : "Planned routine"}</small></div><button class="button-secondary" type="button" data-page="gym">Open gym</button></div></section>
      <section class="card section-card span-12">${cardTitle("Daily routines", "WATER · GYM · SKINCARE")}<div class="button-row">${[["water", "Water"], ["gym", "Gym"], ["skincare", "Skincare"]].map(([page, label]) => `<button type="button" class="button-secondary" data-page="${page}">${label}</button>`).join("")}</div></section>
    </div>`;
}
function formatTimer(seconds) {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}
function formatStopwatch(seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainder = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}
function examCountdown() {
  if (!state.settings.examDate) return "Set your exam date";
  const diff = Math.ceil((new Date(`${state.settings.examDate}T00:00:00`) - new Date(`${localDate()}T00:00:00`)) / 86400000);
  return diff < 0 ? "Exam date passed" : diff === 0 ? "Today is exam day" : `${diff} days to go`;
}
function waterPage() {
  const target = Number(state.settings.waterTargetMl) || 2250;
  const current = dayLog().waterMl || 0;
  const pct = Math.min(100, current / target * 100);
  const week = weekDates().map(date => ({ date, amount: logFor(date).waterMl || 0 }));
  return `${pageHeader("Hydrate, one glass at a time.", "Your water target is adjustable. Let thirst, activity and weather guide what feels right.")}
    <div class="grid section-grid">
      <section class="card section-card span-7">${cardTitle("Today's hydration", "A GENTLE DAILY REMINDER")}
        <div class="water-large"><div class="water-ring-large" style="--p:${pct}%"><div class="water-center"><strong>${((current) / 1000).toFixed(2)}</strong><small>OF ${((target) / 1000).toFixed(2)} L</small></div></div><div class="water-big-value"><strong>${Math.round(pct)}% complete</strong><small>${Math.max(0, target - current)} ml to your target</small></div></div>
        <div class="button-row" style="justify-content:center"><button class="button" type="button" data-action="water-add" data-amount="250">＋ 250 ml</button><button class="button-secondary" type="button" data-action="water-add" data-amount="500">＋ 500 ml</button><button class="button-secondary" type="button" data-action="water-custom">Custom amount</button><button class="button-quiet" type="button" data-action="water-undo">Undo last</button></div>
      </section>
      <section class="card section-card span-5">${cardTitle("Daily target", "ADJUST TO YOUR NEEDS")}
        <form id="water-target-form"><div class="field"><label for="water-target">TARGET IN MILLILITRES</label><input class="input" id="water-target" name="target" type="number" min="250" max="10000" step="50" value="${target}" required></div><div class="form-actions"><button class="button" type="submit">Save water target</button></div></form>
        <div class="subtle-line"></div><div class="notice">A starting target of <strong>2–2.5 litres</strong> works for many people. Hydration needs vary with activity and weather; drink to thirst and follow any advice from your healthcare professional.</div>
      </section>
      <section class="card section-card span-12">${cardTitle("This week's water", "DAILY TOTAL · MILLILITRES")}
        <div class="report-bars">${week.map(item => { const h = Math.min(100, item.amount / target * 100); return `<div class="report-column" title="${item.amount} ml"><div class="report-bar" style="height:${Math.max(h ? 5 : 2, h)}%;opacity:${item.date.getDay() === new Date().getDay() ? 1 : .65}"></div><small>${SHORT_DAYS[item.date.getDay()]}</small></div>`; }).join("")}</div>
        <div class="table-wrap" style="margin-top:20px"><table class="data-table"><thead><tr><th>DATE</th><th>INTAKE</th><th>TARGET</th><th>PROGRESS</th></tr></thead><tbody>${Object.entries(state.logs).filter(([, log]) => log.waterMl > 0).sort(([a], [b]) => b.localeCompare(a)).slice(0, 14).map(([date, log]) => `<tr><td class="time-cell">${escapeHTML(date)}</td><td>${log.waterMl} ml</td><td>${target} ml</td><td><span class="status-pill ${log.waterMl >= target ? "good" : "cyan"}">${Math.round(log.waterMl / target * 100)}%</span></td></tr>`).join("") || `<tr><td colspan="4"><div class="empty-state">Your daily water history will appear here.</div></td></tr>`}</tbody></table></div>
      </section>
    </div>`;
}
function gymPage() {
  const day = todayName();
  const routine = state.gymRoutine[day] || "Rest";
  const log = dayLog().gym || {};
  const restDay = routine === "Rest";
  const exerciseList = EXERCISES[routine] || [];
  return `${pageHeader("Train with intention.", "Keep strength, recovery and consistency in balance. Your weekly split is fully editable.", `<div class="heading-date">TODAY'S SPLIT<strong>${escapeHTML(routine)}</strong></div>`)}
    <div class="grid section-grid">
      <section class="card section-card span-7">${cardTitle("Today's workout", `${day.toUpperCase()} · ${restDay ? "RECOVERY DAY" : "TRAINING DAY"}`, `<span class="status-pill ${log.completed ? "good" : "cyan"}">${log.completed ? "COMPLETED" : restDay ? "REST" : "PLANNED"}</span>`)}
        ${restDay ? `<div class="notice"><strong>Rest is part of the plan.</strong> Take a recovery day, get some gentle movement if it feels good, and let your body recharge.</div>` : `<div class="exercise-grid">${exerciseList.map((exercise, index) => `<label class="exercise-chip"><input type="checkbox" data-action="exercise-done" data-index="${index}" ${log.exercisesDone?.includes(index) ? "checked" : ""}>${escapeHTML(exercise)} <span class="muted">· ${escapeHTML(log.sets?.[index] || 3)} sets</span></label>`).join("")}</div><div class="subtle-line"></div><div class="form-grid"><div class="field"><label for="gym-duration">WORKOUT DURATION (MIN)</label><input class="input" type="number" id="gym-duration" min="1" max="300" value="${escapeHTML(log.duration || 60)}"></div><div class="field"><label for="gym-sets">DEFAULT SETS</label><input class="input" type="number" id="gym-sets" min="1" max="20" value="${escapeHTML(log.defaultSets || 3)}"></div></div><div class="form-actions"><button class="button" type="button" data-action="gym-finish">${log.completed ? "Update workout log" : "✓ Finish workout"}</button><button class="button-secondary" type="button" data-action="gym-undo">Clear today's workout</button></div>`}
      </section>
      <section class="card section-card span-5">${cardTitle("Weekly workout split", "EDIT A DAY TO MATCH YOUR TRAINING")}
        <div class="list-stack">${DAYS.map(name => `<div class="list-row"><span class="mini-icon">${name === "Sunday" ? "○" : "⌁"}</span><div class="row-main"><strong>${escapeHTML(name)}</strong><small>${name === day && log.completed ? `Completed · ${log.duration || 0} min` : "Weekly routine"}</small></div><select class="select" data-action="gym-routine" data-day="${escapeHTML(name)}" style="width:auto;min-height:32px;font-size:9px">${["Chest + Triceps", "Back + Biceps", "Legs + Shoulders", "Rest"].map(split => `<option ${routine === split && day === name ? "selected" : (state.gymRoutine[name] === split ? "selected" : "")}>${split}</option>`).join("")}</select></div>`).join("")}</div>
      </section>
      <section class="card section-card span-12">${cardTitle("Workout history & recovery", "YOUR TRAINING IS SAVED BY DATE")}
        <div class="form-grid"><div class="field"><label for="recovery-rating">TODAY'S RECOVERY FEELING</label><select class="select" id="recovery-rating"><option value="">Not logged</option>${["Low", "Okay", "Good", "Great"].map(item => `<option ${dayLog().gym?.recovery === item ? "selected" : ""}>${item}</option>`).join("")}</select></div><div class="field"><label for="recovery-note">RECOVERY NOTE</label><input class="input" id="recovery-note" placeholder="How is your body feeling?" value="${escapeHTML(dayLog().gym?.recoveryNote || "")}"></div></div><div class="form-actions"><button class="button-secondary" type="button" data-action="save-recovery">Save recovery check-in</button></div>
        <div class="table-wrap" style="margin-top:13px"><table class="data-table"><thead><tr><th>DATE</th><th>WORKOUT</th><th>DURATION</th><th>EXERCISES</th><th>RECOVERY</th></tr></thead><tbody>${Object.entries(state.logs).filter(([, value]) => value.gym?.completed).sort(([a], [b]) => b.localeCompare(a)).slice(0, 14).map(([date, value]) => `<tr><td class="time-cell">${escapeHTML(date)}</td><td>${escapeHTML(value.gym.routine || state.gymRoutine[DAYS[new Date(`${date}T12:00:00`).getDay()]] || "Workout")}</td><td>${escapeHTML(value.gym.duration || 0)} min</td><td>${value.gym.exercisesDone?.length || 0}</td><td>${escapeHTML(value.gym.recovery || "—")}</td></tr>`).join("") || `<tr><td colspan="5"><div class="empty-state">Completed workouts will appear here.</div></td></tr>`}</tbody></table></div>
      </section>
    </div>`;
}
function skincarePage() {
  const log = dayLog();
  const renderRoutine = (key, title, time) => `<section class="card section-card span-6">${cardTitle(title, "A SIMPLE, GENTLE ROUTINE", `<span class="skincare-time">${time}</span>`)}<div class="list-stack">${state.skincare[key].map((step, index) => `<div class="check-row ${log.skincareDone[key].includes(step) ? "is-done" : ""}"><input type="checkbox" data-action="skin-done" data-routine="${key}" data-index="${index}" ${log.skincareDone[key].includes(step) ? "checked" : ""}><label>${escapeHTML(step)}</label><button class="button-quiet" type="button" data-action="delete-skincare-step" data-routine="${key}" data-index="${index}" aria-label="Delete step">×</button></div>`).join("") || `<div class="empty-state">Add a simple step that works for you.</div>`}</div><form class="inline-form skincare-form" data-routine="${key}"><input class="input" name="step" required placeholder="Add a routine step"><button class="button-secondary" type="submit">＋ Add</button></form></section>`;
  const history = Object.entries(state.logs).filter(([, item]) => item.skincareDone.morning.length || item.skincareDone.night.length).sort(([a], [b]) => b.localeCompare(a)).slice(0, 7);
  return `${pageHeader("Care for your skin.", "A gentle routine you can actually keep. Track the basics without adding pressure.")}
    <div class="grid section-grid">
      ${renderRoutine("morning", "Morning", "☼ AM")}
      ${renderRoutine("night", "Night", "☾ PM")}
      <section class="card section-card span-12">${cardTitle("Gentle reminders", "CONSISTENCY, NOT PERFECTION")}<div class="notice">Keep routines comfortable and simple. Use products you already know work for you, avoid squeezing pimples, and keep pillowcases and towels clean. Stop using anything that irritates your skin.</div><div class="table-wrap" style="margin-top:14px"><table class="data-table"><thead><tr><th>DATE</th><th>MORNING STEPS</th><th>NIGHT STEPS</th></tr></thead><tbody>${history.map(([date, item]) => `<tr><td class="time-cell">${escapeHTML(date)}</td><td>${item.skincareDone.morning.length}/${state.skincare.morning.length}</td><td>${item.skincareDone.night.length}/${state.skincare.night.length}</td></tr>`).join("") || `<tr><td colspan="3"><div class="empty-state">Skincare habit history will show after you check off a routine.</div></td></tr>`}</tbody></table></div></section>
    </div>`;
}
function taskViewDates(view) {
  const today = localDate();
  const tasks = state.tasks.filter(task => task.listId === state.activeTaskListId);
  if (view === "day") return tasks.filter(task => !task.dueDate || task.dueDate <= today);
  if (view === "week") {
    const dates = weekDates().map(localDate);
    return tasks.filter(task => !task.dueDate || dates.includes(task.dueDate));
  }
  if (view === "calendar") {
    const month = `${taskCalendarDate.getFullYear()}-${String(taskCalendarDate.getMonth() + 1).padStart(2, "0")}`;
    return tasks.filter(task => task.dueDate?.startsWith(month));
  }
  return tasks.filter(task => !task.dueDate || task.dueDate.slice(0, 7) === today.slice(0, 7));
}
function nextTaskDate(task) {
  if (!task.dueDate || !["daily", "weekly", "monthly"].includes(task.recurrence)) return "";
  const [year, month, day] = task.dueDate.split("-").map(Number);
  if (task.recurrence === "daily" || task.recurrence === "weekly") {
    const date = new Date(year, month - 1, day, 12);
    date.setDate(date.getDate() + (task.recurrence === "daily" ? 1 : 7));
    return localDate(date);
  }
  const nextMonth = new Date(year, month, 1, 12);
  const lastDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
  nextMonth.setDate(Math.min(Number(task.recurrenceDay) || day, lastDay));
  return localDate(nextMonth);
}
function createNextRecurringTask(task) {
  const dueDate = nextTaskDate(task);
  if (!dueDate || (task.recurrenceUntil && dueDate > task.recurrenceUntil)) return;
  const parentId = task.recurrenceParentId || task.id;
  const exists = state.tasks.some(item =>
    (item.id === parentId || item.recurrenceParentId === parentId) && item.dueDate === dueDate
  );
  if (exists) return;
  state.tasks.push({
    ...task,
    id: uid("task"),
    recurrenceParentId: parentId,
    dueDate,
    completed: false,
    completedAt: "",
    createdAt: new Date().toISOString()
  });
}
let taskView = "day";
let taskCalendarDate = new Date();
function taskCalendar() {
  const year = taskCalendarDate.getFullYear();
  const month = taskCalendarDate.getMonth();
  const first = new Date(year, month, 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - mondayOffset);
  const tasksByDate = new Map();
  for (const task of state.tasks.filter(item => item.listId === state.activeTaskListId)) {
    if (!task.dueDate) continue;
    const dayTasks = tasksByDate.get(task.dueDate) || [];
    dayTasks.push(task);
    tasksByDate.set(task.dueDate, dayTasks);
  }
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const dateKey = localDate(date);
    const dayTasks = tasksByDate.get(dateKey) || [];
    return `<div class="calendar-day ${date.getMonth() !== month ? "outside-month" : ""} ${dateKey === localDate() ? "today" : ""}"><span class="calendar-day-number">${date.getDate()}</span>${dayTasks.slice(0, 2).map(task => `<div class="calendar-task ${task.completed ? "done" : ""}" title="${escapeHTML(task.title)}">${escapeHTML(task.title)}</div>`).join("")}${dayTasks.length > 2 ? `<div class="calendar-task">+${dayTasks.length - 2} more</div>` : ""}</div>`;
  });
  return `<div class="card-title" style="margin-top:14px"><div><h2>${escapeHTML(formatDate(taskCalendarDate, { month: "long", year: "numeric" }))}</h2><small>Due dates from saved tasks</small></div><div class="button-row"><button type="button" class="button-quiet" data-action="task-calendar-shift" data-offset="-1" aria-label="Previous month">←</button><button type="button" class="button-quiet" data-action="task-calendar-shift" data-offset="1" aria-label="Next month">→</button></div></div><div class="task-calendar">${["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map(day => `<div class="calendar-weekday">${day}</div>`).join("")}${days.join("")}</div>`;
}
function tasksPage() {
  const tasks = taskViewDates(taskView).slice().sort((a, b) => Number(a.completed) - Number(b.completed) || (a.dueDate || "9999").localeCompare(b.dueDate || "9999") || ((TASK_PRIORITY_ORDER[a.priority] ?? 3) - (TASK_PRIORITY_ORDER[b.priority] ?? 3)));
  const pending = tasks.filter(task => !task.completed).length;
  const task = state.tasks.find(item => item.id === editingTaskId);
  const activeList = state.taskLists.find(list => list.id === state.activeTaskListId) || state.taskLists[0];
  const expandedTaskIds = new Set(state.ui?.expandedTaskIds || []);
  return `${pageHeader("Make room for what matters.", "Keep personal work and health moving without letting them steal focus from your studies.")}
    <div class="grid section-grid">
      <section class="card section-card span-12 task-list-manager">
        ${cardTitle("Task lists", `${state.taskLists.length} LIST${state.taskLists.length === 1 ? "" : "S"} · YOUR TASKS STAY SEPARATE`)}
        <div class="task-list-controls">
          <label class="field"><span>ACTIVE LIST</span><select class="select" id="active-task-list">${state.taskLists.map(list => `<option value="${escapeHTML(list.id)}" ${list.id === activeList?.id ? "selected" : ""}>${escapeHTML(list.name)}</option>`).join("")}</select></label>
          <form id="task-list-form" class="inline-form"><input class="input" name="name" maxlength="60" required placeholder="Create a task list"><button class="button-secondary" type="submit">＋ New list</button></form>
          <div class="button-row"><button type="button" class="button-quiet" data-action="rename-task-list" data-id="${escapeHTML(activeList?.id || "")}">Rename list</button>${activeList?.id !== DEFAULT_TASK_LIST_ID ? `<button type="button" class="button-quiet" data-action="delete-task-list" data-id="${escapeHTML(activeList?.id || "")}">Delete list</button>` : ""}</div>
        </div>
      </section>
      <section class="card section-card span-4">${cardTitle(editingTaskId ? "Edit task" : "Add a task", editingTaskId ? "UPDATE YOUR TASK" : "CAPTURE IT, THEN GET BACK TO STUDY")}
        <form id="task-form"><input type="hidden" name="taskId" value="${escapeHTML(task?.id || "")}"><div class="form-grid"><div class="field full"><label>TASK</label><input class="input" name="title" required maxlength="120" placeholder="What needs doing?" value="${escapeHTML(task?.title || "")}"></div><div class="field"><label>CATEGORY</label><select class="select" name="category">${["Study", "Personal Work", "Health", "Gym", "Other"].map(category => `<option ${task?.category === category ? "selected" : ""}>${category}</option>`).join("")}</select></div><div class="field"><label>PRIORITY</label><select class="select" name="priority">${["High", "Low"].map(priority => `<option ${task?.priority === priority ? "selected" : ""}>${priority}</option>`).join("")}</select></div><div class="field"><label>DUE DATE</label><input class="input" name="dueDate" type="date" value="${escapeHTML(task?.dueDate || localDate())}"></div><div class="field"><label>REMINDER TIME</label><input class="input" name="dueTime" type="time" value="${escapeHTML(task?.dueTime || "")}"></div><div class="field"><label>REPEAT</label><select class="select" name="recurrence">${[["none", "Does not repeat"], ["daily", "Daily"], ["weekly", "Weekly"], ["monthly", "Monthly"]].map(([value, label]) => `<option value="${value}" ${(task?.recurrence || "none") === value ? "selected" : ""}>${label}</option>`).join("")}</select></div><div class="field"><label>REPEAT UNTIL (OPTIONAL)</label><input class="input" name="recurrenceUntil" type="date" value="${escapeHTML(task?.recurrenceUntil || "")}"></div><div class="field full"><label class="reminder-row"><input type="checkbox" name="reminder" ${task?.reminder ? "checked" : ""}> Enable a notification reminder</label></div></div><div class="notice" style="margin-top:10px">A recurring task creates its next dated occurrence only after you complete the current one. Reminders use the notification settings you enable.</div><div class="form-actions"><button class="button" type="submit">${editingTaskId ? "Save task" : "＋ Add task"}</button>${editingTaskId ? `<button class="button-secondary" type="button" data-action="cancel-task-edit">Cancel</button>` : ""}</div></form>
      </section>
      <section class="card section-card span-8">${cardTitle("Your task list", `${pending} PENDING · ${tasks.length - pending} COMPLETE`, `<div class="tab-row">${[["day", "DAY"], ["week", "WEEK"], ["month", "MONTH"], ["calendar", "CALENDAR"]].map(([value, name]) => `<button type="button" class="tab-button ${taskView === value ? "active" : ""}" data-action="task-view" data-view="${value}">${name}</button>`).join("")}</div>`) }
        ${taskView === "calendar" ? taskCalendar() : ""}
        <div class="list-stack">${tasks.map(item => {
          const progress = getTaskProgress(item);
          const expanded = expandedTaskIds.has(item.id);
          const subtasks = normalizeTaskSubtasks(item);
          const subtitle = `${escapeHTML(item.category)} · ${item.dueDate ? escapeHTML(item.dueDate) : "No due date"}${item.dueTime ? ` at ${escapeHTML(formatTime24(item.dueTime))}` : ""}${item.recurrence ? ` · repeats ${escapeHTML(item.recurrence)}` : ""}${item.reminder ? " · reminder on" : ""}`;
          return `<div class="list-row task-row ${item.completed ? "is-done" : ""} ${expanded ? "is-expanded" : ""}">
            <div class="task-check-wrap"><input type="checkbox" data-action="task-done" data-id="${escapeHTML(item.id)}" ${item.completed ? "checked" : ""} aria-label="Complete ${escapeHTML(item.title)}"></div>
            <div class="task-main">
              <div class="task-row-head">
                <div class="row-main"><strong>${escapeHTML(item.title)}</strong><small>${subtitle}</small></div>
                <span class="status-pill task-priority ${item.priority === "High" ? "high" : "low"}">${escapeHTML(item.priority)} priority</span>
              </div>
              ${subtasks.length ? `<div class="task-progress"><span>${progress.completed}/${progress.total}</span><div class="progress-track"><span style="width:${progress.percent}%"></span></div></div>` : ""}
              ${expanded ? `<div class="task-subtasks">
                ${subtasks.length ? subtasks.map(subtask => `<label class="task-subtask ${subtask.completed ? "done" : ""}"><input type="checkbox" data-action="task-subtask-done" data-id="${escapeHTML(item.id)}" data-subtask-id="${escapeHTML(subtask.id)}" ${subtask.completed ? "checked" : ""}><span>${escapeHTML(subtask.title)}</span><button type="button" class="button-quiet" data-action="delete-task-subtask" data-id="${escapeHTML(item.id)}" data-subtask-id="${escapeHTML(subtask.id)}" aria-label="Delete subtask">×</button></label>`).join("") : `<div class="empty-state">No subtasks yet. Add the next step below.</div>`}
                <form class="inline-form subtask-form" data-task-id="${escapeHTML(item.id)}"><input class="input" name="subtask" maxlength="120" placeholder="Add a subtask"><button class="button-secondary" type="submit">＋ Add</button></form>
              </div>` : ""}
            </div>
            <div class="row-actions task-actions"><button class="button-quiet" type="button" data-action="${expanded ? "collapse-task" : "expand-task"}" data-id="${escapeHTML(item.id)}">${expanded ? "Hide" : "Expand"}</button><button class="button-quiet" type="button" data-action="edit-task" data-id="${escapeHTML(item.id)}">Edit</button><button class="button-quiet" type="button" data-action="delete-task" data-id="${escapeHTML(item.id)}" aria-label="Delete task">×</button></div>
          </div>`;
         }).join("") || `<div class="empty-state">Nothing in this view yet. Add a task when you need to remember something.</div>`}</div>
      </section>
      <section class="card section-card span-12">${cardTitle(`${escapeHTML(activeList?.name || "Task")} history`, "COMPLETED TASKS ARE KEPT, NOT ERASED")}<div class="table-wrap"><table class="data-table"><thead><tr><th>TASK</th><th>CATEGORY</th><th>PRIORITY</th><th>DUE DATE</th><th>COMPLETED</th></tr></thead><tbody>${state.tasks.filter(item => item.listId === activeList?.id && item.completed).sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || "")).slice(0, 20).map(item => `<tr><td>${escapeHTML(item.title)}</td><td>${escapeHTML(item.category)}</td><td>${escapeHTML(item.priority)}</td><td>${escapeHTML(item.dueDate || "—")}</td><td class="time-cell">${escapeHTML(item.completedAt || "—")}</td></tr>`).join("") || `<tr><td colspan="5"><div class="empty-state">Completed tasks will be recorded here with their completion dates.</div></td></tr>`}</tbody></table></div></section>
    </div>`;
}
let editingTaskId = "";
let habitPeriod = 30;
let selectedHabitId = "";
function shiftLocalDate(dateKey, days) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  date.setDate(date.getDate() + days);
  return localDate(date);
}
function habitRecord(date, habitId) {
  return state.habitRecords[date]?.[habitId] || null;
}
function habitDateSummary(date) {
  const records = Object.values(state.habitRecords[date] || {});
  const completed = records.filter(record => record.status === "completed").length;
  const missed = records.filter(record => record.status === "missed").length;
  const tracked = completed + missed;
  return { completed, missed, tracked, percent: tracked ? Math.round(completed / tracked * 100) : null };
}
function habitDatesEndingToday(count) {
  const today = localDate();
  return Array.from({ length: count }, (_, index) => shiftLocalDate(today, index - count + 1));
}
function streakStats(successDates) {
  const successful = new Set(successDates);
  let longest = 0;
  let run = 0;
  let previousDate = "";
  for (const date of [...successful].sort()) {
    run = previousDate && shiftLocalDate(previousDate, 1) === date ? run + 1 : 1;
    longest = Math.max(longest, run);
    previousDate = date;
  }
  const today = localDate();
  let cursor = successful.has(today) ? today : shiftLocalDate(today, -1);
  let current = 0;
  while (successful.has(cursor)) {
    current += 1;
    cursor = shiftLocalDate(cursor, -1);
  }
  return { current, longest };
}
function habitAnalytics(habitId = "") {
  const dates = Object.keys(state.habitRecords).sort();
  const counts = { completed: 0, missed: 0 };
  const successDates = [];
  for (const date of dates) {
    const records = state.habitRecords[date] || {};
    const record = habitId ? records[habitId] : null;
    const selected = habitId
      ? record ? [[habitId, record]] : []
      : Object.entries(records);
    let hasCompletion = false;
    let hasMiss = false;
    for (const [, item] of selected) {
      if (item.status === "completed") { counts.completed += 1; hasCompletion = true; }
      if (item.status === "missed") { counts.missed += 1; hasMiss = true; }
    }
    if (hasCompletion && !hasMiss) successDates.push(date);
  }
  const streak = streakStats(successDates);
  const tracked = counts.completed + counts.missed;
  return { ...counts, tracked, percent: tracked ? Math.round(counts.completed / tracked * 100) : 0, ...streak, successDates };
}
function habitTrendGraph(dates) {
  const width = 720;
  const height = 190;
  const top = 14;
  const bottom = 28;
  const chartHeight = height - top - bottom;
  const cellWidth = width / Math.max(1, dates.length);
  const maxRecords = Math.max(1, ...dates.map(date => habitDateSummary(date).tracked));
  const points = [];
  let segment = [];
  const bars = dates.map((date, index) => {
    const summary = habitDateSummary(date);
    const x = index * cellWidth + cellWidth * .2;
    const barWidth = Math.max(2, cellWidth * .58);
    const completedHeight = summary.completed / maxRecords * chartHeight;
    const missedHeight = summary.missed / maxRecords * chartHeight;
    const baseY = top + chartHeight;
    const pointY = summary.percent === null ? baseY : top + chartHeight * (1 - summary.percent / 100);
    if (summary.percent === null) {
      if (segment.length) points.push(segment);
      segment = [];
    } else {
      segment.push(`${(index * cellWidth + cellWidth / 2).toFixed(1)},${pointY.toFixed(1)}`);
    }
    return `<g><title>${escapeHTML(date)}: ${summary.completed} completed, ${summary.missed} missed${summary.percent === null ? ", no record" : `, ${summary.percent}%`}</title>${summary.completed ? `<rect class="habit-chart-completed" x="${x.toFixed(1)}" y="${(baseY - completedHeight).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${completedHeight.toFixed(1)}" rx="2"/>` : ""}${summary.missed ? `<rect class="habit-chart-missed" x="${x.toFixed(1)}" y="${(baseY - completedHeight - missedHeight).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${missedHeight.toFixed(1)}" rx="2"/>` : ""}</g>`;
  });
  if (segment.length) points.push(segment);
  const labels = dates.length <= 7
    ? dates.map((date, index) => `<text x="${(index * cellWidth + cellWidth / 2).toFixed(1)}" y="${height - 7}" text-anchor="middle">${escapeHTML(date.slice(5))}</text>`).join("")
    : [0, Math.floor((dates.length - 1) / 2), dates.length - 1].map(index => `<text x="${(index * cellWidth + cellWidth / 2).toFixed(1)}" y="${height - 7}" text-anchor="${index === 0 ? "start" : index === dates.length - 1 ? "end" : "middle"}">${escapeHTML(dates[index].slice(5))}</text>`).join("");
  return `<svg class="habit-trend-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Daily completed and missed habits with completion percentage">${[0, 50, 100].map(value => `<line class="habit-chart-grid" x1="0" x2="${width}" y1="${top + chartHeight * (1 - value / 100)}" y2="${top + chartHeight * (1 - value / 100)}"/><text x="0" y="${top + chartHeight * (1 - value / 100) - 3}">${value}%</text>`).join("")}${bars.join("")}${points.map(linePoints => `<polyline class="habit-chart-line" points="${linePoints.join(" ")}"/>`).join("")}${labels}</svg>`;
}
function habitHeatmap() {
  const dates = habitDatesEndingToday(91);
  const start = new Date(`${dates[0]}T12:00:00`);
  const offset = (start.getDay() + 6) % 7;
  const cells = Array.from({ length: offset }, () => `<span class="habit-heat-empty" aria-hidden="true"></span>`);
  for (const date of dates) {
    const summary = habitDateSummary(date);
    const status = !summary.tracked ? "none" : summary.missed ? "missed" : "completed";
    const selected = (state.ui.selectedHabitDate || localDate()) === date;
    cells.push(`<button type="button" class="habit-heat-cell ${status}${selected ? " selected" : ""}" data-action="habit-select-date" data-date="${date}" title="${date}: ${summary.completed} completed, ${summary.missed} missed" aria-label="${date}: ${summary.completed} completed, ${summary.missed} missed${selected ? ", selected" : ""}"></button>`);
  }
  const weeks = [];
  for (let index = 0; index < cells.length; index += 7) weeks.push(`<div class="habit-heat-week">${cells.slice(index, index + 7).join("")}</div>`);
  return `<div class="habit-heatmap-wrap"><div class="habit-heat-weekdays"><span>Mon</span><span>Wed</span><span>Fri</span></div><div class="habit-heatmap">${weeks.join("")}</div></div><div class="habit-heat-legend"><span><i class="none"></i>No record</span><span><i class="completed"></i>Completed</span><span><i class="missed"></i>Missed</span></div>`;
}
function selectedHabitAnalysis() {
  const habit = state.habits.find(item => item.id === selectedHabitId);
  if (!habit) return "";
  const analytics = habitAnalytics(habit.id);
  const dates = habitDatesEndingToday(habitPeriod);
  const focus = habit.category === "focus";
  return `<section class="card section-card span-12 habit-analysis">
    ${cardTitle(escapeHTML(habit.name), `${focus ? "FOCUS & DISTRACTION CONTROL" : "INDIVIDUAL HABIT ANALYSIS"}`, `<button type="button" class="button-quiet" data-action="habit-clear-selection">Close</button>`)}
    <div class="habit-stat-grid"><div><strong>${analytics.tracked}</strong><span>Days tracked</span></div><div><strong>${analytics.completed}</strong><span>${focus ? "Days controlled" : "Successful days"}</span></div><div><strong>${analytics.missed}</strong><span>${focus ? "Days not controlled" : "Missed days"}</span></div><div><strong>${analytics.percent}%</strong><span>Consistency</span></div><div><strong>${analytics.current}</strong><span>Current streak</span></div><div><strong>${analytics.longest}</strong><span>Longest streak</span></div></div>
    <div class="habit-chart-wrap">${habitTrendGraph(dates)}</div>
  </section>`;
}
function habitsPage() {
  const today = localDate();
  const selectedDate = state.ui.selectedHabitDate || today;
  const summary = habitDateSummary(selectedDate);
  const analytics = habitAnalytics();
  const graphDates = habitDatesEndingToday(habitPeriod);
  const dailyHabits = state.habits.filter(habit => habit.category !== "focus");
  const focusHabits = state.habits.filter(habit => habit.category === "focus");
  const renderHabit = habit => {
    const record = habitRecord(today, habit.id);
    const completed = record?.status === "completed";
    const missed = record?.status === "missed";
    const personal = habitAnalytics(habit.id);
    return `<div class="habit-row ${habit.category === "focus" ? "focus-habit" : ""} ${completed ? "is-complete" : ""} ${missed ? "is-missed" : ""}">
      <button type="button" class="habit-check ${completed ? "checked" : ""}" data-action="habit-status" data-id="${escapeHTML(habit.id)}" data-status="${completed ? "clear" : "completed"}" aria-pressed="${completed}" aria-label="${completed ? "Mark incomplete" : "Mark complete"}: ${escapeHTML(habit.name)}">${completed ? "✓" : ""}</button>
      <button type="button" class="habit-name" data-action="habit-select" data-id="${escapeHTML(habit.id)}"><strong>${escapeHTML(habit.name)}</strong><small>${habit.frequency === "weekly" ? `${weekDates().map(date => habitRecord(localDate(date), habit.id)?.status === "completed" ? 1 : 0).reduce((a, b) => a + b, 0)} of ${habit.weeklyTarget} successful this week` : `${personal.current} day current streak`}</small></button>
      <span class="habit-frequency">${habit.frequency === "weekly" ? `${habit.weeklyTarget}× / week` : "Daily"}</span>
      <button type="button" class="habit-miss ${missed ? "selected" : ""}" data-action="habit-status" data-id="${escapeHTML(habit.id)}" data-status="${missed ? "clear" : "missed"}" aria-pressed="${missed}">${missed ? "Missed" : "Mark missed"}</button>
      ${habit.category === "focus" ? `<span class="habit-focus-badge">Focus</span>` : ""}
      <span class="habit-controls"><button type="button" class="button-quiet" data-action="habit-edit" data-id="${escapeHTML(habit.id)}" aria-label="Edit ${escapeHTML(habit.name)}">Edit</button><button type="button" class="button-quiet" data-action="habit-delete" data-id="${escapeHTML(habit.id)}" aria-label="Delete ${escapeHTML(habit.name)}">×</button></span>
    </div>`;
  };
  const selectedSummary = habitDateSummary(selectedDate);
  const selectedRecords = Object.entries(state.habitRecords[selectedDate] || {}).map(([id, record]) => {
    const habit = state.habits.find(item => item.id === id);
    return `<div class="list-row"><span class="row-main"><strong>${escapeHTML(habit?.name || record.habitName || "Removed habit")}</strong><small>${record.status === "completed" ? "Completed" : "Missed"}</small></span><span class="status-pill ${record.status === "completed" ? "good" : "habit-missed-pill"}">${record.status === "completed" ? "DONE" : "MISSED"}</span></div>`;
  }).join("");
  return `${pageHeader("Build consistency, your way.", "Track what matters to you. Your check-ins are manual, private, and saved separately from tasks.")}
    <div class="grid section-grid habit-page">
      <section class="card section-card span-12">${cardTitle("Today's habits", `${today} · ${habitDateSummary(today).completed} COMPLETED · ${habitDateSummary(today).missed} MISSED`)}
        <form id="habit-form" class="habit-create-form"><label class="field"><span>NEW HABIT</span><input class="input" name="name" maxlength="100" required placeholder="Add a habit you want to build"></label><label class="field"><span>CATEGORY</span><select class="select" name="category"><option value="daily">Daily habits</option><option value="focus">Focus & distraction control</option></select></label><label class="field"><span>FREQUENCY</span><select class="select" name="frequency"><option value="daily">Daily</option><option value="weekly">Weekly target</option></select></label><label class="field weekly-target-field"><span>DAYS / WEEK</span><input class="input" name="weeklyTarget" type="number" min="1" max="7" value="3"></label><button class="button" type="submit">＋ Add habit</button></form>
        <div class="habit-list">${dailyHabits.map(renderHabit).join("") || `<div class="empty-state">Add a habit to begin your daily checklist.</div>`}</div>
      </section>
      <section class="card section-card span-12 focus-habit-section">${cardTitle("Focus & distraction control", "MANUAL CHECK-INS · NO AUTOMATIC PHONE USAGE DATA")}
        <p class="muted">Record whether you stayed in control today. StudyFlow does not read your screen time or phone activity.</p>
        <div class="habit-list">${focusHabits.map(renderHabit).join("") || `<div class="empty-state">Add a focus habit above and choose this category.</div>`}</div>
      </section>
      <section class="card section-card span-12">${cardTitle("Consistency overview", `${analytics.percent}% OVER ${analytics.tracked} RECORDED CHECK-INS`)}
        <div class="habit-overview-grid"><div class="habit-score"><strong>${analytics.percent}%</strong><span>Overall consistency</span></div><div><strong>${analytics.completed}</strong><span>Habits completed</span></div><div><strong>${analytics.missed}</strong><span>Habits missed</span></div><div><strong>${analytics.current}</strong><span>Current no-miss streak</span></div><div><strong>${analytics.longest}</strong><span>Best no-miss streak</span></div></div>
      </section>
      <section class="card section-card span-12">${cardTitle("Daily consistency", "COMPLETED AND MISSED CHECK-INS")}
        <div class="tab-row habit-period-tabs">${[7, 30, 90].map(days => `<button type="button" class="tab-button ${habitPeriod === days ? "active" : ""}" data-action="habit-period" data-days="${days}">${days} DAYS</button>`).join("")}</div>
        <div class="habit-chart-legend"><span><i class="completed"></i>Completed</span><span><i class="missed"></i>Missed</span><span><i class="line"></i>Daily consistency</span></div>
        <div class="habit-chart-wrap">${habitTrendGraph(graphDates)}</div>
      </section>
      <section class="card section-card span-12">${cardTitle("Habit activity", "LAST 13 WEEKS · SELECT A DATE FOR DETAILS")}
        ${habitHeatmap()}
        <div class="habit-selected-date"><div><strong>${escapeHTML(selectedDate)}</strong><small>${selectedSummary.tracked ? `${selectedSummary.completed} completed · ${selectedSummary.missed} missed · ${selectedSummary.percent}% consistency` : "No habit check-ins recorded"}</small></div></div>
        <div class="list-stack">${selectedRecords || `<div class="empty-state">No check-ins recorded for this date.</div>`}</div>
      </section>
      ${selectedHabitAnalysis()}
    </div>`;
}
function progressPage() {
  const dayCount = progressPeriod === "day" ? 1 : progressPeriod === "week" ? 7 : 30;
  const dates = Array.from({ length: dayCount }, (_, i) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (dayCount - i - 1));
    return date;
  });
  const study = dates.map(date => (logFor(date).studySeconds || 0) / 3600);
  const maxStudy = Math.max(1, ...study);
  const stats = studyStats();
  const periodStart = localDate(dates[0]);
  const periodEnd = localDate(dates[dates.length - 1]);
  const completedDate = item => String(item.completedAt || "").slice(0, 10);
  const periodTasks = state.tasks.filter(item =>
    (item.dueDate >= periodStart && item.dueDate <= periodEnd) ||
    (completedDate(item) >= periodStart && completedDate(item) <= periodEnd)
  );
  const taskTotal = periodTasks.length;
  const taskDone = periodTasks.filter(item => item.completed &&
    (completedDate(item) ? completedDate(item) >= periodStart && completedDate(item) <= periodEnd : item.dueDate >= periodStart && item.dueDate <= periodEnd)
  ).length;
  const focusSessions = dates.reduce((sum, date) => sum + (logFor(date).studySessions?.length || 0), 0);
  const waterMean = dates.reduce((sum, date) => sum + (logFor(date).waterMl || 0), 0) / (dates.length || 1);
  const gymDays = dates.filter(date => logFor(date).gym?.completed).length;
  const skinDone = dates.reduce((sum, date) => sum + (logFor(date).skincareDone?.morning?.length || 0) + (logFor(date).skincareDone?.night?.length || 0), 0);
  const skinTotal = dates.reduce((sum, date) => sum + state.skincare.morning.length + state.skincare.night.length, 0);
  const focusMinutes = study.reduce((sum, hours) => sum + hours * 60, 0);
  const focusTargetMinutes = (Number(state.settings.focusTargetMinutes) || 120) * dates.length;
  const rangeLabel = progressPeriod === "day" ? "TODAY" : progressPeriod === "week" ? "LAST 7 DAYS" : "LAST 30 DAYS";
  const barLabels = progressPeriod === "week"
    ? dates.map(date => SHORT_DAYS[date.getDay()])
    : dates.map((date, index) => progressPeriod === "day" || index % 5 === 0 || index === dates.length - 1 ? `${date.getDate()}` : "");
  const metrics = [
    ["Task completion", taskTotal ? Math.round(Math.min(100, taskDone / taskTotal * 100)) : 0, `${taskDone}/${taskTotal} due or completed`],
    ["Focus goal", Math.round(Math.min(100, focusMinutes / focusTargetMinutes * 100)), `${focusSessions} sessions · ${Math.round(focusMinutes)}m`],
    ["Water target", Math.round(Math.min(100, waterMean / (Number(state.settings.waterTargetMl) || 2250) * 100)), `${Math.round(waterMean)} ml avg`],
    ["Gym consistency", Math.round(gymDays / dates.length * 100), `${gymDays} days`],
    ["Skincare", Math.round(skinDone / (skinTotal || 1) * 100), `${skinDone} steps`]
  ];
  return `${pageHeader("Progress you can feel.", "Study progress comes first. See your learning trend alongside the healthy habits that support it.", `<div class="tab-row"><button type="button" class="tab-button ${progressPeriod === "day" ? "active" : ""}" data-action="progress-period" data-period="day">DAY</button><button type="button" class="tab-button ${progressPeriod === "week" ? "active" : ""}" data-action="progress-period" data-period="week">WEEK</button><button type="button" class="tab-button ${progressPeriod === "month" ? "active" : ""}" data-action="progress-period" data-period="month">MONTH</button></div>`)}
    <div class="grid section-grid">
      <section class="card section-card span-12" style="border-color:rgba(146,243,245,.18);background:linear-gradient(145deg,rgba(146,243,245,.055),rgba(255,255,255,.012))">${cardTitle("Study hours", `${rangeLabel} · YOUR MOST IMPORTANT METRIC`, `<span class="status-pill cyan">${study.reduce((a, b) => a + b, 0).toFixed(1)} HOURS</span>`)}
        <div class="report-bars" style="height:${progressPeriod === "month" ? 205 : 170}px">${study.map((hours, i) => `<div class="report-column" title="${hours.toFixed(1)} study hours"><div class="report-bar" style="height:${Math.max(hours ? 4 : 2, hours / maxStudy * 100)}%;opacity:${i === study.length - 1 ? 1 : .68}"></div><small>${escapeHTML(barLabels[i])}</small></div>`).join("")}</div>
        <div class="chart-caption">Focused study recorded ${progressPeriod === "day" ? "today" : progressPeriod === "week" ? "in the last 7 days" : "in the last 30 days"}. Log sessions with the Study timer to keep this report accurate.</div>
      </section>
      <section class="card section-card span-7">${cardTitle("Subject-wise syllabus", "COMPLETED CHAPTERS")}
        <div class="metric-list">${state.subjects.map(subject => { const complete = subject.chapters.filter(ch => ch.status === "Completed").length; const p = subject.chapters.length ? Math.round(complete / subject.chapters.length * 100) : 0; return `<div class="metric-row"><span>${escapeHTML(subject.name)}</span><div class="progress-track"><div class="progress-fill" style="width:${p}%"></div></div><strong>${p}%</strong></div>`; }).join("")}</div>
        <div class="subtle-line"></div><div class="list-row"><span class="mini-icon">✳</span><div class="row-main"><strong>Overall syllabus complete</strong><small>${stats.completed} chapters completed out of ${stats.total}</small></div><span class="status-pill cyan">${stats.percent}%</span></div>
      </section>
      <section class="card section-card span-5">${cardTitle("Habits that support you", rangeLabel)}<div class="metric-list">${metrics.map(([name, value, meta]) => `<div><div class="metric-row"><span>${escapeHTML(name)}</span><div class="progress-track"><div class="progress-fill" style="width:${value}%"></div></div><strong>${escapeHTML(meta)}</strong></div></div>`).join("")}</div></section>
      <section class="card section-card span-6">${cardTitle("Weekly / monthly snapshot", rangeLabel)}
        <div class="list-stack"><div class="list-row"><span class="mini-icon">◈</span><div class="row-main"><strong>Focused study</strong><small>Study time in this view</small></div><span class="status-pill cyan">${study.reduce((a, b) => a + b, 0).toFixed(1)}h</span></div><div class="list-row"><span class="mini-icon">↗</span><div class="row-main"><strong>Average study per day</strong><small>Across the selected time period</small></div><span class="status-pill">${(study.reduce((a, b) => a + b, 0) / study.length).toFixed(1)}h</span></div><div class="list-row"><span class="mini-icon">⌁</span><div class="row-main"><strong>Workout sessions</strong><small>Completed training days</small></div><span class="status-pill">${gymDays}</span></div></div>
      </section>
    </div>`;
}
function settingsPage() {
  const subjectList = state.subjects.map(subject => `<div class="list-row"><span class="mini-icon">✳</span><div class="row-main"><strong>${escapeHTML(subject.name)}</strong><small>${subject.chapters.length} chapters</small></div><button class="button-quiet" data-action="rename-subject" data-id="${escapeHTML(subject.id)}" type="button">Rename</button><button class="button-quiet" data-action="delete-subject" data-id="${escapeHTML(subject.id)}" type="button" aria-label="Delete subject">×</button></div>`).join("");
  const notificationPreferences = state.notificationPreferences || DEFAULT_NOTIFICATION_PREFERENCES;
  const categories = [
    ["tasks", "Task due-time reminders"], ["timetable", "Timetable activity reminders"], ["study", "Study session reminders"],
    ["water", "Water breaks"], ["gym", "Gym workout reminders"], ["skincare", "Morning and night skincare"]
  ];
  const permissionLabel = nativeNotificationStatus.native
    ? `Android notification permission: ${nativeNotificationStatus.permission || "checking"} · ${nativeNotificationStatus.scheduled ?? 0} scheduled`
    : "Browser notifications require StudyFlow to remain open. The installed Android app uses OS-scheduled local reminders.";
  const exactAlarmNotice = nativeNotificationStatus.native && nativeNotificationStatus.exactAlarmPermission === "denied"
    ? `<div class="notice" style="margin-top:10px;border-color:rgba(239,155,155,.22);background:rgba(239,155,155,.04)"><strong>Allow Alarms & reminders</strong> for StudyFlow in Android settings. Exact alarm permission is currently off, so scheduled reminders and focus alerts will not fire until you enable it.<div class="button-row" style="margin-top:10px"><button class="button-secondary" type="button" data-action="open-exact-alarm-settings">Open Android settings</button></div></div>`
    : "";
  const updateRelease = updateState.result?.available ? updateState.result : null;
  const updateActions = updateRelease && !isAndroidApp()
    ? `<a class="button-secondary" href="${escapeHTML(updateRelease.pageUrl)}" target="_blank" rel="noopener noreferrer">View GitHub release</a>`
    : updateRelease
      ? `<button class="button" type="button" data-action="download-app-update" ${updateState.downloading ? "disabled" : ""}>${updateState.downloading ? "Downloading…" : "Update now"}</button>`
      : "";
  const updateDetails = updateRelease
    ? `<div class="update-release-details"><strong>${escapeHTML(updateRelease.name)} · v${escapeHTML(updateRelease.version)}</strong><p>${escapeHTML(updateRelease.notes)}</p></div>`
    : "";
  return `${pageHeader("Make it yours.", "Tune your planner, manage reminders, and keep a portable backup of your progress.")}
    <div class="grid section-grid">
      <section class="card section-card span-6">${cardTitle("Study & exam settings", "YOUR PERSONAL STUDY PLAN")}
        <form id="settings-form"><div class="form-grid"><div class="field"><label>DAILY STUDY TARGET (HOURS)</label><input class="input" name="studyTargetHours" type="number" min="0.5" max="24" step="0.5" value="${Number(state.settings.studyTargetHours) || 6}" required></div><div class="field"><label>EXAM DATE (OPTIONAL)</label><input class="input" name="examDate" type="date" value="${escapeHTML(state.settings.examDate || "")}"></div><div class="field"><label>WATER TARGET (MILLILITRES)</label><input class="input" name="waterTargetMl" type="number" min="250" max="10000" step="50" value="${Number(state.settings.waterTargetMl) || 2250}" required></div></div><div class="form-actions"><button class="button" type="submit">Save planner settings</button></div></form>
      </section>
      <section class="card section-card span-6">${cardTitle("Appearance", "CHOOSE HOW STUDYFLOW FEELS")}
        <div class="list-row"><div class="row-main"><strong>Theme</strong><small>Choose dark or light appearance</small></div><select class="select" id="theme-select" style="width:auto"><option value="dark" ${state.settings.theme === "dark" ? "selected" : ""}>Dark</option><option value="light" ${state.settings.theme === "light" ? "selected" : ""}>Light</option></select></div>
      </section>
      <section class="card section-card span-12 app-update-settings">${cardTitle("App updates", "SIGNED ANDROID RELEASES FROM GITHUB")}
        <div class="app-update-settings-row"><div class="row-main"><strong>StudyFlow ${escapeHTML(updateState.appInfo?.versionName || "1.0")}</strong><small id="update-status">${escapeHTML(updateStatusMessage())}</small></div><button class="button-secondary" id="check-app-update" type="button" data-action="check-app-update" ${updateState.checking || updateState.downloading ? "disabled" : ""}>${updateState.checking ? "Checking…" : "Check for updates"}</button>${updateActions}</div>
        ${updateDetails}
        <div class="update-progress ${updateState.downloading ? "visible" : ""}" id="update-progress" ${updateState.downloading ? "" : "hidden"}><div class="update-progress-track"><span id="update-progress-fill"></span></div><small id="update-progress-label">${escapeHTML(updateProgressLabel())}</small></div>
        <div class="data-info">Updates are installed by Android and preserve StudyFlow data. Android accepts an update only when its package ID and signing key match this installation.</div>
      </section>
      <section class="card section-card span-12">${cardTitle("Manage navigation", "SHOW OR HIDE QUICK ACCESS TABS")}
        <div class="note-grid">${NAV_ITEMS.map(([id, label, icon]) => {
          const locked = id === "dashboard" || id === "settings";
          const checked = getNavigationConfig().visible[id] !== false;
          return `<label class="check-row nav-toggle ${locked ? "locked" : ""}"><input type="checkbox" data-nav-toggle="${id}" ${checked ? "checked" : ""} ${locked ? "disabled" : ""}><span class="nav-icon" aria-hidden="true">${icon}</span><span class="row-main"><strong>${label}</strong><small>${locked ? "Always visible in the app" : "Add or remove from the dock"}</small></span></label>`;
        }).join("")}</div>
        <div class="button-row" style="margin-top:14px"><button class="button-secondary" type="button" data-action="manage-nav-default">Restore defaults</button></div>
      </section>
      <section class="card section-card span-12">${cardTitle("Notification settings", "CHOOSE THE REMINDERS THAT SUPPORT YOUR DAY")}
        <label class="check-row"><input type="checkbox" id="notification-toggle" ${state.settings.notifications ? "checked" : ""}><span class="row-main"><strong>Enable StudyFlow notifications</strong><small>Notifications are opt-in. Android may ask permission the first time you enable them.</small></span></label>
        <div class="data-info" id="native-notification-status">${escapeHTML(permissionLabel)}</div>
        ${exactAlarmNotice}
        <div class="subtle-line"></div>
        <div class="grid section-grid">${categories.map(([key, label]) => `<label class="check-row span-4"><input type="checkbox" data-notification-category="${key}" ${notificationPreferences.categories[key] ? "checked" : ""}><span class="row-main"><strong>${label}</strong></span></label>`).join("")}</div>
        <form id="notification-settings-form" style="margin-top:14px"><div class="form-grid">
          <div class="field"><label>WATER REMINDER EVERY</label><select class="select" name="waterIntervalMinutes">${[60, 90, 120, 180, 240].map(minutes => `<option value="${minutes}" ${Number(notificationPreferences.waterIntervalMinutes) === minutes ? "selected" : ""}>${minutes < 60 ? `${minutes} minutes` : `${minutes / 60} hour${minutes > 60 ? "s" : ""}`}</option>`).join("")}</select></div>
          <div class="field"><label>WATER REMINDER WINDOW</label><div class="button-row"><input class="input" aria-label="Water reminder start" name="waterStart" type="time" value="${escapeHTML(notificationPreferences.waterStart)}"><input class="input" aria-label="Water reminder end" name="waterEnd" type="time" value="${escapeHTML(notificationPreferences.waterEnd)}"></div></div>
          <div class="field"><label>MORNING SKINCARE REMINDER</label><input class="input" name="skincareMorningTime" type="time" value="${escapeHTML(notificationPreferences.skincareMorningTime)}"></div>
          <div class="field"><label>NIGHT SKINCARE REMINDER</label><input class="input" name="skincareNightTime" type="time" value="${escapeHTML(notificationPreferences.skincareNightTime)}"></div>
          <div class="field"><label>GYM REMINDER TIME</label><input class="input" name="gymTime" type="time" value="${escapeHTML(notificationPreferences.gymTime)}"></div>
        </div><div class="form-actions"><button class="button-secondary" type="submit">Save reminder preferences</button></div></form>
        <div class="notice" style="margin-top:12px">Only notification access is requested. Android may still delay reminders during battery saving or Doze, and users can silence channels or force-stop the app.</div>
      </section>
      <section class="card section-card span-6">${cardTitle("Manage subjects", "CHAPTERS ARE MANAGED IN STUDY")}
        <div class="list-stack">${subjectList || `<div class="empty-state">No subjects yet. Add one in the Study tab.</div>`}</div>
        <div class="subtle-line"></div><div class="notice">Add and update chapters, chapter status and revision dates in the <strong>Study</strong> tab. Removing a subject also removes its mock test and question-paper tracker entries.</div>
      </section>
      <section class="card section-card span-6">${cardTitle("Data & backup", "YOUR DATA STAYS ON THIS DEVICE")}
        <div class="notice">StudyFlow saves your planner in IndexedDB on this device. The APK has its own private WebView database; use a JSON backup to move existing browser data into the Android app or keep a separate copy.</div>
        <div class="button-row" style="margin-top:14px"><button class="button" type="button" data-action="export-data">↓ Export backup</button><button class="button-secondary" type="button" data-action="import-data">↑ Restore backup</button></div>
        <div class="data-info">Last saved: ${escapeHTML(state.updatedAt ? formatDate(new Date(state.updatedAt), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "This session")} · Backup files contain your StudyFlow planner data. Keep them somewhere private.</div>
      </section>
      <section class="card section-card span-12">${cardTitle("Privacy & permissions", "YOU CONTROL DEVICE ACCESS")}
        <div class="notice">Planner data stays in this app's local IndexedDB unless you export a backup. StudyFlow does not request app-usage, health, sensor, accessibility, or VPN access. Notifications are the only user-facing device permission.</div>
        <div class="data-info">StudyFlow ${escapeHTML(isAndroidNative() ? "Android app" : "web app")} · version ${escapeHTML(updateState.appInfo?.versionName || "1.0")} · Android minSdk 24</div>
      </section>
      <section class="card section-card span-12">${cardTitle("Your weekly gym routine", "EDIT A DAY'S WORKOUT")}
        <div class="form-grid">${DAYS.map(day => `<div class="field"><label>${day.toUpperCase()}</label><select class="select" data-action="gym-routine" data-day="${day}">${["Chest + Triceps", "Back + Biceps", "Legs + Shoulders", "Rest"].map(split => `<option ${state.gymRoutine[day] === split ? "selected" : ""}>${split}</option>`).join("")}</select></div>`).join("")}</div>
      </section>
      <section class="card section-card span-12">${cardTitle("Your timetable", "JUMP TO EDIT WEEKDAY SCHEDULES")}<div class="button-row">${DAYS.map((day, index) => `<button type="button" class="button-secondary" data-action="open-schedule-day" data-day="${index}">${day}</button>`).join("")}</div></section>
    </div>`;
}
function renderPage() {
  clearPageTransition();
  renderNavigation();
  const renderers = { dashboard: renderDashboard, timetable: timetablePage, study: studyPage, focus: focusPage, wellness: wellnessOverviewPage, water: waterPage, gym: gymPage, skincare: skincarePage, tasks: tasksPage, habits: habitsPage, progress: progressPage, settings: settingsPage };
  const page = $("#page");
  page.classList.remove("page-enter");
  page.innerHTML = (renderers[activePage] || renderDashboard)();
  void page.offsetWidth;
  page.classList.add("page-enter");
  renderUpdateBanner();
  refreshUpdateSurfaces();
}
function applyTheme() {
  document.body.classList.toggle("light", state.settings.theme === "light");
}
function refresh() {
  applyTheme();
  renderPage();
}
function navigate(page) {
  const resolvedPage = resolveNavigationPage(page);
  if (!resolvedPage) return;
  if (resolvedPage === activePage && !pageTransitioning) return;

  const previousPage = activePage;
  activePage = resolvedPage;

  if (!pageTransitioning) {
    pageScrollPositions[previousPage] = window.scrollY;
    pageTransitioning = true;
    const content = $("#page");
    content.classList.remove("page-enter");
    void content.offsetWidth;
    content.classList.add("page-exit");
    const finishTransition = event => {
      if (event && (event.target !== content || event.animationName !== "page-exit")) return;
      clearPageTransition();
      renderPage();
      const root = document.documentElement;
      root.style.scrollBehavior = "auto";
      window.scrollTo(0, pageScrollPositions[resolvedPage] || 0);
      requestAnimationFrame(() => {
        root.style.removeProperty("scroll-behavior");
        const mobileNavigation = $("#mobile-nav");
        const activeMobileButton = mobileNavigation?.querySelector(`.nav-item[data-page="${PAGE_GROUPS[resolvedPage] || resolvedPage}"]`);
        if (activeMobileButton && getComputedStyle(mobileNavigation).display !== "none") {
          activeMobileButton.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        }
      });
    };
    pageExitHandler = finishTransition;
    content.addEventListener("animationend", finishTransition);
    pageTransitionTimeout = setTimeout(finishTransition, 140);
  }
}
function openModal(title, fields, submitLabel, initial = {}, onSubmit = () => {}) {
  document.querySelector(".modal-backdrop")?.remove();
  const backdrop = document.createElement("div");
  backdrop.className = "focus-overlay modal-backdrop";
  backdrop.innerHTML = `<form class="card section-card modal-card" style="width:min(460px,100%);box-shadow:0 25px 90px rgba(0,0,0,.4)"><div class="card-title"><h2>${escapeHTML(title)}</h2><button class="button-quiet" type="button" data-modal-close>Close</button></div><div class="form-grid">${fields.map(field => {
    const value = initial[field.name] ?? field.value ?? "";
    if (field.type === "select") return `<div class="field ${field.full ? "full" : ""}"><label>${escapeHTML(field.label)}</label><select class="select" name="${escapeHTML(field.name)}" ${field.required ? "required" : ""}>${field.options.map(option => `<option value="${escapeHTML(option.value ?? option)}" ${(option.value ?? option) === value ? "selected" : ""}>${escapeHTML(option.label ?? option)}</option>`).join("")}</select></div>`;
    return `<div class="field ${field.full ? "full" : ""}"><label>${escapeHTML(field.label)}</label><input class="input" type="${escapeHTML(field.type || "text")}" name="${escapeHTML(field.name)}" value="${escapeHTML(value)}" ${field.required ? "required" : ""} ${field.maxlength ? `maxlength="${field.maxlength}"` : ""}></div>`;
  }).join("")}</div><div class="form-actions"><button class="button" type="submit">${escapeHTML(submitLabel)}</button><button class="button-secondary" type="button" data-modal-close>Cancel</button></div></form>`;
  document.body.append(backdrop);
  backdrop.addEventListener("click", event => { if (event.target === backdrop || event.target.closest("[data-modal-close]")) backdrop.remove(); });
  $("form", backdrop).addEventListener("submit", event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    onSubmit(values);
    backdrop.remove();
  });
  $("input, select", backdrop)?.focus();
}
function confirmDelete(message) {
  return window.confirm(message);
}
function registerStudySession() {
  if (timer.mode !== "focus" && timer.mode !== "stopwatch") return;
  if (timer.sessionElapsed <= 0 || !timer.sessionStartedAt) return;
  const subject = getSubject(timer.subjectId);
  const sessionStart = new Date(timer.sessionStartedAt);
  const legacySeconds = Math.min(timer.sessionElapsed, Math.max(0, timer.legacyCreditedSeconds));
  const appendRecord = (start, seconds, aggregateOnStartDate = false) => {
    if (seconds <= 0) return;
    const end = new Date(start.getTime() + seconds * 1000);
    const date = localDate(start);
    dayLog(date).studySessions.push({
      id: uid("study-timer"),
      subjectId: subject?.id || "",
      subjectName: subject?.name || "Independent study",
      studyType: timer.studyType || "Study",
      trackingMethod: "timer",
      seconds,
      date,
      startedAt: start.toISOString(),
      endedAt: end.toISOString(),
      completed: timer.sessionCompleted === true && !aggregateOnStartDate,
      ...(aggregateOnStartDate ? { aggregateOnStartDate: true } : {})
    });
  };
  if (legacySeconds) appendRecord(sessionStart, legacySeconds, true);
  appendRecord(new Date(sessionStart.getTime() + legacySeconds * 1000), timer.sessionElapsed - legacySeconds);
}
function stopTimerInterval() {
  clearInterval(timer.interval);
  timer.interval = null;
}
function persistActiveStudySession() {
  state.activeStudySession = timer.running ? {
    mode: timer.mode,
    subjectId: timer.subjectId,
    subjectName: getSubject(timer.subjectId)?.name || "Independent study",
    startedAt: timer.sessionStartedAt,
    deadlineAt: timer.deadlineAt,
    sessionDate: timer.sessionDate,
    durationSeconds: timer.sessionDuration,
    creditedSeconds: timer.sessionElapsed,
    accumulatedSeconds: timer.accumulatedSeconds,
    studyType: timer.studyType,
    ledgerVersion: 2,
    legacyCreditedSeconds: timer.legacyCreditedSeconds
  } : null;
}
function completeStudyTimer() {
  if (!timer.running) return;
  const completedMode = timer.mode;
  if (completedMode !== "stopwatch") {
    timer.sessionElapsed = Math.min(timer.sessionDuration, Math.max(timer.sessionElapsed, Math.floor((Date.now() - new Date(timer.sessionStartedAt).getTime()) / 1000)));
  }
  timer.sessionCompleted = completedMode === "focus";
  timer.running = false;
  stopTimerInterval();
  state.activeStudySession = null;
  registerStudySession();
  state.pausedFocusTimer = null;
  timer.sessionStartedAt = null;
  timer.sessionDate = "";
  timer.deadlineAt = "";
  timer.sessionDuration = 0;
  timer.sessionElapsed = 0;
  timer.legacyCreditedSeconds = 0;
  timer.accumulatedSeconds = 0;
  timer.sessionCompleted = false;
  if (completedMode === "focus" && state.settings.pomodoroEnabled) {
    timer.mode = "break";
    timer.duration = clamp(Number(state.settings.breakDurationMinutes) || 5, 1, 60) * 60;
    timer.remaining = timer.duration;
    timer.sessionDate = localDate();
    timer.sessionStartedAt = new Date().toISOString();
    timer.deadlineAt = new Date(Date.now() + timer.duration * 1000).toISOString();
    timer.sessionDuration = timer.duration;
    timer.sessionElapsed = 0;
    timer.running = true;
    persistActiveStudySession();
    saveState();
    startTimerInterval();
    showToast("Focus complete. Your break timer has started.");
    renderPage();
    return;
  }
  timer.mode = "focus";
  timer.duration = clamp(Number(state.settings.focusDurationMinutes) || 25, 1, 180) * 60;
  timer.remaining = timer.duration;
  saveState();
  showToast(completedMode === "break" ? "Break complete. Ready when you are." : "Focus session complete. Take a short break — you earned it.");
  if (!isAndroidNative() && state.settings.notifications && "Notification" in window && Notification.permission === "granted") {
    new Notification("StudyFlow", { body: completedMode === "break" ? "Break complete. Ready when you are." : "Focus session complete. Take a short break." });
  }
  renderPage();
}
function updateTimerFromClock() {
  if (!timer.running) return;
  const startedAt = new Date(timer.sessionStartedAt).getTime();
  const deadlineAt = timer.mode === "stopwatch" ? 0 : new Date(timer.deadlineAt).getTime();
  if (!Number.isFinite(startedAt) || (timer.mode !== "stopwatch" && !Number.isFinite(deadlineAt))) {
    timer.running = false;
    stopTimerInterval();
    state.activeStudySession = null;
    saveState();
    showToast("The saved focus session was invalid and has been cleared.");
    renderPage();
    return;
  }
  const previousElapsed = timer.sessionElapsed;
  const elapsed = timer.mode === "stopwatch"
    ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
    : Math.min(timer.sessionDuration, Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
  const newlyElapsed = Math.max(0, elapsed - timer.sessionElapsed);
  if (newlyElapsed) {
    if (timer.mode === "focus" || timer.mode === "stopwatch") {
      creditStudyRange(startedAt + timer.sessionElapsed * 1000, startedAt + elapsed * 1000);
    }
    timer.sessionElapsed = elapsed;
  }
  timer.remaining = timer.mode === "stopwatch" ? 0 : Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000));
  const display = $("#timer-time");
  const timerText = timer.mode === "stopwatch"
    ? formatStopwatch(timer.accumulatedSeconds + timer.sessionElapsed)
    : formatTimer(timer.remaining);
  if (display) display.textContent = timerText;
  const focusDisplay = $("#focus-timer-time");
  if (focusDisplay) focusDisplay.textContent = timerText;
  if (timer.mode !== "stopwatch" && (timer.remaining === 0 || elapsed >= timer.sessionDuration)) {
    completeStudyTimer();
    return;
  }
  if (Math.floor(timer.sessionElapsed / 15) > Math.floor(previousElapsed / 15)) {
    persistActiveStudySession();
    saveState();
  }
}
function startTimerInterval() {
  stopTimerInterval();
  timer.interval = setInterval(updateTimerFromClock, 1000);
}
function restoreActiveStudyTimer() {
  const session = state.activeStudySession;
  if (!session?.startedAt || (session.mode !== "stopwatch" && (!session.deadlineAt || !Number(session.durationSeconds)))) {
    const paused = state.pausedFocusTimer;
    timer.mode = ["break", "stopwatch"].includes(paused?.mode) ? paused.mode : "focus";
    timer.duration = clamp(Number(paused?.durationSeconds) || Number(timer.mode === "break" ? state.settings.breakDurationMinutes : state.settings.focusDurationMinutes) * 60 || 25 * 60, 60, (timer.mode === "break" ? 60 : 180) * 60);
    const pausedRemaining = Number(paused?.remainingSeconds);
    timer.remaining = paused && Number.isFinite(pausedRemaining)
      ? clamp(pausedRemaining, 0, timer.duration)
      : timer.duration;
    timer.subjectId = paused?.subjectId || "";
    timer.accumulatedSeconds = Math.max(0, Number(paused?.accumulatedSeconds) || 0);
    timer.studyType = STUDY_TYPES.includes(paused?.studyType) ? paused.studyType : "Study";
    if (timer.mode === "stopwatch") timer.duration = 0;
    if (paused) renderPage();
    return;
  }
  timer.running = true;
  timer.mode = ["break", "stopwatch"].includes(session.mode) ? session.mode : "focus";
  timer.subjectId = session.subjectId || "";
  timer.duration = timer.mode === "stopwatch" ? 0 : clamp(Number(session.durationSeconds), 1, (timer.mode === "break" ? 60 : 180) * 60);
  timer.sessionDuration = timer.mode === "stopwatch" ? 0 : clamp(Number(session.durationSeconds), 1, 180 * 60);
  timer.sessionElapsed = clamp(Number(session.creditedSeconds) || 0, 0, timer.sessionDuration);
  if (timer.mode === "stopwatch") timer.sessionElapsed = Math.max(0, Number(session.creditedSeconds) || 0);
  timer.accumulatedSeconds = Math.max(0, Number(session.accumulatedSeconds) || 0);
  timer.legacyCreditedSeconds = session.ledgerVersion === 2
    ? Math.max(0, Number(session.legacyCreditedSeconds) || 0)
    : timer.mode === "break" ? 0 : timer.sessionElapsed;
  timer.studyType = STUDY_TYPES.includes(session.studyType) ? session.studyType : "Study";
  timer.sessionStartedAt = session.startedAt;
  timer.sessionDate = session.sessionDate || localDate();
  timer.deadlineAt = session.deadlineAt;
  timer.remaining = timer.mode === "stopwatch" ? 0 : Math.max(0, Math.ceil((new Date(timer.deadlineAt).getTime() - Date.now()) / 1000));
  startTimerInterval();
  updateTimerFromClock();
}
function startTimer() {
  if (timer.running) return;
  const selectedMode = $("#timer-mode")?.value;
  const paused = state.pausedFocusTimer;
  if (["focus", "break", "stopwatch"].includes(selectedMode)) timer.mode = selectedMode;
  const selected = $("#timer-subject")?.value;
  const selectedStudyType = $("#timer-study-type")?.value;
  if (timer.mode === "focus" || timer.mode === "stopwatch") {
    if (selected === "independent") timer.subjectId = "";
    else if (selected) timer.subjectId = selected;
    if (!timer.subjectId && selected !== "independent" && state.subjects[0]) timer.subjectId = state.subjects[0].id;
  } else {
    timer.subjectId = "";
  }
  const resuming = paused?.mode === timer.mode;
  if (!resuming) {
    timer.accumulatedSeconds = 0;
    timer.studyType = STUDY_TYPES.includes(selectedStudyType) ? selectedStudyType : "Study";
  } else {
    timer.accumulatedSeconds = Math.max(0, Number(paused.accumulatedSeconds) || 0);
    timer.studyType = STUDY_TYPES.includes(paused.studyType) ? paused.studyType : "Study";
  }
  timer.legacyCreditedSeconds = 0;
  if (timer.mode === "stopwatch") {
    timer.duration = 0;
    timer.remaining = 0;
    timer.sessionDuration = 0;
  } else {
    if (!resuming) {
      timer.duration = clamp(Number(timer.mode === "break" ? state.settings.breakDurationMinutes : state.settings.focusDurationMinutes) || (timer.mode === "break" ? 5 : 25), 1, timer.mode === "break" ? 60 : 180) * 60;
      timer.remaining = timer.duration;
    } else if (timer.remaining <= 0) {
      timer.remaining = timer.duration;
    }
    timer.sessionDuration = timer.remaining;
  }
  timer.sessionDate = localDate();
  timer.sessionStartedAt = new Date().toISOString();
  timer.deadlineAt = timer.mode === "stopwatch" ? "" : new Date(Date.now() + timer.remaining * 1000).toISOString();
  timer.sessionElapsed = 0;
  timer.sessionCompleted = false;
  timer.running = true;
  state.pausedFocusTimer = null;
  persistActiveStudySession();
  saveState();
  startTimerInterval();
  renderPage();
}
function pauseTimer() {
  if (!timer.running) return;
  updateTimerFromClock();
  if (!timer.running) return;
  timer.running = false;
  stopTimerInterval();
  timer.sessionCompleted = false;
  registerStudySession();
  timer.accumulatedSeconds += timer.sessionElapsed;
  timer.legacyCreditedSeconds = 0;
  timer.sessionStartedAt = null;
  timer.sessionDate = "";
  timer.deadlineAt = "";
  timer.sessionDuration = 0;
  timer.sessionElapsed = 0;
  state.activeStudySession = null;
  state.pausedFocusTimer = timer.mode === "stopwatch" || timer.remaining > 0 ? {
    mode: timer.mode,
    subjectId: timer.subjectId,
    remainingSeconds: timer.remaining,
    durationSeconds: timer.duration,
    accumulatedSeconds: timer.accumulatedSeconds,
    studyType: timer.studyType
  } : null;
  saveState();
  renderPage();
  showToast("Focus session saved.");
}
function resetTimer() {
  if (timer.running) {
    updateTimerFromClock();
    if (!timer.running) return;
    timer.running = false;
    stopTimerInterval();
    timer.sessionCompleted = false;
    registerStudySession();
  }
  timer.remaining = timer.duration;
  timer.sessionStartedAt = null;
  timer.sessionDate = "";
  timer.deadlineAt = "";
  timer.sessionDuration = 0;
  timer.sessionElapsed = 0;
  timer.accumulatedSeconds = 0;
  timer.legacyCreditedSeconds = 0;
  timer.sessionCompleted = false;
  state.activeStudySession = null;
  state.pausedFocusTimer = null;
  timer.mode = "focus";
  timer.duration = clamp(Number(state.settings.focusDurationMinutes) || 25, 1, 180) * 60;
  timer.remaining = timer.duration;
  saveState();
  renderPage();
}
function stopTimer() {
  if (timer.running) {
    updateTimerFromClock();
    if (!timer.running) return;
    timer.running = false;
    stopTimerInterval();
    timer.sessionCompleted = false;
    registerStudySession();
  }
  timer.mode = "focus";
  timer.duration = clamp(Number(state.settings.focusDurationMinutes) || 25, 1, 180) * 60;
  timer.remaining = timer.duration;
  timer.sessionStartedAt = null;
  timer.sessionDate = "";
  timer.deadlineAt = "";
  timer.sessionDuration = 0;
  timer.sessionElapsed = 0;
  timer.accumulatedSeconds = 0;
  timer.legacyCreditedSeconds = 0;
  timer.sessionCompleted = false;
  state.activeStudySession = null;
  state.pausedFocusTimer = null;
  saveState();
  renderPage();
  showToast("Timer stopped and session saved.");
}
function toggleFocusMode() {
  if (document.querySelector(".focus-overlay:not(.modal-backdrop)")) {
    document.querySelector(".focus-overlay:not(.modal-backdrop)").remove();
    return;
  }
  const overlay = document.createElement("div");
  overlay.className = "focus-overlay";
  const subject = getSubject(timer.subjectId)?.name || "Independent study";
  const display = timer.mode === "stopwatch"
    ? formatStopwatch(timer.accumulatedSeconds + timer.sessionElapsed)
    : formatTimer(timer.remaining);
  overlay.innerHTML = `<button type="button" class="button-secondary focus-exit" data-focus-exit>Exit focus</button><div style="text-align:center"><div class="eyebrow">STUDYFLOW · FOCUS MODE</div><div class="timer-time" id="focus-timer-time">${display}</div><div class="focus-title">${escapeHTML(subject.toUpperCase())}</div><div class="button-row" style="justify-content:center"><button class="button" type="button" data-action="timer-toggle">${timer.running ? "Ⅱ Pause session" : state.pausedFocusTimer ? "▶ Resume session" : "▶ Start focus"}</button><button class="button-secondary" type="button" data-action="timer-stop">Stop & save</button><button class="button-secondary" type="button" data-action="timer-reset">Reset</button></div></div>`;
  document.body.append(overlay);
}
async function requestNotifications() {
  if (isAndroidNative()) {
    try {
      const permission = await requestNativeNotificationPermission();
      state.settings.notifications = permission.granted;
      await saveState();
      queueNativeNotificationSync(true);
      refresh();
      showToast(permission.granted ? "Native Android reminders enabled." : "Exact alarm permission is off. Open Android Settings > Alarms & reminders for StudyFlow.");
    } catch (error) {
      console.error(error);
      state.settings.notifications = false;
      await saveState();
      refresh();
      showToast("Could not request Android notification permission.");
    }
    return;
  }
  if (!("Notification" in window)) {
    state.settings.notifications = false;
    refresh();
    showToast("Notifications are not supported by this browser.");
    return;
  }
  try {
    const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    state.settings.notifications = permission === "granted";
    await saveState();
    refresh();
    showToast(state.settings.notifications ? "Browser reminders enabled." : "Notification permission was not granted.");
  } catch (error) {
    console.error(error);
    state.settings.notifications = false;
    refresh();
    showToast("Could not enable browser notifications.");
  }
}
function checkReminders() {
  if (isAndroidNative()) return;
  if (!state?.settings?.notifications || !("Notification" in window) || Notification.permission !== "granted") return;
  const now = new Date();
  const today = localDate(now);
  if (notifiedReminderDate !== today) {
    notifiedReminders.clear();
    notifiedReminderDate = today;
  }
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const minute = `${today} ${time}`;
  const keyPrefix = `${minute}|`;
  const tasks = state.tasks.filter(item => item.reminder && !item.completed && item.dueDate === today && item.dueTime === time);
  tasks.forEach(item => {
    const key = `${keyPrefix}task:${item.id}`;
    if (notifiedReminders.has(key)) return;
    notifiedReminders.add(key);
    new Notification("StudyFlow · Task reminder", { body: item.title });
  });
  (state.timetable[todayName()] || []).filter(item => item.reminder && item.start === time).forEach(item => {
    const key = `${keyPrefix}activity:${item.id}`;
    if (notifiedReminders.has(key)) return;
    notifiedReminders.add(key);
    new Notification("StudyFlow · Timetable", { body: item.name });
  });
  if (state.studyTracking.automaticEnabled && state.notificationPreferences.categories.study) {
    (state.timetable[todayName()] || []).filter(item => {
      const start = timeMinutes(item.start);
      return (item.studyTracking ?? /study|revision/i.test(item.name || "")) && start !== null && start >= 5
        && `${String(Math.floor((start - 5) / 60)).padStart(2, "0")}:${String((start - 5) % 60).padStart(2, "0")}` === time;
    }).forEach(item => {
      const key = `${keyPrefix}study-upcoming:${item.id}`;
      if (notifiedReminders.has(key)) return;
      notifiedReminders.add(key);
      new Notification("StudyFlow · Study period soon", {
        body: `${item.name} starts in 5 minutes. Tracking only runs while the app is visible and recently active.`
      });
    });
  }
}
const notifiedReminders = new Set();
let notifiedReminderDate = "";
async function exportData() {
  const backup = { app: "STUDYFLOW", version: 1, exportedAt: new Date().toISOString(), data: state };
  const contents = JSON.stringify(backup, null, 2);
  const filename = `studyflow-backup-${localDate()}.json`;
  if (isAndroidNative()) {
    await exportNativeBackup(filename, contents);
    showToast("StudyFlow backup ready to save or share.");
    return;
  }
  const blob = new Blob([contents], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("StudyFlow backup exported.");
}
function importDataFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onerror = () => showToast("Could not read the selected backup file.");
  reader.onload = async () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      const incoming = parsed?.app === "STUDYFLOW" ? parsed.data : parsed;
      if (!isRecord(incoming) || incoming.schemaVersion !== 1 || !Array.isArray(incoming.subjects)
        || !isRecord(incoming.settings) || !isRecord(incoming.logs) || !isRecord(incoming.timetable)) {
        throw new Error("This file is not a valid StudyFlow backup.");
      }
      if (!confirmDelete("Restore this backup and replace the planner data currently saved in this browser?")) return;
      const previousState = state;
      stopTimerInterval();
      clearInterval(automaticTrackerInterval);
      automaticTrackerInterval = null;
      automaticTracker = { lastActivityAt: 0, lastTickAt: 0, sessionId: "", activityId: "" };
      timer.running = false;
      timer.sessionStartedAt = null;
      timer.sessionDate = "";
      timer.deadlineAt = "";
      timer.sessionDuration = 0;
      timer.sessionElapsed = 0;
      state = incoming;
      state.navigation = normalizeNavigationConfig(state.navigation);
      state.ui = {
        expandedTaskIds: Array.isArray(state.ui?.expandedTaskIds) ? state.ui.expandedTaskIds.filter(id => typeof id === "string") : [],
        selectedHabitDate: typeof state.ui?.selectedHabitDate === "string" ? state.ui.selectedHabitDate : ""
      };
      state.settings = {
        theme: "dark",
        studyTargetHours: 6,
        waterTargetMl: 2250,
        focusTargetMinutes: 120,
        focusDurationMinutes: 25,
        breakDurationMinutes: 5,
        pomodoroEnabled: false,
        examDate: "",
        notifications: false,
        ...state.settings
      };
      state.tasks = Array.isArray(state.tasks) ? state.tasks : [];
      state.tasks.forEach(task => normalizeTaskSubtasks(task));
      normalizeTaskListsAndHabits();
      state.timetable = normalizeTimetable(state.timetable);
      state.notificationPreferences = normalizeNotificationPreferences(state.notificationPreferences);
      normalizeStudyTracking();
      state.activeAutomaticStudySession = null;
      if (!("activeStudySession" in state)) state.activeStudySession = null;
      if (!("pausedFocusTimer" in state)) state.pausedFocusTimer = null;
      if (typeof state.settings.notifications !== "boolean") state.settings.notifications = false;
      normalizeStudyRecords();
      dayLog();
      try {
        await saveState();
      } catch (error) {
        state = previousState;
        restoreActiveStudyTimer();
        if (state.studyTracking?.automaticEnabled) {
          automaticTrackerInterval = setInterval(tickAutomaticStudyTracker, AUTOMATIC_TRACK_INTERVAL_MS);
        }
        throw error;
      }
      timer.mode = "focus";
      timer.duration = clamp(Number(state.settings.focusDurationMinutes) || 25, 1, 180) * 60;
      timer.remaining = timer.duration;
      timer.subjectId = "";
      restoreActiveStudyTimer();
      if (state.studyTracking.automaticEnabled) {
        automaticTrackerInterval = setInterval(tickAutomaticStudyTracker, AUTOMATIC_TRACK_INTERVAL_MS);
      }
      refresh();
      showToast("Backup restored successfully.");
    } catch (error) {
      console.error(error);
      showToast(error.message || "That backup could not be restored.");
    }
  };
  reader.readAsText(file);
}
async function handleClick(event) {
  const pageButton = event.target.closest("[data-page]");
  if (pageButton) { navigate(pageButton.dataset.page); return; }
  const actionElement = event.target.closest("[data-action]");
  if (!actionElement) {
    if (event.target.closest("#top-theme, #sidebar-theme")) toggleTheme();
    return;
  }
  const { action, id } = actionElement.dataset;
  if (action === "check-app-update") {
    checkForUpdates(true);
  } else if (action === "download-app-update") {
    startAppUpdate();
  } else if (action === "dismiss-app-update") {
    updateState.dismissed = true;
    renderUpdateBanner();
  } else if (action === "open-exact-alarm-settings") {
    const result = await openExactAlarmSettings();
    if (result?.opened) {
      showToast("Opening Android alarm settings.");
    } else {
      showToast("Could not open Android alarm settings. Go to Settings > Apps > StudyFlow > Notifications.");
    }
  } else if (action === "schedule-day") {
    selectedScheduleDay = Number(actionElement.dataset.day);
    renderPage();
  } else if (action === "open-schedule-day") {
    selectedScheduleDay = Number(actionElement.dataset.day);
    navigate("timetable");
  } else if (action === "edit-activity") {
    const activity = state.timetable[DAYS[selectedScheduleDay]].find(item => item.id === id);
    if (!activity) return;
    openModal("Edit activity", [
      { name: "name", label: "ACTIVITY", required: true },
      { name: "start", label: "START TIME", type: "time", required: true },
      { name: "end", label: "END TIME", type: "time", required: true },
      { name: "reminder", label: "REMINDER", type: "select", options: [{ value: "false", label: "Off" }, { value: "true", label: "On" }] },
      { name: "studyTracking", label: "TRACK AS A STUDY PERIOD", type: "select", options: [{ value: "false", label: "No" }, { value: "true", label: "Yes" }] }
    ], "Save activity", {
      ...activity,
      reminder: String(activity.reminder),
      studyTracking: String(activity.studyTracking ?? /study|revision/i.test(activity.name || ""))
    }, values => {
      activity.name = values.name.trim();
      activity.start = values.start;
      activity.end = values.end;
      activity.reminder = values.reminder === "true";
      activity.studyTracking = values.studyTracking === "true";
      saveState(); renderPage(); showToast("Activity updated.");
    });
  } else if (action === "delete-activity") {
    if (!confirmDelete("Delete this activity from this weekday's timetable?")) return;
    state.timetable[DAYS[selectedScheduleDay]] = state.timetable[DAYS[selectedScheduleDay]].filter(item => item.id !== id);
    saveState(); renderPage(); showToast("Activity removed.");
  } else if (action === "activity-done") {
    const log = dayLog();
    log.activitiesDone = actionElement.checked ? [...new Set([...log.activitiesDone, id])] : log.activitiesDone.filter(item => item !== id);
    saveState(); renderPage();
  } else if (action === "water-add") {
    const amount = Number(actionElement.dataset.amount);
    if (amount > 0) { const log = dayLog(); log.waterMl += amount; log.waterEntries.push({ amount, at: new Date().toISOString() }); saveState(); renderPage(); showToast(`${amount} ml added.`); }
  } else if (action === "water-custom") {
    const value = window.prompt("How much water did you drink? Enter millilitres.", "300");
    if (value === null) return;
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 5000) { showToast("Enter an amount between 1 and 5000 ml."); return; }
    const log = dayLog();
    log.waterMl += Math.round(amount);
    log.waterEntries.push({ amount: Math.round(amount), at: new Date().toISOString() });
    saveState(); renderPage(); showToast(`${Math.round(amount)} ml added.`);
  } else if (action === "water-undo") {
    if (dayLog().waterMl <= 0) { showToast("There is no water entry to undo today."); return; }
    const log = dayLog();
    const last = log.waterEntries.pop();
    log.waterMl = Math.max(0, log.waterMl - (last?.amount || 250));
    saveState(); renderPage(); showToast(`${last?.amount || 250} ml entry removed.`);
  } else if (action === "exercise-done") {
    const log = dayLog();
    if (!log.gym) log.gym = { routine: state.gymRoutine[todayName()], exercisesDone: [], sets: [], completed: false, duration: 60 };
    const index = Number(actionElement.dataset.index);
    const values = new Set(log.gym.exercisesDone || []);
    actionElement.checked ? values.add(index) : values.delete(index);
    log.gym.exercisesDone = [...values];
    saveState();
  } else if (action === "gym-finish") {
    const log = dayLog();
    if (!log.gym) log.gym = { exercisesDone: [], sets: [] };
    log.gym.completed = true;
    log.gym.routine = state.gymRoutine[todayName()] || "Rest";
    log.gym.duration = clamp(Number($("#gym-duration")?.value) || 60, 1, 300);
    log.gym.defaultSets = clamp(Number($("#gym-sets")?.value) || 3, 1, 20);
    log.gym.sets = (EXERCISES[log.gym.routine] || []).map(() => log.gym.defaultSets);
    saveState(); renderPage(); showToast("Workout saved to your history.");
  } else if (action === "gym-undo") {
    if (!dayLog().gym) return;
    delete dayLog().gym;
    saveState(); renderPage(); showToast("Today's workout log cleared.");
  } else if (action === "save-recovery") {
    const log = dayLog();
    if (!log.gym) log.gym = { routine: state.gymRoutine[todayName()], completed: false, exercisesDone: [], duration: 0 };
    log.gym.recovery = $("#recovery-rating")?.value || "";
    log.gym.recoveryNote = $("#recovery-note")?.value.trim() || "";
    saveState(); renderPage(); showToast("Recovery check-in saved.");
  } else if (action === "skin-done") {
    const routine = actionElement.dataset.routine;
    const step = state.skincare[routine]?.[Number(actionElement.dataset.index)];
    if (!step) return;
    const list = dayLog().skincareDone[routine];
    dayLog().skincareDone[routine] = actionElement.checked ? [...new Set([...list, step])] : list.filter(item => item !== step);
    saveState(); renderPage();
  } else if (action === "delete-skincare-step") {
    const routine = actionElement.dataset.routine;
    const index = Number(actionElement.dataset.index);
    state.skincare[routine].splice(index, 1);
    saveState(); renderPage(); showToast("Routine step removed.");
  } else if (action === "manage-nav-default") {
    state.navigation = defaultNavigationConfig();
    ensureVisibleActivePage();
    saveState(); renderPage(); showToast("Navigation restored to the default layout.");
  } else if (action === "task-view") {
    if (!["day", "week", "month", "calendar"].includes(actionElement.dataset.view)) return;
    taskView = actionElement.dataset.view; renderPage();
  } else if (action === "rename-task-list") {
    const list = state.taskLists.find(item => item.id === id);
    if (!list) return;
    const name = window.prompt("Rename this task list.", list.name);
    if (name === null) return;
    const trimmed = name.trim().slice(0, 60);
    if (!trimmed) { showToast("A task list needs a name."); return; }
    list.name = trimmed;
    saveState(); renderPage(); showToast("Task list renamed.");
  } else if (action === "delete-task-list") {
    const list = state.taskLists.find(item => item.id === id);
    if (!list || list.id === DEFAULT_TASK_LIST_ID) return;
    if (!confirmDelete(`Delete “${list.name}”? Its tasks will be moved to My Tasks.`)) return;
    state.tasks.forEach(task => { if (task.listId === list.id) task.listId = DEFAULT_TASK_LIST_ID; });
    state.taskLists = state.taskLists.filter(item => item.id !== list.id);
    state.activeTaskListId = DEFAULT_TASK_LIST_ID;
    editingTaskId = "";
    saveState(); renderPage(); showToast("Task list deleted; its tasks were kept in My Tasks.");
  } else if (action === "habit-status") {
    const habit = state.habits.find(item => item.id === id);
    if (!habit) return;
    const date = localDate();
    const status = actionElement.dataset.status;
    if (!state.habitRecords[date]) state.habitRecords[date] = {};
    if (status === "clear") {
      delete state.habitRecords[date][habit.id];
      if (!Object.keys(state.habitRecords[date]).length) delete state.habitRecords[date];
    } else if (["completed", "missed"].includes(status)) {
      state.habitRecords[date][habit.id] = {
        status,
        habitName: habit.name,
        updatedAt: new Date().toISOString()
      };
    }
    saveState(); renderPage();
  } else if (action === "habit-edit") {
    const habit = state.habits.find(item => item.id === id);
    if (!habit) return;
    openModal("Edit habit", [
      { name: "name", label: "HABIT NAME", required: true, maxlength: 100 },
      { name: "category", label: "CATEGORY", type: "select", options: [{ value: "daily", label: "Daily habits" }, { value: "focus", label: "Focus & distraction control" }] },
      { name: "frequency", label: "FREQUENCY", type: "select", options: [{ value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly target" }] },
      { name: "weeklyTarget", label: "DAYS PER WEEK", type: "number", value: habit.weeklyTarget }
    ], "Save habit", habit, values => {
      const name = values.name.trim();
      if (!name) { showToast("A habit needs a name."); return; }
      habit.name = name.slice(0, 100);
      habit.category = values.category === "focus" ? "focus" : "daily";
      habit.frequency = values.frequency === "weekly" ? "weekly" : "daily";
      habit.weeklyTarget = clamp(Math.round(Number(values.weeklyTarget) || 1), 1, 7);
      saveState(); renderPage(); showToast("Habit updated. Its past records are preserved.");
    });
  } else if (action === "habit-delete") {
    const habit = state.habits.find(item => item.id === id);
    if (!habit || !confirmDelete(`Delete “${habit.name}”? Its historical check-ins will remain in analytics.`)) return;
    state.habits = state.habits.filter(item => item.id !== id);
    if (selectedHabitId === id) selectedHabitId = "";
    saveState(); renderPage(); showToast("Habit deleted; its historical records were kept.");
  } else if (action === "habit-select") {
    selectedHabitId = id;
    renderPage();
  } else if (action === "habit-clear-selection") {
    selectedHabitId = "";
    renderPage();
  } else if (action === "habit-period") {
    const days = Number(actionElement.dataset.days);
    if (![7, 30, 90].includes(days)) return;
    habitPeriod = days;
    renderPage();
  } else if (action === "habit-select-date") {
    const date = actionElement.dataset.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    state.ui.selectedHabitDate = date;
    saveState(); renderPage();
  } else if (action === "task-calendar-shift") {
    const offset = Number(actionElement.dataset.offset);
    if (![-1, 1].includes(offset)) return;
    taskCalendarDate = new Date(taskCalendarDate.getFullYear(), taskCalendarDate.getMonth() + offset, 1);
    renderPage();
  } else if (action === "task-done") {
    const task = state.tasks.find(item => item.id === id);
    if (!task) return;
    task.completed = actionElement.checked;
    task.completedAt = task.completed ? localDate() : "";
    if (task.subtasks?.length) {
      task.subtasks = task.subtasks.map(subtask => ({ ...subtask, completed: task.completed }));
    }
    if (task.completed) createNextRecurringTask(task);
    saveState(); renderPage();
  } else if (action === "expand-task" || action === "collapse-task") {
    if (!state.ui) state.ui = { expandedTaskIds: [] };
    const expanded = new Set(state.ui.expandedTaskIds);
    if (action === "expand-task") expanded.add(id);
    else expanded.delete(id);
    state.ui.expandedTaskIds = [...expanded];
    saveState(); renderPage();
  } else if (action === "task-subtask-done") {
    const task = state.tasks.find(item => item.id === actionElement.dataset.id);
    const subtaskId = actionElement.dataset.subtaskId;
    if (!task || !subtaskId) return;
    const subtask = normalizeTaskSubtasks(task).find(item => item.id === subtaskId);
    if (!subtask) return;
    subtask.completed = actionElement.checked;
    const progress = getTaskProgress(task);
    task.completed = progress.total > 0 ? progress.completed === progress.total : actionElement.checked;
    task.completedAt = task.completed ? task.completedAt || localDate() : "";
    if (task.completed) createNextRecurringTask(task);
    saveState(); renderPage();
  } else if (action === "delete-task-subtask") {
    const task = state.tasks.find(item => item.id === actionElement.dataset.id);
    const subtaskId = actionElement.dataset.subtaskId;
    if (!task || !subtaskId) return;
    task.subtasks = normalizeTaskSubtasks(task).filter(item => item.id !== subtaskId);
    const progress = getTaskProgress(task);
    task.completed = progress.total > 0 ? progress.completed === progress.total : false;
    task.completedAt = task.completed ? task.completedAt || localDate() : "";
    saveState(); renderPage();
  } else if (action === "edit-task") {
    editingTaskId = id; renderPage(); $("#task-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
  } else if (action === "cancel-task-edit") {
    editingTaskId = ""; renderPage();
  } else if (action === "delete-task") {
    if (!confirmDelete("Delete this task and its completion record?")) return;
    state.tasks = state.tasks.filter(item => item.id !== id);
    if (editingTaskId === id) editingTaskId = "";
    saveState(); renderPage(); showToast("Task deleted.");
  } else if (action === "progress-period") {
    if (!["day", "week", "month"].includes(actionElement.dataset.period)) return;
    progressPeriod = actionElement.dataset.period; renderPage();
  } else if (action === "quick-add-study") {
    addQuickStudyDuration(Number(actionElement.dataset.minutes));
  } else if (action === "custom-add-study") {
    const value = window.prompt("How many minutes did you study? Enter a number from 1 to 1440.", "60");
    if (value === null) return;
    const minutes = Number(value);
    if (!Number.isInteger(minutes)) { showToast("Enter a whole number of minutes."); return; }
    addQuickStudyDuration(minutes);
  } else if (action === "toggle-manual-entry") {
    editingStudyEntryId = "";
    manualStudyFormOpen = !manualStudyFormOpen;
    renderPage();
    if (manualStudyFormOpen) $("#manual-study-entry-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } else if (action === "cancel-study-edit") {
    editingStudyEntryId = "";
    manualStudyFormOpen = false;
    renderPage();
  } else if (action === "edit-study-entry") {
    const entry = findStudyEntry(id)?.entry;
    if (!entry || entry.legacy) return;
    editingStudyEntryId = id;
    manualStudyFormOpen = true;
    renderPage();
    $("#manual-study-entry-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } else if (action === "delete-study-entry") {
    if (!confirmDelete("Delete this study record and remove its time from your totals?")) return;
    if (!deleteStudyEntry(id)) { showToast("This study record could not be deleted."); return; }
    saveState();
    renderPage();
    showToast("Study record deleted.");
  } else if (action === "timer-toggle") {
    timer.running ? pauseTimer() : startTimer();
  } else if (action === "timer-stop") {
    stopTimer();
  } else if (action === "timer-reset") {
    resetTimer();
  } else if (action === "focus-toggle") {
    toggleFocusMode();
  } else if (action === "revision-done") {
    const chapter = getSubject(actionElement.dataset.subject)?.chapters.find(item => item.id === id);
    if (chapter) { chapter.revisionDate = ""; saveState(); renderPage(); showToast("Revision marked complete."); }
  } else if (action === "delete-chapter") {
    const subject = getSubject(actionElement.dataset.subject);
    if (!subject || !confirmDelete("Delete this chapter and its revision reminder?")) return;
    subject.chapters = subject.chapters.filter(ch => ch.id !== id);
    saveState(); renderPage(); showToast("Chapter removed.");
  } else if (action === "delete-pyq") {
    delete state.pyq[id]; saveState(); renderPage();
  } else if (action === "delete-mock") {
    state.mockTests = state.mockTests.filter(item => item.id !== id); saveState(); renderPage();
  } else if (action === "rename-subject") {
    const subject = getSubject(id);
    if (!subject) return;
    const value = window.prompt("Rename subject", subject.name);
    if (value === null) return;
    if (!value.trim()) { showToast("Subject name cannot be empty."); return; }
    subject.name = value.trim(); saveState(); renderPage(); showToast("Subject renamed.");
  } else if (action === "delete-subject") {
    if (!confirmDelete("Delete this subject, its chapters, and related practice records?")) return;
    state.subjects = state.subjects.filter(subject => subject.id !== id);
    Object.keys(state.pyq).forEach(key => { if (state.pyq[key].subjectId === id) delete state.pyq[key]; });
    state.mockTests = state.mockTests.filter(test => test.subjectId !== id);
    if (timer.subjectId === id) timer.subjectId = "";
    saveState(); renderPage(); showToast("Subject and related records removed.");
  } else if (action === "export-data") {
    exportData().catch(error => {
      console.error(error);
      showToast("Could not export your StudyFlow backup.");
    });
  } else if (action === "import-data") {
    $("#import-file").click();
  }
}
function toggleTheme() {
  state.settings.theme = state.settings.theme === "light" ? "dark" : "light";
  saveState();
  refresh();
}
function handleChange(event) {
  const target = event.target;
  if (target.id === "active-task-list") {
    if (!state.taskLists.some(list => list.id === target.value)) return;
    state.activeTaskListId = target.value;
    editingTaskId = "";
    saveState(); renderPage();
  } else if (target.matches('[data-action="chapter-status"]')) {
    const subject = getSubject(target.dataset.subject);
    const chapter = subject?.chapters.find(item => item.id === target.dataset.id);
    if (chapter && ["Not Started", "In Progress", "Completed"].includes(target.value)) {
      chapter.status = target.value;
      saveState(); renderPage();
    }
  } else if (target.matches('[data-action="revision-date"]')) {
    const chapter = getSubject(target.dataset.subject)?.chapters.find(item => item.id === target.dataset.id);
    if (chapter) { chapter.revisionDate = target.value; saveState(); }
  } else if (target.matches('[data-action="gym-routine"]')) {
    state.gymRoutine[target.dataset.day] = target.value;
    saveState(); renderPage(); showToast(`${target.dataset.day}'s workout updated.`);
  } else if (target.id === "theme-select") {
    state.settings.theme = target.value === "light" ? "light" : "dark";
    saveState(); applyTheme(); renderPage();
  } else if (target.id === "notification-toggle") {
    if (target.checked) requestNotifications();
    else { state.settings.notifications = false; saveState(); renderPage(); showToast("Browser reminders disabled."); }
  } else if (target.matches("[data-notification-category]")) {
    const category = target.dataset.notificationCategory;
    if (Object.hasOwn(state.notificationPreferences.categories, category)) {
      state.notificationPreferences.categories[category] = target.checked;
      saveState();
    }
  } else if (target.matches("[data-nav-toggle]")) {
    const id = target.dataset.navToggle;
    if (!DEFAULT_NAV_ORDER.includes(id)) return;
    const config = getNavigationConfig();
    if (id === "dashboard" || id === "settings") config.visible[id] = true;
    else config.visible[id] = target.checked;
    const visiblePages = Object.entries(config.visible).filter(([, enabled]) => enabled).map(([page]) => page);
    if (!visiblePages.length) {
      state.navigation = defaultNavigationConfig();
    } else {
      state.navigation = config;
    }
    ensureVisibleActivePage();
    saveState();
    renderPage();
  } else if (target.id === "timer-duration") {
    if (!timer.running) {
      const minutes = Number(target.value);
      const maximum = timer.mode === "break" ? 60 : 180;
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > maximum) {
        showToast(`Choose a ${timer.mode} duration between 1 and ${maximum} minutes.`);
        renderPage();
        return;
      }
      timer.duration = minutes * 60;
      timer.remaining = timer.duration;
      if (timer.mode === "break") state.settings.breakDurationMinutes = minutes;
      else state.settings.focusDurationMinutes = minutes;
      state.pausedFocusTimer = null;
      saveState();
      renderPage();
    }
  } else if (target.id === "timer-mode") {
    if (!timer.running && ["focus", "break", "stopwatch"].includes(target.value)) {
      timer.mode = target.value;
      timer.duration = target.value === "stopwatch"
        ? 0
        : clamp(Number(target.value === "break" ? state.settings.breakDurationMinutes : state.settings.focusDurationMinutes) || (target.value === "break" ? 5 : 25), 1, target.value === "break" ? 60 : 180) * 60;
      timer.remaining = timer.duration;
      timer.subjectId = target.value === "break" ? "" : timer.subjectId;
      timer.accumulatedSeconds = 0;
      timer.sessionElapsed = 0;
      timer.sessionCompleted = false;
      state.pausedFocusTimer = null;
      saveState();
      renderPage();
    }
  } else if (target.id === "quick-study-subject") {
    quickStudySubjectId = target.value;
  } else if (target.id === "quick-study-type") {
    quickStudyType = STUDY_TYPES.includes(target.value) ? target.value : "Study";
  } else if (target.id === "timer-study-type") {
    timer.studyType = STUDY_TYPES.includes(target.value) ? target.value : "Study";
  } else if (["study-entry-date", "study-entry-start", "study-entry-end"].includes(target.id)) {
    updateManualStudyDuration();
  } else if (target.id === "automatic-study-toggle") {
    state.studyTracking.automaticEnabled = target.checked;
    if (target.checked) {
      automaticTracker.lastActivityAt = Date.now();
      automaticTracker.lastTickAt = Date.now();
      clearInterval(automaticTrackerInterval);
      automaticTrackerInterval = setInterval(tickAutomaticStudyTracker, AUTOMATIC_TRACK_INTERVAL_MS);
      saveState();
      showToast("Scheduled tracking enabled. It only records while the app is visible and recently active.");
    } else {
      clearInterval(automaticTrackerInterval);
      automaticTrackerInterval = null;
      stopAutomaticStudySession();
      showToast("Scheduled study tracking disabled.");
    }
    renderPage();
  } else if (target.id === "automatic-idle-timeout") {
    const minutes = Number(target.value);
    if (![3, 5, 10].includes(minutes)) { showToast("Choose an inactivity timeout of 3, 5, or 10 minutes."); return; }
    state.studyTracking.idleTimeoutMinutes = minutes;
    saveState();
  } else if (target.id === "pomodoro-toggle") {
    state.settings.pomodoroEnabled = target.checked;
    saveState();
    showToast(target.checked ? "Focus completion will start a break timer." : "Automatic break starts disabled.");
  }
}
function handleSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form).entries());
  if (form.id === "task-list-form") {
    const name = String(values.name || "").trim().slice(0, 60);
    if (!name) { showToast("A task list needs a name."); return; }
    const list = { id: uid("task-list"), name, createdAt: new Date().toISOString() };
    state.taskLists.push(list);
    state.activeTaskListId = list.id;
    editingTaskId = "";
    saveState(); renderPage(); showToast("Task list created.");
  } else if (form.id === "habit-form") {
    const name = String(values.name || "").trim().slice(0, 100);
    if (!name) { showToast("A habit needs a name."); return; }
    state.habits.push({
      id: uid("habit"),
      name,
      category: values.category === "focus" ? "focus" : "daily",
      frequency: values.frequency === "weekly" ? "weekly" : "daily",
      weeklyTarget: clamp(Math.round(Number(values.weeklyTarget) || 1), 1, 7),
      createdAt: new Date().toISOString()
    });
    saveState(); renderPage(); showToast("Habit added to your tracker.");
  } else if (form.id === "activity-form") {
    const dayIndex = Number(values.day);
    if (!values.name.trim() || !Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) { showToast("Add an activity and choose a weekday."); return; }
    if (timeMinutes(values.end) === null || timeMinutes(values.start) === null || timeMinutes(values.end) <= timeMinutes(values.start)) { showToast("The end time must be later than the start time."); return; }
    state.timetable[DAYS[dayIndex]].push({
      id: uid("activity"),
      name: values.name.trim(),
      start: values.start,
      end: values.end,
      reminder: form.elements.reminder.checked,
      studyTracking: form.elements.studyTracking.checked || /study|revision/i.test(values.name)
    });
    selectedScheduleDay = dayIndex;
    saveState(); renderPage(); showToast("Activity added to your timetable.");
  } else if (form.id === "water-target-form") {
    const target = Number(values.target);
    if (!Number.isFinite(target) || target < 250 || target > 10000) { showToast("Choose a daily target between 250 and 10,000 ml."); return; }
    state.settings.waterTargetMl = Math.round(target);
    saveState(); renderPage(); showToast("Daily water target updated.");
  } else if (form.id === "focus-target-form") {
    const target = Number(values.target);
    if (!Number.isInteger(target) || target < 1 || target > 1440) { showToast("Choose a daily focus goal between 1 and 1,440 minutes."); return; }
    state.settings.focusTargetMinutes = target;
    saveState(); renderPage(); showToast("Daily focus goal updated.");
  } else if (form.id === "study-entry-form") {
    const range = studyEntryRange(values.date, values.startTime, values.endTime);
    if (!range) { showToast("Enter a valid local date and time range of up to 24 hours."); return; }
    if (range.end > Date.now()) { showToast("A study record cannot end in the future."); return; }
    const subject = getSubject(values.subjectId);
    const existing = values.entryId ? findStudyEntry(values.entryId) : null;
    const entry = {
      id: existing?.entry.id || uid("study-manual"),
      date: localDate(new Date(range.start)),
      startedAt: new Date(range.start).toISOString(),
      endedAt: new Date(range.end).toISOString(),
      seconds: range.seconds,
      subjectId: subject?.id || "",
      subjectName: subject?.name || "Independent study",
      studyType: STUDY_TYPES.includes(values.studyType) ? values.studyType : "Study",
      trackingMethod: existing?.entry.trackingMethod || "manual",
      completed: existing?.entry.completed === true
    };
    if (!saveStudyEntry(entry, existing?.entry.id || "")) {
      showToast("This period overlaps another recorded or active study session.");
      return;
    }
    editingStudyEntryId = "";
    manualStudyFormOpen = false;
    saveState();
    renderPage();
    showToast(existing ? "Study entry updated." : "Study session added.");
  } else if (form.id === "task-form") {
    const current = state.tasks.find(item => item.id === values.taskId);
    const reminder = form.elements.reminder.checked;
    const recurrence = ["daily", "weekly", "monthly"].includes(values.recurrence) ? values.recurrence : "";
    if (recurrence && !values.dueDate) { showToast("Recurring tasks need a due date."); return; }
    if (recurrence && values.recurrenceUntil && values.recurrenceUntil < values.dueDate) { showToast("Repeat-until date must be on or after the first due date."); return; }
    const updated = {
      id: current?.id || uid("task"), listId: current?.listId || state.activeTaskListId,
      title: values.title.trim(), category: values.category,
      priority: values.priority === "High" ? "High" : "Low", dueDate: values.dueDate || "", dueTime: values.dueTime || "",
      recurrence, recurrenceUntil: recurrence ? values.recurrenceUntil || "" : "",
      recurrenceDay: recurrence === "monthly"
        ? (current?.recurrence === recurrence && current?.dueDate === values.dueDate ? current.recurrenceDay : Number(values.dueDate.slice(-2)))
        : 0,
      recurrenceParentId: current?.recurrenceParentId || "",
      reminder, completed: current?.completed || false, completedAt: current?.completedAt || "", subtasks: current?.subtasks ? normalizeTaskSubtasks(current) : [], createdAt: current?.createdAt || new Date().toISOString()
    };
    if (!updated.title) { showToast("A task needs a title."); return; }
    if (current) Object.assign(current, updated); else state.tasks.push(updated);
    editingTaskId = "";
    saveState(); renderPage(); showToast(current ? "Task updated." : "Task added.");
    if (reminder && (!("Notification" in window) || Notification.permission !== "granted")) requestNotifications();
  } else if (form.classList.contains("subtask-form")) {
    const task = state.tasks.find(item => item.id === form.dataset.taskId);
    const title = String(values.subtask || "").trim();
    if (!task || !title) return;
    task.subtasks = normalizeTaskSubtasks(task);
    task.subtasks.push({ id: uid("subtask"), title, completed: false });
    task.completed = false;
    task.completedAt = "";
    if (!state.ui) state.ui = { expandedTaskIds: [] };
    if (!state.ui.expandedTaskIds.includes(task.id)) state.ui.expandedTaskIds.push(task.id);
    saveState(); renderPage(); showToast("Subtask added.");
  } else if (form.id === "notes-form") {
    state.notes = values.notes || "";
    saveState(); showToast("Study notes saved.");
  } else if (form.classList.contains("chapter-form")) {
    const subject = getSubject(form.dataset.subject);
    if (!subject || !values.chapter.trim()) return;
    subject.chapters.push({ id: uid("chapter"), name: values.chapter.trim(), status: "Not Started", revisionDate: "" });
    saveState(); renderPage(); showToast("Chapter added.");
  } else if (form.id === "subject-form") {
    const name = values.subject.trim();
    if (!name) return;
    if (state.subjects.some(subject => subject.name.toLowerCase() === name.toLowerCase())) { showToast("That subject already exists."); return; }
    state.subjects.push({ id: uid("subject"), name, chapters: [] });
    saveState(); renderPage(); showToast("Subject added.");
  } else if (form.id === "pyq-form") {
    const key = uid("pyq");
    state.pyq[key] = { subjectId: values.subjectId, year: Number(values.year), date: localDate() };
    saveState(); renderPage(); showToast("Question practice recorded.");
  } else if (form.id === "mock-form") {
    const score = Number(values.score);
    const maxScore = Number(values.maxScore);
    if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore < 1 || score < 0 || score > maxScore) { showToast("Score must be between zero and the maximum marks."); return; }
    state.mockTests.push({ id: uid("mock"), subjectId: values.subjectId, date: values.date, score, maxScore });
    saveState(); renderPage(); showToast("Mock test result saved.");
  } else if (form.id === "settings-form") {
    const studyTargetHours = Number(values.studyTargetHours);
    const waterTargetMl = Number(values.waterTargetMl);
    if (!Number.isFinite(studyTargetHours) || studyTargetHours < .5 || studyTargetHours > 24
      || !Number.isFinite(waterTargetMl) || waterTargetMl < 250 || waterTargetMl > 10000) {
      showToast("Check your study and water target values.");
      return;
    }
    state.settings.studyTargetHours = studyTargetHours;
    state.settings.waterTargetMl = Math.round(waterTargetMl);
    state.settings.examDate = values.examDate || "";
    saveState(); renderPage(); showToast("Planner settings saved.");
  } else if (form.id === "notification-settings-form") {
    const preferences = state.notificationPreferences;
    const interval = Number(values.waterIntervalMinutes);
    const timeValues = [values.waterStart, values.waterEnd, values.skincareMorningTime, values.skincareNightTime, values.gymTime];
    if (![60, 90, 120, 180, 240].includes(interval)
      || timeValues.some(value => !Number.isInteger(timeMinutes(value)) || timeMinutes(value) < 0 || timeMinutes(value) >= 1440)
      || timeMinutes(values.waterEnd) <= timeMinutes(values.waterStart)) {
      showToast("Choose a supported water interval and an end time after its start.");
      return;
    }
    preferences.waterIntervalMinutes = interval;
    preferences.waterStart = values.waterStart;
    preferences.waterEnd = values.waterEnd;
    preferences.skincareMorningTime = values.skincareMorningTime;
    preferences.skincareNightTime = values.skincareNightTime;
    preferences.gymTime = values.gymTime;
    saveState(); renderPage(); showToast("Notification preferences saved.");
  } else if (form.classList.contains("skincare-form")) {
    const routine = form.dataset.routine;
    const step = values.step.trim();
    if (!step || !["morning", "night"].includes(routine)) return;
    state.skincare[routine].push(step);
    saveState(); renderPage(); showToast("Skincare step added.");
  }
}
function attachEvents() {
  window.addEventListener("resize", renderNavigation, { passive: true });
  const recordRecentInteraction = () => {
    if (!state?.studyTracking?.automaticEnabled || document.visibilityState !== "visible") return;
    automaticTracker.lastActivityAt = Date.now();
    if (!automaticTracker.lastTickAt) automaticTracker.lastTickAt = automaticTracker.lastActivityAt;
  };
  document.addEventListener("pointerdown", recordRecentInteraction, { passive: true });
  document.addEventListener("keydown", recordRecentInteraction);
  document.addEventListener("input", event => {
    if (["study-entry-date", "study-entry-start", "study-entry-end"].includes(event.target.id)) updateManualStudyDuration();
  });
  document.addEventListener("click", event => {
    if (event.target.closest("[data-focus-exit]")) {
      document.querySelector(".focus-overlay:not(.modal-backdrop)")?.remove();
      return;
    }
    if (event.target.closest("#top-theme, #sidebar-theme")) { toggleTheme(); return; }
    handleClick(event);
  });
  document.addEventListener("change", handleChange);
  document.addEventListener("submit", handleSubmit);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      automaticTracker.lastActivityAt = 0;
      if (state.activeAutomaticStudySession) stopAutomaticStudySession();
    } else {
      updateTimerFromClock();
      if (state.studyTracking.automaticEnabled && !automaticTrackerInterval) {
        automaticTrackerInterval = setInterval(tickAutomaticStudyTracker, AUTOMATIC_TRACK_INTERVAL_MS);
      }
      queueNativeNotificationSync(true);
    }
  });
  window.addEventListener("pagehide", () => {
    automaticTracker.lastActivityAt = 0;
    if (state?.activeAutomaticStudySession) stopAutomaticStudySession();
  });
  $("#import-file").addEventListener("change", event => {
    importDataFile(event.target.files?.[0]);
    event.target.value = "";
  });
}
function updateClock() {
  const clock = $("#live-clock");
  if (clock) clock.textContent = formatClock();
}
async function initialize() {
  try {
    if (!("indexedDB" in window)) throw new Error("This browser does not support local IndexedDB storage.");
    db = await openDatabase();
    state = await loadState() || freshState();
    state.navigation = normalizeNavigationConfig(state.navigation);
    state.ui = {
      expandedTaskIds: Array.isArray(state.ui?.expandedTaskIds) ? state.ui.expandedTaskIds.filter(id => typeof id === "string") : [],
      selectedHabitDate: typeof state.ui?.selectedHabitDate === "string" ? state.ui.selectedHabitDate : ""
    };
    state.timetable = normalizeTimetable(state.timetable);
    state.settings = {
      theme: "dark",
      studyTargetHours: 6,
      waterTargetMl: 2250,
      focusTargetMinutes: 120,
      focusDurationMinutes: 25,
      breakDurationMinutes: 5,
      pomodoroEnabled: false,
      examDate: "",
      notifications: false,
      ...state.settings
    };
    timer.duration = clamp(Number(state.settings.focusDurationMinutes) || 25, 1, 180) * 60;
    timer.remaining = timer.duration;
    state.tasks.forEach(task => normalizeTaskSubtasks(task));
    if (!state.logs) state.logs = {};
    if (!state.skincare) state.skincare = JSON.parse(JSON.stringify(DEFAULT_SKINCARE));
    if (!state.gymRoutine) state.gymRoutine = { ...DEFAULT_ROUTINE };
    state.notificationPreferences = normalizeNotificationPreferences(state.notificationPreferences);
    normalizeTaskListsAndHabits();
    normalizeStudyTracking();
    state.activeAutomaticStudySession = null;
    normalizeStudyRecords();
    if (!("activeStudySession" in state)) state.activeStudySession = null;
    if (!("pausedFocusTimer" in state)) state.pausedFocusTimer = null;
    dayLog();
    await saveState();
    attachEvents();
    refresh();
    initializeAppUpdates();
    restoreActiveStudyTimer();
    automaticTracker = { lastActivityAt: 0, lastTickAt: 0, sessionId: "", activityId: "" };
    if (state.studyTracking.automaticEnabled) {
      automaticTrackerInterval = setInterval(tickAutomaticStudyTracker, AUTOMATIC_TRACK_INTERVAL_MS);
    }
    if (isAndroidNative()) {
      try {
        nativeNotificationStatus = await initializeNativeNotifications(
          navigate,
          () => {
            updateTimerFromClock();
            queueNativeNotificationSync(true);
          }
        );
        queueNativeNotificationSync(true);
      } catch (error) {
        console.error("Could not initialize native StudyFlow notifications.", error);
        nativeNotificationStatus = { native: true, permission: "unavailable", scheduled: 0 };
        showToast("Native notifications are unavailable. Check Android app permissions.");
      }
    }
    updateClock();
    setInterval(updateClock, 1000);
    setInterval(checkReminders, 15000);
  } catch (error) {
    console.error(error);
    $("#page").innerHTML = `<section class="card section-card"><div class="eyebrow">STUDYFLOW COULD NOT START</div><h1>Your local planner database could not be opened.</h1><p class="muted">${escapeHTML(error.message || "The browser could not open StudyFlow's IndexedDB database.")}</p><p class="muted">Open StudyFlow from the Vite URL in the same browser profile where you saved it, and make sure site storage is enabled. Avoid clearing site data; your existing planner has not been reset or removed.</p><button class="button-secondary" type="button" onclick="location.reload()">Try again</button></section>`;
  }
}
initialize();
