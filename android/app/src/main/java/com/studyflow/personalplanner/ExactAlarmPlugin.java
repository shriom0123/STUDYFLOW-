package com.studyflow.personalplanner;

import android.app.AlarmManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ExactAlarm")
public class ExactAlarmPlugin extends Plugin {
    @PluginMethod
    public void checkExactAlarmPermission(PluginCall call) {
        JSObject response = new JSObject();
        boolean supported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S;
        boolean granted = !supported;

        if (supported) {
            Context context = getActivity() != null ? getActivity() : getContext();
            if (context != null) {
                AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
                granted = alarmManager != null && alarmManager.canScheduleExactAlarms();
            }
        }

        response.put("available", supported);
        response.put("granted", granted);
        response.put("supported", supported);
        call.resolve(response);
    }

    @PluginMethod
    public void openExactAlarmSettings(PluginCall call) {
        JSObject response = new JSObject();
        Context context = getActivity() != null ? getActivity() : getContext();
        if (context == null) {
            response.put("opened", false);
            response.put("supported", false);
            call.resolve(response);
            return;
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            response.put("opened", false);
            response.put("supported", false);
            response.put("message", "Exact alarm settings are not available before Android 12.");
            call.resolve(response);
            return;
        }

        Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
        intent.setData(Uri.parse("package:" + context.getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        if (intent.resolveActivity(context.getPackageManager()) != null) {
            context.startActivity(intent);
            response.put("opened", true);
            response.put("supported", true);
        } else {
            Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            fallback.setData(Uri.parse("package:" + context.getPackageName()));
            fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (fallback.resolveActivity(context.getPackageManager()) != null) {
                context.startActivity(fallback);
                response.put("opened", true);
                response.put("supported", true);
                response.put("fallback", true);
            } else {
                response.put("opened", false);
                response.put("supported", true);
                response.put("message", "No suitable Android settings screen was found.");
            }
        }

        call.resolve(response);
    }
}
