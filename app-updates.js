import { Capacitor, registerPlugin } from "@capacitor/core";

const RELEASES_API = "https://api.github.com/repos/shriom0123/STUDYFLOW-/releases/latest";

const AppUpdate = registerPlugin("AppUpdate", {
  web: {
    async getAppInfo() {
      return { native: false, packageName: "com.studyflow.personalplanner", versionName: "1.0", versionCode: 1 };
    },
    async canInstallPackages() {
      return { supported: false, allowed: false };
    },
    async requestInstallPermission() {
      return { opened: false, supported: false };
    },
    async downloadAndInstall() {
      throw new Error("APK installation is only available in the installed Android app.");
    }
  }
});

function parseVersion(value) {
  const match = /^v?(\d+(?:\.\d+){0,3})(?:[-+].*)?$/i.exec(String(value || "").trim());
  if (!match) return null;
  return match[1].split(".").map(part => Number(part));
}

function compareVersions(first, second) {
  const left = parseVersion(first);
  const right = parseVersion(second);
  if (!left || !right) throw new Error("The installed or release version is not a valid numeric version.");
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] || 0) - (right[index] || 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}

export function isAndroidApp() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export async function getInstalledAppInfo() {
  return AppUpdate.getAppInfo();
}

export async function checkForStudyFlowUpdate(currentInfo) {
  const response = await fetch(RELEASES_API, {
    headers: { Accept: "application/vnd.github+json" },
    cache: "no-store"
  });
  if (response.status === 404) {
    return {
      available: false,
      message: "No published GitHub release is available yet.",
      currentVersion: currentInfo.versionName
    };
  }
  if (response.status === 403 || response.status === 429) {
    throw new Error("GitHub temporarily rate-limited update checks. Please try again later.");
  }
  if (!response.ok) throw new Error(`GitHub update check failed (HTTP ${response.status}).`);

  const release = await response.json();
  if (release.draft || release.prerelease || !release.tag_name) {
    throw new Error("The latest GitHub release is not a published stable release.");
  }
  const latestVersion = String(release.tag_name).replace(/^v/i, "");
  const comparison = compareVersions(latestVersion, currentInfo.versionName);
  if (comparison <= 0) {
    return {
      available: false,
      message: "You're using the latest version.",
      currentVersion: currentInfo.versionName,
      latestVersion
    };
  }

  const apkAssets = (Array.isArray(release.assets) ? release.assets : [])
    .filter(asset => typeof asset.name === "string" && /\.apk$/i.test(asset.name)
      && typeof asset.browser_download_url === "string");
  if (apkAssets.length !== 1) {
    throw new Error(apkAssets.length
      ? "The latest release contains multiple APKs. Publish one universal StudyFlow APK per release."
      : "A newer release exists, but it does not contain an APK asset.");
  }
  const apkUrl = new URL(apkAssets[0].browser_download_url);
  if (apkUrl.protocol !== "https:"
    || (apkUrl.hostname !== "github.com" && !apkUrl.hostname.endsWith(".github.com"))) {
    throw new Error("The release APK URL is not a trusted HTTPS GitHub URL.");
  }
  return {
    available: true,
    currentVersion: currentInfo.versionName,
    version: latestVersion,
    name: String(release.name || `StudyFlow ${latestVersion}`),
    notes: String(release.body || "No update details were provided."),
    url: apkUrl.href,
    pageUrl: String(release.html_url || "https://github.com/shriom0123/STUDYFLOW-/releases")
  };
}

export async function getPackageInstallPermission() {
  return AppUpdate.canInstallPackages();
}

export async function requestPackageInstallPermission() {
  return AppUpdate.requestInstallPermission();
}

export async function downloadAndInstallApk(url, version) {
  return AppUpdate.downloadAndInstall({ url, version });
}

export async function addUpdateProgressListener(listener) {
  return AppUpdate.addListener("updateDownloadProgress", listener);
}
