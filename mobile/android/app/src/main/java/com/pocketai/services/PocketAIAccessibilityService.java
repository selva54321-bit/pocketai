package com.pocketai.services;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.graphics.Path;
import android.graphics.Rect;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import java.util.List;

/**
 * PocketAI Accessibility Service
 * Empowers autonomous phone operation: auto-clicking "Send" in WhatsApp/SMS,
 * auto-playing the first video on YouTube & first track on Spotify,
 * capturing screenshots, locking screen, and toggling system panels.
 */
public class PocketAIAccessibilityService extends AccessibilityService {
    private static final String TAG = "PocketAIAccessibility";
    public static PocketAIAccessibilityService instance = null;

    // Flag to automatically click send when WhatsApp conversation opens
    public static volatile boolean shouldAutoSendWhatsApp = false;

    // Auto-play flags for YouTube & Spotify search results
    private static volatile boolean pendingYouTubeAutoPlay = false;
    private static int youTubeAttempts = 0;

    private static volatile boolean pendingSpotifyAutoPlay = false;
    private static int spotifyAttempts = 0;
    private static boolean spotifyClickedContainer = false;

    private final Handler handler = new Handler(Looper.getMainLooper());

    public static void requestYouTubeAutoPlay() {
        Log.i(TAG, "YouTube auto-play requested (serviceConnected=" + (instance != null) + ")");
        pendingSpotifyAutoPlay = false;
        pendingYouTubeAutoPlay = true;
        youTubeAttempts = 0;
        if (instance != null) {
            instance.handler.removeCallbacks(instance.youTubePollRunnable);
            instance.handler.postDelayed(instance.youTubePollRunnable, 900L);
        }
    }

    public static void requestSpotifyAutoPlay() {
        Log.i(TAG, "Spotify auto-play requested (serviceConnected=" + (instance != null) + ")");
        pendingYouTubeAutoPlay = false;
        pendingSpotifyAutoPlay = true;
        spotifyAttempts = 0;
        spotifyClickedContainer = false;
        if (instance != null) {
            instance.handler.removeCallbacks(instance.spotifyPollRunnable);
            instance.handler.postDelayed(instance.spotifyPollRunnable, 900L);
        }
    }

    private final Runnable youTubePollRunnable = new Runnable() {
        @Override
        public void run() {
            if (!pendingYouTubeAutoPlay) return;
            AccessibilityNodeInfo root = getRootInActiveWindow();
            boolean clicked = false;
            if (root != null) {
                try {
                    CharSequence pkg = root.getPackageName();
                    if (pkg != null && "com.google.android.youtube".contentEquals(pkg)) {
                        clicked = findAndClickFirstYouTubeVideo(root);
                    }
                } finally {
                    root.recycle();
                }
            }
            if (clicked) {
                pendingYouTubeAutoPlay = false;
                Log.i(TAG, "Auto-clicked first YouTube video result!");
            } else {
                if (youTubeAttempts == 3 || youTubeAttempts == 10) {
                    dumpClickableNodes(root, "YT_DEBUG");
                }
                if (youTubeAttempts < 14) {
                    youTubeAttempts++;
                    handler.postDelayed(this, 350L);
                } else {
                    pendingYouTubeAutoPlay = false;
                    Log.w(TAG, "Timed out waiting for clickable YouTube first video card");
                }
            }
        }
    };

