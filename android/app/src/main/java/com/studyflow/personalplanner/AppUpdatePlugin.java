package com.studyflow.personalplanner;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Base64;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {
    private static final long MAX_APK_BYTES = 250L * 1024L * 1024L;
    private static final ExecutorService DOWNLOAD_EXECUTOR = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void getAppInfo(PluginCall call) {
        Context context = getContext();
        if (context == null) {
            call.reject("Android app information is unavailable.");
            return;
        }
        try {
            PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            JSObject response = new JSObject();
            response.put("native", true);
            response.put("packageName", context.getPackageName());
            response.put("versionName", info.versionName == null ? "" : info.versionName);
            response.put("versionCode", getVersionCode(info));
            call.resolve(response);
        } catch (PackageManager.NameNotFoundException error) {
            call.reject("Could not read the installed StudyFlow version.", error);
        }
    }

    @PluginMethod
    public void canInstallPackages(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            JSObject response = new JSObject();
            response.put("supported", true);
            response.put("allowed", true);
            call.resolve(response);
            return;
        }
        Context context = getContext();
        if (context == null) {
            call.reject("Android package installer status is unavailable.");
            return;
        }
        JSObject response = new JSObject();
        response.put("supported", true);
        response.put("allowed", context.getPackageManager().canRequestPackageInstalls());
        call.resolve(response);
    }

    @PluginMethod
    public void requestInstallPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            JSObject response = new JSObject();
            response.put("opened", false);
            response.put("supported", false);
            call.resolve(response);
            return;
        }
        Context context = getContext();
        if (context == null) {
            call.reject("Android install permission settings are unavailable.");
            return;
        }
        if (context.getPackageManager().canRequestPackageInstalls()) {
            JSObject response = new JSObject();
            response.put("opened", false);
            response.put("supported", true);
            response.put("alreadyAllowed", true);
            call.resolve(response);
            return;
        }
        try {
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
            intent.setData(Uri.parse("package:" + context.getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(intent);
            JSObject response = new JSObject();
            response.put("opened", true);
            response.put("supported", true);
            call.resolve(response);
        } catch (Exception error) {
            call.reject("Could not open Android's install-unknown-apps settings.", error);
        }
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String downloadUrl = call.getString("url");
        String expectedVersion = call.getString("version");
        if (!isTrustedGithubUrl(downloadUrl)) {
            call.reject("The APK must be downloaded from an HTTPS GitHub release.");
            return;
        }
        if (expectedVersion == null || expectedVersion.trim().isEmpty()) {
            call.reject("The release version is missing.");
            return;
        }
        Context context = getContext();
        if (context == null) {
            call.reject("The Android app context is unavailable.");
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.getPackageManager().canRequestPackageInstalls()) {
            call.reject("Allow StudyFlow to install updates in Android settings, then try again.");
            return;
        }

        call.setKeepAlive(true);
        DOWNLOAD_EXECUTOR.execute(() -> {
            File apkFile = null;
            boolean apkVerified = false;
            boolean installerLaunchPending = false;
            try {
                apkFile = downloadApk(downloadUrl);
                verifyApk(context, apkFile, expectedVersion);
                apkVerified = true;
                openInstaller(context, apkFile, call);
                installerLaunchPending = true;
            } catch (Exception error) {
                if (!apkVerified && apkFile != null && apkFile.exists()) apkFile.delete();
                call.reject(error.getMessage() == null ? "The StudyFlow update could not be installed." : error.getMessage(), error);
            } finally {
                if (!installerLaunchPending) call.setKeepAlive(false);
            }
        });
    }

    private File downloadApk(String downloadUrl) throws Exception {
        URL url = new URL(downloadUrl);
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setConnectTimeout(20000);
        connection.setReadTimeout(30000);
        connection.setInstanceFollowRedirects(true);
        connection.setRequestProperty("Accept", "application/vnd.android.package-archive, application/octet-stream");
        connection.setRequestProperty("User-Agent", "StudyFlow-Android-Updater");
        try {
            int status = connection.getResponseCode();
            if (status != HttpURLConnection.HTTP_OK) {
                throw new IllegalStateException("APK download failed (HTTP " + status + ").");
            }
            if (!isTrustedGithubDownloadUrl(connection.getURL().toString())) {
                throw new IllegalStateException("GitHub redirected the APK download to an untrusted host.");
            }
            long totalBytes = connection.getContentLengthLong();
            if (totalBytes > MAX_APK_BYTES) {
                throw new IllegalStateException("The update APK is larger than the 250 MB safety limit.");
            }

            Context context = getContext();
            File directory = new File(context.getCacheDir(), "updates");
            if (!directory.exists() && !directory.mkdirs()) {
                throw new IllegalStateException("Could not prepare temporary update storage.");
            }
            File apkFile = new File(directory, "studyflow-update-" + UUID.randomUUID() + ".apk");
            long downloaded = 0;
            byte[] buffer = new byte[16384];
            sendProgress(0, 0, totalBytes);
            try (InputStream input = new BufferedInputStream(connection.getInputStream());
                 FileOutputStream output = new FileOutputStream(apkFile)) {
                int count;
                while ((count = input.read(buffer)) != -1) {
                    downloaded += count;
                    if (downloaded > MAX_APK_BYTES || (totalBytes > 0 && downloaded > totalBytes)) {
                        throw new IllegalStateException("The APK download exceeded its declared size.");
                    }
                    output.write(buffer, 0, count);
                    sendProgress(totalBytes > 0 ? Math.min(99, (int) (downloaded * 100 / totalBytes)) : -1, downloaded, totalBytes);
                }
            } catch (Exception error) {
                apkFile.delete();
                throw error;
            }
            if (downloaded == 0 || (totalBytes > 0 && downloaded != totalBytes)) {
                apkFile.delete();
                throw new IllegalStateException("The APK download was incomplete.");
            }
            sendProgress(100, downloaded, totalBytes);
            return apkFile;
        } finally {
            connection.disconnect();
        }
    }

    private void verifyApk(Context context, File apkFile, String expectedVersion) throws Exception {
        PackageManager packageManager = context.getPackageManager();
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
            ? PackageManager.GET_SIGNING_CERTIFICATES
            : PackageManager.GET_SIGNATURES;
        PackageInfo installed = packageManager.getPackageInfo(context.getPackageName(), flags);
        PackageInfo archive = packageManager.getPackageArchiveInfo(apkFile.getAbsolutePath(), flags);
        if (archive == null || !context.getPackageName().equals(archive.packageName)) {
            throw new IllegalStateException("This APK is not a StudyFlow update.");
        }
        String archiveVersion = archive.versionName == null ? "" : archive.versionName;
        if (!versionsMatch(archiveVersion, expectedVersion)) {
            throw new IllegalStateException("The APK version does not match the published GitHub release.");
        }
        if (getVersionCode(archive) <= getVersionCode(installed)) {
            throw new IllegalStateException("This APK is not newer than the installed StudyFlow version.");
        }
        Set<String> installedSignatures = signingCertificates(installed);
        Set<String> archiveSignatures = signingCertificates(archive);
        if (installedSignatures.isEmpty() || !installedSignatures.equals(archiveSignatures)) {
            throw new IllegalStateException("Android update rejected: this APK is not signed with the installed StudyFlow signing key.");
        }
    }

    private Set<String> signingCertificates(PackageInfo info) throws Exception {
        Signature[] signatures;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            if (info.signingInfo == null) return new HashSet<>();
            signatures = info.signingInfo.getApkContentsSigners();
        } else {
            signatures = info.signatures;
        }
        if (signatures == null || signatures.length == 0) return new HashSet<>();
        Set<String> certificates = new HashSet<>();
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        for (Signature signature : signatures) {
            certificates.add(Base64.encodeToString(digest.digest(signature.toByteArray()), Base64.NO_WRAP));
        }
        return certificates;
    }

    private void openInstaller(Context context, File apkFile, PluginCall call) throws Exception {
        Uri apkUri = FileProvider.getUriForFile(
            context,
            context.getPackageName() + ".fileprovider",
            apkFile
        );
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        if (intent.resolveActivity(context.getPackageManager()) == null) {
            throw new IllegalStateException("No Android package installer is available on this device.");
        }
        getActivity().runOnUiThread(() -> {
            try {
                getActivity().startActivity(intent);
                JSObject response = new JSObject();
                response.put("started", true);
                call.resolve(response);
            } catch (Exception error) {
                call.reject(
                    error.getMessage() == null ? "Android could not open the package installer." : error.getMessage(),
                    error
                );
            } finally {
                call.setKeepAlive(false);
            }
        });
    }

    private void sendProgress(int percent, long downloaded, long total) {
        JSObject progress = new JSObject();
        progress.put("percent", percent);
        progress.put("downloadedBytes", downloaded);
        progress.put("totalBytes", total);
        notifyListeners("updateDownloadProgress", progress);
    }

    private boolean isTrustedGithubUrl(String value) {
        if (value == null || value.trim().isEmpty()) return false;
        try {
            URL url = new URL(value);
            String host = url.getHost().toLowerCase();
            return "https".equalsIgnoreCase(url.getProtocol())
                && (host.equals("github.com") || host.endsWith(".github.com"));
        } catch (Exception error) {
            return false;
        }
    }

    private boolean isTrustedGithubDownloadUrl(String value) {
        if (isTrustedGithubUrl(value)) return true;
        try {
            URL url = new URL(value);
            String host = url.getHost().toLowerCase();
            return "https".equalsIgnoreCase(url.getProtocol())
                && (host.equals("release-assets.githubusercontent.com")
                    || host.equals("objects.githubusercontent.com"));
        } catch (Exception error) {
            return false;
        }
    }

    private boolean versionsMatch(String first, String second) {
        String[] left = versionParts(first);
        String[] right = versionParts(second);
        if (left == null || right == null) return false;
        for (int index = 0; index < Math.max(left.length, right.length); index += 1) {
            long leftPart = index < left.length ? Long.parseLong(left[index]) : 0;
            long rightPart = index < right.length ? Long.parseLong(right[index]) : 0;
            if (leftPart != rightPart) return false;
        }
        return true;
    }

    private String[] versionParts(String value) {
        String normalized = value == null ? "" : value.trim().replaceFirst("(?i)^v", "");
        normalized = normalized.split("[-+]", 2)[0];
        if (!normalized.matches("\\d+(\\.\\d+){0,3}")) return null;
        String[] parts = normalized.split("\\.");
        for (String part : parts) {
            try {
                Long.parseLong(part);
            } catch (NumberFormatException error) {
                return null;
            }
        }
        return parts;
    }

    private long getVersionCode(PackageInfo info) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
    }
}
