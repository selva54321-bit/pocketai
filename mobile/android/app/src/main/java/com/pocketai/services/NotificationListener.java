package com.pocketai.services;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.pocketai.MainApplication;

public class NotificationListener extends NotificationListenerService {
    private static final String TAG = "PocketAI_NotifListener";

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

            WritableMap params = Arguments.createMap();
            params.putString("packageName", packageName);
            params.putString("title", title);
            params.putString("text", text);
            params.putDouble("postTime", sbn.getPostTime());
            params.putString("id", sbn.getKey());

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
}
