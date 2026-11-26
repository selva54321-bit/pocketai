package com.pocketai.modules;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;

import com.chaquo.python.PyObject;
import com.chaquo.python.Python;
import com.chaquo.python.android.AndroidPlatform;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class PocketAIAgentModule extends ReactContextBaseJavaModule {
    private static final String TAG = "PocketAIAgentModule";
    private static final String WEIGHTS_FILENAME = "needle3.cact";

    private final ReactApplicationContext reactContext;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private PyObject pyAgent = null;
    private boolean isInitialized = false;

    public PocketAIAgentModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @NonNull
    @Override
    public String getName() {
        return "PocketAIAgent";
    }

    private File ensureAssetExtracted(String assetName) throws IOException {
        Context ctx = reactContext.getApplicationContext();
        File outFile = new File(ctx.getFilesDir(), assetName);

        // Verify if already extracted and non-empty
        if (outFile.exists() && outFile.length() > 1024 * 1024) {
            return outFile;
        }

        Log.i(TAG, "Extracting " + assetName + " from APK assets to " + outFile.getAbsolutePath());
        long start = System.currentTimeMillis();
        try (InputStream is = ctx.getAssets().open(assetName);
             FileOutputStream fos = new FileOutputStream(outFile)) {
            byte[] buffer = new byte[65536];
            int read;
            while ((read = is.read(buffer)) != -1) {
                fos.write(buffer, 0, read);
            }
            fos.flush();
        }
        Log.i(TAG, "Extracted " + assetName + " in " + (System.currentTimeMillis() - start) + "ms (" + outFile.length() + " bytes)");
        return outFile;
    }

    private synchronized void ensurePythonInitialized() throws Exception {
        if (isInitialized && pyAgent != null) {
            return;
        }

        long bootStart = System.currentTimeMillis();
        // 1. Pre-load native libcactus.so directly into process memory via Android linker
        try {
            System.loadLibrary("cactus");
            Log.i(TAG, "Loaded native libcactus.so successfully");
        } catch (UnsatisfiedLinkError ule) {
            Log.w(TAG, "System.loadLibrary('cactus') warning (falling back to CACTUS_LIB_PATH): " + ule.getMessage());
        }

        // 2. Ensure Needle 3 weights are unpacked on internal storage
        File weightsFile = ensureAssetExtracted(WEIGHTS_FILENAME);

        // 3. Start Chaquopy Python runtime
        if (!Python.isStarted()) {
            Python.start(new AndroidPlatform(reactContext.getApplicationContext()));
            Log.i(TAG, "Chaquopy Python runtime started");
        }

        // 4. Configure environment variables for Cactus & Needle 3
        Python py = Python.getInstance();
        PyObject osModule = py.getModule("os");
        PyObject environ = osModule.get("environ");

        environ.callAttr("__setitem__", "CACTUS_TELEMETRY", "0");
        environ.callAttr("__setitem__", "CACTUS_NEEDLE_WEIGHTS", weightsFile.getAbsolutePath());

        File nativeLibFile = new File(reactContext.getApplicationInfo().nativeLibraryDir, "libcactus.so");
        String libPath = nativeLibFile.exists() ? nativeLibFile.getAbsolutePath() : "libcactus.so";
        environ.callAttr("__setitem__", "CACTUS_LIB_PATH", libPath);

        // 5. Initialize PocketAIAgent singleton
        PyObject agentModule = py.getModule("app.agent");
        pyAgent = agentModule.callAttr("PocketAIAgent");
        isInitialized = true;

        Log.i(TAG, "Embedded PocketAIAgent initialized in-process in " + (System.currentTimeMillis() - bootStart) + "ms!");
    }

    @ReactMethod
    public void warmUp(Promise promise) {
        executor.execute(() -> {
            try {
                ensurePythonInitialized();
                promise.resolve(true);
            } catch (Exception e) {
                Log.e(TAG, "WarmUp error: " + e.getMessage(), e);
                promise.reject("WARMUP_ERROR", e.getMessage(), e);
            }
        });
    }

    @ReactMethod
    public void checkHealth(Promise promise) {
        executor.execute(() -> {
            try {
                ensurePythonInitialized();
                WritableMap map = Arguments.createMap();
                map.putString("status", "healthy");
                map.putString("agent", "Needle 3 (On-Device Embedded)");
                map.putBoolean("embedded", true);
                promise.resolve(map);
            } catch (Exception e) {
                Log.e(TAG, "Health check error: " + e.getMessage(), e);
                promise.reject("HEALTH_ERROR", e.getMessage(), e);
            }
        });
    }

    @ReactMethod
    public void query(String queryText, Promise promise) {
        executor.execute(() -> {
            try {
                ensurePythonInitialized();
                long start = System.currentTimeMillis();
                PyObject jsonRes = pyAgent.callAttr("process_query_json", queryText);
                Log.i(TAG, "In-process Python query completed in " + (System.currentTimeMillis() - start) + "ms");
                promise.resolve(jsonRes.toString());
            } catch (Exception e) {
                Log.e(TAG, "Query execution error: " + e.getMessage(), e);
                promise.reject("QUERY_ERROR", e.getMessage(), e);
            }
        });
    }

    @ReactMethod
    public void processNotification(String title, String text, String packageName, Promise promise) {
        executor.execute(() -> {
            try {
                ensurePythonInitialized();
                PyObject jsonRes = pyAgent.callAttr("process_notification_json", title, text, packageName);
                promise.resolve(jsonRes.toString());
            } catch (Exception e) {
                Log.e(TAG, "Notification analysis error: " + e.getMessage(), e);
                promise.reject("NOTIFICATION_ERROR", e.getMessage(), e);
            }
        });
    }

    @ReactMethod
    public void prioritizeNotifications(String notificationsJson, Promise promise) {
        executor.execute(() -> {
            try {
                ensurePythonInitialized();
                PyObject jsonRes = pyAgent.callAttr("prioritize_notifications_json", notificationsJson);
                promise.resolve(jsonRes.toString());
            } catch (Exception e) {
                Log.e(TAG, "Prioritization error: " + e.getMessage(), e);
                promise.reject("PRIORITIZE_ERROR", e.getMessage(), e);
            }
        });
    }
}