    private final Runnable spotifyPollRunnable = new Runnable() {
        @Override
        public void run() {
            if (!pendingSpotifyAutoPlay) return;
            AccessibilityNodeInfo root = getRootInActiveWindow();
            boolean done = false;
            if (root != null) {
                try {
                    CharSequence pkg = root.getPackageName();
                    if (pkg != null && "com.spotify.music".contentEquals(pkg)) {
                        if (!spotifyClickedContainer) {
                            int result = findAndClickFirstSpotifyTrack(root);
                            if (result == 1) {
                                // Clicked an actual Song row: playback starts immediately!
                                done = true;
                                Log.i(TAG, "Auto-clicked first Spotify Song row!");
                            } else if (result == 2) {
                                // Clicked top Playlist/Album container row: wait for Playlist screen & click Play
                                spotifyClickedContainer = true;
                                Log.i(TAG, "Auto-clicked Spotify top result container, waiting for Play button...");
                                handler.postDelayed(this, 900L);
                                return;
                            }
                        } else {
                            if (findAndClickSpotifyPlayButton(root)) {
                                done = true;
                                Log.i(TAG, "Auto-clicked Spotify Play button!");
                            }
                        }
                    }
                } finally {
                    root.recycle();
                }
            }
            if (done) {
                pendingSpotifyAutoPlay = false;
            } else if (spotifyAttempts < 14) {
                spotifyAttempts++;
                handler.postDelayed(this, 350L);
            } else {
                pendingSpotifyAutoPlay = false;
                Log.w(TAG, "Timed out waiting for clickable Spotify track");
            }
        }
    };

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

    private boolean findAndClickFirstYouTubeVideo(AccessibilityNodeInfo root) {
        if (root == null) return false;

        // Check every visible app:id/results container first (YouTube can have multiple id/results views)
        List<AccessibilityNodeInfo> resultsContainers = root.findAccessibilityNodeInfosByViewId("com.google.android.youtube:id/results");
        if (resultsContainers != null) {
            for (AccessibilityNodeInfo container : resultsContainers) {
                if (container != null && container.isVisibleToUser()) {
                    Rect r = new Rect();
                    container.getBoundsInScreen(r);
                    if (r.width() >= 500 && r.height() >= 400) {
                        if (clickFirstValidYouTubeCard(container, 0)) {
                            return true;
                        }
                    }
                }
            }
        }

        // Fallback: scan whole active root tree
        return clickFirstValidYouTubeCard(root, 0);
    }

    private void dumpClickableNodes(AccessibilityNodeInfo node, String prefix) {
        if (node == null) {
            Log.d(TAG, prefix + ": root is null");
            return;
        }
        Log.d(TAG, prefix + ": pkg=" + node.getPackageName() + " childCount=" + node.getChildCount());
        dumpNodeRecursive(node, 0, prefix, new int[]{0});
    }

    private void dumpNodeRecursive(AccessibilityNodeInfo node, int depth, String prefix, int[] printed) {
        if (node == null || depth > 25 || printed[0] >= 25) return;
        Rect r = new Rect();
        node.getBoundsInScreen(r);
        if (node.isClickable() && r.height() >= 80 && r.width() >= 200) {
            Log.d(TAG, prefix + " d=" + depth + " cls=" + node.getClassName()
                + " vis=" + node.isVisibleToUser() + " bounds=" + r.toShortString()
                + " desc=" + node.getContentDescription() + " text=" + node.getText());
            printed[0]++;
        }
        for (int i = 0; i < node.getChildCount(); i++) {
            dumpNodeRecursive(node.getChild(i), depth + 1, prefix, printed);
        }
    }

