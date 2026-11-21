package com.pocketai.services;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.pocketai.MainApplication;

import java.util.ArrayList;
import java.util.List;

public class NotificationListener extends NotificationListenerService {
    private static final String TAG = "PocketAI_NotifListener";
    public static NotificationListener instance = null;

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        instance = this;
        Log.i(TAG, "NotificationListener connected to Android System");
    }

    @Override
    public void onListenerDisconnected() {
        instance = null;
        Log.i(TAG, "NotificationListener disconnected");
        super.onListenerDisconnected();
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || sbn.getNotification() == null) {
            return;
        }

        try {
            String packageName = sbn.getPackageName();
            // Ignore PocketAI's own notifications to avoid recursion
            if (packageName.equals(getPackageName())) {
                return;
            }

            Notification notification = sbn.getNotification();
            Bundle extras = notification.extras;
            if (extras == null) return;

            CharSequence titleChar = extras.getCharSequence(Notification.EXTRA_TITLE);
            CharSequence textChar = extras.getCharSequence(Notification.EXTRA_TEXT);

            String title = titleChar != null ? titleChar.toString() : "";
            String text = textChar != null ? textChar.toString() : "";

            if (title.isEmpty() && text.isEmpty()) {
                return;
            }

            Log.d(TAG, "Notification received from " + packageName + ": " + title + " - " + text);

            WritableMap params = extractNotificationMap(sbn);

            // Emit to React Native JavaScript layer
            try {
                MainApplication app = (MainApplication) getApplication();
                if (app != null && app.getReactNativeHost() != null && app.getReactNativeHost().hasInstance()) {
                    app.getReactNativeHost().getReactInstanceManager().getCurrentReactContext()
                        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                        .emit("onNotificationReceived", params);
                }
            } catch (Exception e) {
                Log.w(TAG, "React context not yet initialized for event: " + e.getMessage());
            }

        } catch (Exception e) {
            Log.e(TAG, "Error parsing notification: " + e.getMessage());
        }
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        // Notification dismissed by user or system
    }

    /**
     * Extracts structured fields from a single StatusBarNotification into a WritableMap.
     */
    public static WritableMap extractNotificationMap(StatusBarNotification sbn) {
        WritableMap map = Arguments.createMap();
        if (sbn == null) return map;

        String packageName = sbn.getPackageName() != null ? sbn.getPackageName() : "";
        map.putString("packageName", packageName);
        map.putString("id", sbn.getKey() != null ? sbn.getKey() : String.valueOf(sbn.getId()));
        map.putDouble("postTime", sbn.getPostTime());
        map.putBoolean("isOngoing", sbn.isOngoing());
        map.putBoolean("isClearable", sbn.isClearable());

        Notification notif = sbn.getNotification();
        if (notif != null) {
            map.putString("category", notif.category != null ? notif.category : "");
            Bundle extras = notif.extras;
            if (extras != null) {
                CharSequence title = extras.getCharSequence(Notification.EXTRA_TITLE);
                CharSequence text = extras.getCharSequence(Notification.EXTRA_TEXT);
                CharSequence subText = extras.getCharSequence(Notification.EXTRA_SUB_TEXT);
                CharSequence bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);

                map.putString("title", title != null ? title.toString() : "");
                map.putString("text", text != null ? text.toString() : (bigText != null ? bigText.toString() : ""));
                map.putString("subText", subText != null ? subText.toString() : "");
            } else {
                map.putString("title", "");
                map.putString("text", "");
                map.putString("subText", "");
            }
        } else {
            map.putString("title", "");
            map.putString("text", "");
            map.putString("subText", "");
            map.putString("category", "");
        }

        return map;
    }

    /**
     * Retrieves all currently active notifications on the phone.
     */
    public static WritableArray getActiveNotificationsArray(String myPackageName) {
        WritableArray array = Arguments.createArray();
        if (instance == null) {
            Log.w(TAG, "NotificationListener instance is null (access not granted or service unbound)");
            return array;
        }

        try {
            StatusBarNotification[] active = instance.getActiveNotifications();
            if (active != null) {
                for (StatusBarNotification sbn : active) {
                    if (sbn != null && sbn.getPackageName() != null) {
                        // Skip PocketAI's own ongoing voice/trigger notifications
                        if (myPackageName != null && sbn.getPackageName().equals(myPackageName)) {
                            continue;
                        }
                        array.pushMap(extractNotificationMap(sbn));
                    }
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to get active notifications: " + e.getMessage(), e);
        }

        return array;
    }
}
