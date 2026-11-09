# STUDYFLOW — My Personal Life Planner

STUDYFLOW is the existing study-first planner packaged for Android with Capacitor. It retains the existing planner and IndexedDB data while adding grouped navigation, recurring tasks and a calendar, focus and break timers, and wellness reminders for water, gym, and skincare.

## Run the web app

```powershell
npm install
npm run dev
```

Open the Vite URL printed in the terminal. `npm run build` creates the production web assets in `dist`. The app uses system fonts and does not fetch external fonts, so the interface renders without a third-party font request.
Do not open `index.html` directly with a `file://` URL: browsers cannot resolve the app's JavaScript module dependencies from that origin. The app now displays this launch requirement instead of a blank page. The standalone `legacy-backup.html` exporter is the only page intended to be opened directly from a file URL.

To test on an Android phone over Wi-Fi, connect the phone and PC to the same network, run `npm run dev`, and open the **Network** URL printed by Vite on the phone. Allow the development server through the PC firewall if prompted. For an installed Android app, rebuild the APK after web changes with `npm run android:debug`.

## Build the Android debug APK

Install Android Studio with an Android SDK, and use Android Studio's bundled JDK 21 (or another supported JDK). Set `JAVA_HOME`, `ANDROID_HOME`, and `ANDROID_SDK_ROOT` for your environment, then run:

```powershell
npm run android:debug
```

The APK is written to `android\app\build\outputs\apk\debug\app-debug.apk`. To install it on a connected device with Android platform tools:

```powershell
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
```

The Android application ID is `com.studyflow.personalplanner`.

## Android app updates

On Android, StudyFlow checks the public GitHub Releases endpoint when it opens. **Settings → App updates → Check for updates** also starts a manual check. Updates are installed by Android's package installer; the updater does not uninstall StudyFlow or clear its data.

To publish an update, create a **published stable release** in `shriom0123/STUDYFLOW-` with a numeric tag such as `v1.1.0`, and attach exactly one universal `.apk` asset. Build the APK with application ID `com.studyflow.personalplanner`, a `versionName` matching the tag, a `versionCode` greater than the installed build, and the same signing certificate used by the installed app. Android requires the matching signing key to preserve the installed app and its private data. Do not publish debug builds as production updates unless the installed app is signed with that same debug key.

Android 8 and later may ask the user to allow StudyFlow to install apps from this source. The user can open the system permission page from Settings or when starting an update. The updater verifies the downloaded APK's package ID, release version, increasing version code, and signing certificate before opening the installer. A release must have one APK; split APK sets are not supported.

The Android activity uses immersive sticky mode: status and navigation bars are hidden, and an edge swipe reveals them temporarily. The WebView draws edge-to-edge with cutout-aware safe-area padding; the existing Android back behavior is unchanged.

The main areas are Home, Study, Tasks, Habits, Focus, Wellness, Analytics, and Settings. Wellness contains Water, Gym, and Skincare. On mobile, they remain available through a horizontally scrollable floating bottom dock with safe-area spacing; desktop keeps its dedicated sidebar. Scrolling remains touch-friendly, scrollbars are visually hidden without disabling scrolling, and section transitions respect the device's reduced-motion preference. Immersive gestures, transient bars, and display cutouts should be confirmed on a physical Android device because these behaviors depend on the device's navigation mode and display.

## Existing browser data and backups

Planner data is stored in IndexedDB. A browser's `file://` database and an installed Android app's WebView database are separate storage origins, so Android cannot silently read the old browser database. Before migrating, open `legacy-backup.html` in the same browser profile where the existing planner was used and export its JSON file. In the APK, use **Settings → Data & backup → Restore backup** to import it.

After migration, use **Export backup** regularly. On Android, the app opens the native share/save sheet; on the web, it downloads a JSON file. Restoring replaces the current planner data after confirmation.

## Android notifications

Notifications are opt-in under **Settings → Notification settings**. Categories can be enabled separately for tasks, timetable, study sessions, water, gym, and skincare. Reminder schedules are reconciled from saved planner data; Android's notification service can deliver scheduled reminders while StudyFlow is closed or the screen is locked, and the notification opens the related section.

Android 13 and later require the user to grant notification permission. StudyFlow requests no other user-facing device permissions. Reminders use inexact scheduling and Android may defer or suppress them because of Doze, battery restrictions, disabled notification channels, or force-stop. These are operating-system controls that the app cannot override.

## Wellness

Wellness includes water tracking, gym routines, and skincare checklists. Their reminders are optional notifications; the app does not access health, activity, step-count, or sleep sensors. Existing planner backups and records are retained, including any older data from removed planner features.

## Focus sessions

The Focus section combines the configurable countdown and break timers with an optional stopwatch, pause/resume and recovery after reopening, a daily goal, and a unified study ledger. Timer sessions are recorded with their subject, type, start/end times, and tracking method. Quick Add offers 15-, 30-, 45-, 60-, and 120-minute entries, plus a custom duration; **Forgot to Start Timer?** lets you enter a past session using its date and local start/end times. Study entries can be edited or deleted, with overlapping records rejected to avoid double-counting.

The dashboard combines manually entered, quick-added, timer-recorded, and scheduled study time in its daily, weekly, monthly, subject, history, average, and streak views. Existing aggregate-only planner totals remain visible as earlier recorded time; no missing start or end times are invented.

Scheduled tracking is opt-in. Mark periods in the timetable, then enable it in Focus. It records only while StudyFlow is visible and has recent user interaction, pauses after a configurable 3-, 5-, or 10-minute idle timeout, and stops when the app is backgrounded. It cannot determine whether a person is actually studying. An upcoming-period notification is available when notification permission and the Study notification category are enabled. All entries use the existing IndexedDB planner record and remain part of JSON backups.

The current app does not provide an ongoing Android focus notification with pause/resume/stop actions. Android notification reminders remain subject to the notification settings and platform limits above.

## Task lists and habits

Tasks are organized into separately named lists, each retaining its own tasks, completion history, categories, High/Low priorities, subtasks, and Day, Week, Month, or Calendar view. Existing tasks are migrated into **My Tasks** without changing the IndexedDB schema. Tasks support daily, weekly, or monthly recurrence with an optional repeat-until date; completing a recurring task creates its next occurrence without replacing its history.

The separate **Habits** area starts with editable examples and supports custom daily or weekly-target habits, explicit completed/missed check-ins, historical consistency graphs, a 13-week heatmap, and individual streak analysis. Focus and distraction-control habits are tracked manually; StudyFlow does not read phone usage or screen-time data. Check-ins are stored by local calendar date in the same persistent planner record and are included in JSON backups. Editing a habit keeps its historical check-ins; deleting one leaves its records available to overall history.

New task-list and habit defaults are normalized when older planner data is opened. The existing IndexedDB database and planner record are retained. Continue to export backups regularly.
