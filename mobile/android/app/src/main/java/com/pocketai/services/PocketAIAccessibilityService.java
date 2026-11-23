package com.pocketai.services;

import android.accessibilityservice.AccessibilityService;
import android.os.Build;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import java.util.List;

/**
 * PocketAI Accessibility Service
 * Empowers autonomous phone operation: auto-clicking "Send" in WhatsApp/SMS,
 * capturing screenshots, locking screen, and toggling system panels.
 */
public class PocketAIAccessibilityService extends AccessibilityService {
    private static final String TAG = "PocketAIAccessibility";
    public static PocketAIAccessibilityService instance = null;

    // Flag to automatically click send when WhatsApp conversation opens
    public static volatile boolean shouldAutoSendWhatsApp = false;

    @Override
    public void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
        Log.i(TAG, "PocketAIAccessibilityService connected and active");
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null) return;

        CharSequence pkg = event.getPackageName();
        if (pkg == null) return;

        // Auto-click "Send" in WhatsApp if requested
        if (shouldAutoSendWhatsApp && "com.whatsapp".contentEquals(pkg)) {
            Log.d(TAG, "WhatsApp event received, searching for Send button...");
            AccessibilityNodeInfo root = getRootInActiveWindow();
            if (root != null) {
                boolean clicked = findAndClickSendButton(root);
                if (clicked) {
                    shouldAutoSendWhatsApp = false;
                    Log.i(TAG, "Auto-clicked WhatsApp Send button successfully!");
                }
                root.recycle();
            }
        }
    }

    private boolean findAndClickSendButton(AccessibilityNodeInfo node) {
        if (node == null) return false;

        // 1. Try finding by WhatsApp's known send button View IDs
        List<AccessibilityNodeInfo> sendNodes = node.findAccessibilityNodeInfosByViewId("com.whatsapp:id/send");
        if (sendNodes != null && !sendNodes.isEmpty()) {
            for (AccessibilityNodeInfo btn : sendNodes) {
                if (btn.isClickable()) {
                    btn.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                    return true;
                }
            }
        }

        // 2. Try by content description "Send"
        List<AccessibilityNodeInfo> descNodes = node.findAccessibilityNodeInfosByText("Send");
        if (descNodes != null && !descNodes.isEmpty()) {
            for (AccessibilityNodeInfo btn : descNodes) {
                if (btn.isClickable()) {
                    btn.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                    return true;
                }
            }
        }

        return false;
    }

    @Override
    public void onInterrupt() {
        Log.w(TAG, "PocketAIAccessibilityService interrupted");
    }

    @Override
    public void onDestroy() {
        instance = null;
        super.onDestroy();
        Log.i(TAG, "PocketAIAccessibilityService destroyed");
    }

    public static boolean isServiceRunning() {
        return instance != null;
    }

    // Global navigation actions
    public boolean takeScreenshot() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            return performGlobalAction(GLOBAL_ACTION_TAKE_SCREENSHOT);
        }
        return false;
    }

    public boolean lockScreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            return performGlobalAction(GLOBAL_ACTION_LOCK_SCREEN);
        }
        return false;
    }

    public boolean openNotifications() {
        return performGlobalAction(GLOBAL_ACTION_NOTIFICATIONS);
    }

    public boolean openQuickSettings() {
        return performGlobalAction(GLOBAL_ACTION_QUICK_SETTINGS);
    }

    public boolean pressBack() {
        return performGlobalAction(GLOBAL_ACTION_BACK);
    }

    public boolean pressHome() {
        return performGlobalAction(GLOBAL_ACTION_HOME);
    }

    public boolean pressRecents() {
        return performGlobalAction(GLOBAL_ACTION_RECENTS);
    }
}
