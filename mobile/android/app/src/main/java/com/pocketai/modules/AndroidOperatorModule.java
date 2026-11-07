package com.pocketai.modules;

import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.AlarmClock;
import android.provider.Settings;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;

public class AndroidOperatorModule extends ReactContextBaseJavaModule {
    private final ReactApplicationContext reactContext;

    public AndroidOperatorModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
    }

    @NonNull
    @Override
    public String getName() {
        return "AndroidOperator";
    }

    @ReactMethod
    public void openApp(String packageName, Promise promise) {
        try {
            PackageManager pm = reactContext.getPackageManager();
            Intent launchIntent = pm.getLaunchIntentForPackage(packageName);
            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                reactContext.startActivity(launchIntent);
                promise.resolve("App opened: " + packageName);
            } else {
                // Fallback: search on Play Store
                Intent storeIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + packageName));
                storeIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                if (storeIntent.resolveActivity(pm) != null) {
                    reactContext.startActivity(storeIntent);
                    promise.resolve("Opened Play Store for: " + packageName);
                } else {
                    promise.reject("APP_NOT_FOUND", "Could not find package: " + packageName);
                }
            }
        } catch (Exception e) {
            promise.reject("OPEN_APP_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void setBrightness(int levelPercent, Promise promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                if (!Settings.System.canWrite(reactContext)) {
                    // Open write settings permission prompt
                    Intent intent = new Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS);
                    intent.setData(Uri.parse("package:" + reactContext.getPackageName()));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    reactContext.startActivity(intent);
                    promise.reject("PERMISSION_DENIED", "WRITE_SETTINGS permission required. Opened system settings.");
                    return;
                }
            }

            int clamped = Math.max(0, Math.min(100, levelPercent));
            int sysBrightness = (int) ((clamped / 100.0) * 255);

            Settings.System.putInt(
                reactContext.getContentResolver(),
                Settings.System.SCREEN_BRIGHTNESS,
                sysBrightness
            );
            promise.resolve("Brightness set to " + clamped + "%");
        } catch (Exception e) {
            promise.reject("BRIGHTNESS_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void setDoNotDisturb(boolean enable, Promise promise) {
        try {
            NotificationManager nm = (NotificationManager) reactContext.getSystemService(Context.NOTIFICATION_SERVICE);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                if (!nm.isNotificationPolicyAccessGranted()) {
                    Intent intent = new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    reactContext.startActivity(intent);
                    promise.reject("PERMISSION_DENIED", "DND access policy required. Opened settings.");
                    return;
                }

                int filter = enable ? NotificationManager.INTERRUPTION_FILTER_PRIORITY : NotificationManager.INTERRUPTION_FILTER_ALL;
                nm.setInterruptionFilter(filter);
                promise.resolve("Do Not Disturb set to: " + (enable ? "ON" : "OFF"));
            } else {
                promise.resolve("DND not supported on this Android API version.");
            }
        } catch (Exception e) {
            promise.reject("DND_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void startTimer(int seconds, String label, boolean skipUi, Promise promise) {
        try {
            Intent intent = new Intent(AlarmClock.ACTION_SET_TIMER);
            intent.putExtra(AlarmClock.EXTRA_LENGTH, seconds);
            intent.putExtra(AlarmClock.EXTRA_MESSAGE, label != null ? label : "Timer");
            intent.putExtra(AlarmClock.EXTRA_SKIP_UI, skipUi);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            if (intent.resolveActivity(reactContext.getPackageManager()) != null) {
                reactContext.startActivity(intent);
                promise.resolve("Timer set for " + seconds + " seconds.");
            } else {
                promise.reject("NO_CLOCK_APP", "No app available to handle timer intent.");
            }
        } catch (Exception e) {
            promise.reject("TIMER_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void openBatterySaverSettings(Promise promise) {
        try {
            Intent intent = new Intent(Settings.ACTION_BATTERY_SAVER_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            reactContext.startActivity(intent);
            promise.resolve("Opened Battery Saver Settings.");
        } catch (Exception e) {
            promise.reject("BATTERY_SAVER_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void checkPermissions(Promise promise) {
        WritableMap map = Arguments.createMap();
        boolean canWriteSettings = false;
        boolean hasDndPolicy = false;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            canWriteSettings = Settings.System.canWrite(reactContext);
            NotificationManager nm = (NotificationManager) reactContext.getSystemService(Context.NOTIFICATION_SERVICE);
            hasDndPolicy = nm != null && nm.isNotificationPolicyAccessGranted();
        }

        map.putBoolean("canWriteSettings", canWriteSettings);
        map.putBoolean("hasDndPolicy", hasDndPolicy);
        promise.resolve(map);
    }
}