    private boolean clickFirstValidYouTubeCard(AccessibilityNodeInfo node, int depth) {
        if (node == null || depth > 28) return false;

        if (node.isClickable() && node.isVisibleToUser()) {
            Rect rect = new Rect();
            node.getBoundsInScreen(rect);
            // Full YouTube video card or wide row: top >= 200, bottom <= 2150, wide >= 450, tall >= 180
            if (rect.top >= 200 && rect.bottom <= 2200 && rect.width() >= 450 && rect.height() >= 180) {
                if (!isYouTubeAdOrShorts(node, 0) && hasDescendantContent(node, 0)) {
                    boolean clicked = node.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                    if (!clicked) {
                        clicked = performGestureTap(rect.centerX(), rect.top + Math.min(200, rect.height() / 3f));
                    }
                    if (clicked) {
                        Log.i(TAG, "Clicked YouTube first video card bounds=" + rect.toShortString() + " depth=" + depth);
                        return true;
                    }
                }
            }
        }

        int count = node.getChildCount();
        for (int i = 0; i < count; i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) {
                boolean clicked = clickFirstValidYouTubeCard(child, depth + 1);
                if (clicked) return true;
            }
        }
        return false;
    }

    private boolean performGestureTap(float x, float y) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false;
        Path path = new Path();
        path.moveTo(x, y);
        GestureDescription.Builder builder = new GestureDescription.Builder();
        builder.addStroke(new GestureDescription.StrokeDescription(path, 0, 50));
        return dispatchGesture(builder.build(), null, null);
    }

    private boolean isYouTubeAdOrShorts(AccessibilityNodeInfo node, int depth) {
        if (node == null || depth > 5) return false;
        CharSequence desc = node.getContentDescription();
        CharSequence text = node.getText();
        if (desc != null) {
            String d = desc.toString().trim().toLowerCase();
            if (d.startsWith("sponsored") || d.equals("ad") || d.equals("shorts") || d.startsWith("shorts shelf")) {
                return true;
            }
        }
        if (text != null) {
            String t = text.toString().trim().toLowerCase();
            if (t.equals("sponsored") || t.equals("ad") || t.equals("shorts")) {
                return true;
            }
        }
        int count = node.getChildCount();
        for (int i = 0; i < count; i++) {
            if (isYouTubeAdOrShorts(node.getChild(i), depth + 1)) {
                return true;
            }
        }
        return false;
    }

    private boolean hasDescendantContent(AccessibilityNodeInfo node, int depth) {
        if (node == null || depth > 6) return false;
        if (node.getContentDescription() != null && !node.getContentDescription().toString().trim().isEmpty()) {
            return true;
        }
        if (node.getText() != null && !node.getText().toString().trim().isEmpty()) {
            return true;
        }
        int count = node.getChildCount();
        for (int i = 0; i < count; i++) {
            if (hasDescendantContent(node.getChild(i), depth + 1)) return true;
        }
        return false;
    }

    /**
     * Returns:
     *   0 = nothing clickable found yet
     *   1 = clicked a Song row directly (playback starts immediately)
     *   2 = clicked top Playlist/Album container row (needs follow-up Play button click)
     */
    private int findAndClickFirstSpotifyTrack(AccessibilityNodeInfo root) {
        if (root == null) return 0;

        List<AccessibilityNodeInfo> rows = root.findAccessibilityNodeInfosByViewId("com.spotify.music:id/row_root");
        if (rows == null || rows.isEmpty()) return 0;

        AccessibilityNodeInfo firstFallbackRow = null;

        for (AccessibilityNodeInfo row : rows) {
            if (row == null || !row.isClickable() || !row.isVisibleToUser()) continue;
            Rect rect = new Rect();
            row.getBoundsInScreen(rect);
            if (rect.top < 350) continue; // Skip filter chips / header

            if (firstFallbackRow == null) {
                firstFallbackRow = row;
            }

            List<AccessibilityNodeInfo> subtitles = row.findAccessibilityNodeInfosByViewId("com.spotify.music:id/subtitle");
            if (subtitles != null && !subtitles.isEmpty() && subtitles.get(0).getText() != null) {
                String sub = subtitles.get(0).getText().toString().trim().toLowerCase();
                if (sub.startsWith("song") || sub.contains("• song") || sub.startsWith("episode")) {
                    if (row.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                        return 1;
                    }
                }
            }
        }

        // Fallback: click the top result row (e.g., Top Playlist / Album / Artist)
        if (firstFallbackRow != null && firstFallbackRow.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
            return 2;
        }
        return 0;
    }

    private boolean findAndClickSpotifyPlayButton(AccessibilityNodeInfo root) {
        if (root == null) return false;
        List<AccessibilityNodeInfo> playBtns = root.findAccessibilityNodeInfosByViewId("com.spotify.music:id/button_play_and_pause");
        if (playBtns != null) {
            for (AccessibilityNodeInfo btn : playBtns) {
                if (btn != null && btn.isClickable() && btn.isVisibleToUser()) {
                    Rect r = new Rect();
                    btn.getBoundsInScreen(r);
                    // Prefer the primary Play button above the mini-player bar
                    if (r.bottom < 1900 && btn.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                        return true;
                    }
                }
            }
        }
        return false;
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
        handler.removeCallbacksAndMessages(null);
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
