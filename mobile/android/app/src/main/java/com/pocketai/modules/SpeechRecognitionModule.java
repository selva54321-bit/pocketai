package com.pocketai.modules;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Log;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.LifecycleEventListener;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.util.ArrayList;

import com.pocketai.services.WakeWordService;

public class SpeechRecognitionModule extends ReactContextBaseJavaModule implements RecognitionListener, LifecycleEventListener {
    private static final String TAG = "SpeechRecognition";
    private final ReactApplicationContext reactContext;
    private SpeechRecognizer speechRecognizer;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private boolean isCurrentlyListening = false;
    private int startupRetryCount = 0;
    private long listenStartTime = 0L;
    private long lastResultTime = 0;
    private String lastResultText = "";

    public SpeechRecognitionModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
        context.addLifecycleEventListener(this);
    }

    @NonNull
    @Override
    public String getName() {
        return "SpeechRecognition";
    }

    private void sendEvent(String eventName, WritableMap params) {
        if (reactContext.hasActiveReactInstance()) {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit(eventName, params);
        }
    }

    @ReactMethod
    public void addListener(String eventName) {
        // Required for RN built-in Event Emitter
    }

    @ReactMethod
    public void removeListeners(Integer count) {
        // Required for RN built-in Event Emitter
    }

    private void destroyLocalRecognizerOnly() {
        if (speechRecognizer != null) {
            try {
                speechRecognizer.stopListening();
                speechRecognizer.cancel();
                speechRecognizer.destroy();
            } catch (Exception e) {
                Log.w(TAG, "Error cleaning recognizer: " + e.getMessage());
            }
            speechRecognizer = null;
        }
        isCurrentlyListening = false;
    }

    private void cleanupRecognizer() {
        mainHandler.removeCallbacksAndMessages(null);
        destroyLocalRecognizerOnly();
        WakeWordService.resumeListening();
    }

    @ReactMethod
    public void startListening(Promise promise) {
        mainHandler.post(() -> {
            try {
                if (isCurrentlyListening && speechRecognizer != null) {
                    Log.i(TAG, "SpeechRecognizer is already active, ignoring duplicate start request");
                    promise.resolve("Already listening");
                    return;
                }

                // SYNCHRONOUSLY PAUSE WAKE WORD SERVICE SO MIC HARDWARE IS 100% FREE
                boolean hadWakeWordActive = WakeWordService.pauseForManualMic();

                if (!SpeechRecognizer.isRecognitionAvailable(reactContext)) {
                    Log.e(TAG, "SpeechRecognizer is NOT available on this device");
                    WakeWordService.resumeListening();
                    promise.reject("UNAVAILABLE", "Speech recognition is not available on this device.");
                    return;
                }

                boolean hadLocalActive = (speechRecognizer != null);
                destroyLocalRecognizerOnly();
                startupRetryCount = 0;

                long elapsedSinceWakeDestroy = System.currentTimeMillis() - WakeWordService.lastRecognizerDestroyTime;
                long handoffDelayMs = 0L;
                if (hadWakeWordActive || hadLocalActive || elapsedSinceWakeDestroy < 320L) {
                    handoffDelayMs = Math.max(80L, 320L - Math.max(0L, elapsedSinceWakeDestroy));
                }

                if (handoffDelayMs > 0) {
                    Log.i(TAG, "Waiting " + handoffDelayMs + "ms for WakeWord audio handoff before starting manual mic");
                    isCurrentlyListening = true;
                    mainHandler.postDelayed(() -> beginRecognizerSession(promise), handoffDelayMs);
                } else {
                    beginRecognizerSession(promise);
                }
            } catch (Exception e) {
                cleanupRecognizer();
                Log.e(TAG, "startListening failed: " + e.getMessage(), e);
                promise.reject("START_ERROR", e.getMessage());
            }
        });
    }

    private void beginRecognizerSession(Promise promise) {
        try {
            if (!WakeWordService.isPausedForManualMic) {
                WakeWordService.pauseForManualMic();
            }
            destroyLocalRecognizerOnly();

            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(reactContext);
            speechRecognizer.setRecognitionListener(this);

            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
            intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, reactContext.getPackageName());

            // EXTENDED SILENCE TIMEOUTS (Prevents premature mic cutoff)
            intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 3500L);
            intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 2500L);
            intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 2000L);

            listenStartTime = System.currentTimeMillis();
            speechRecognizer.startListening(intent);
            isCurrentlyListening = true;
            Log.i(TAG, "SpeechRecognizer started listening successfully (retry=" + startupRetryCount + ")");
            if (promise != null) {
                promise.resolve("Listening started");
            }
        } catch (Exception e) {
            cleanupRecognizer();
            Log.e(TAG, "beginRecognizerSession failed: " + e.getMessage(), e);
            if (promise != null) {
                promise.reject("START_ERROR", e.getMessage());
            } else {
                WritableMap map = Arguments.createMap();
                map.putInt("error", -1);
                map.putString("message", "Speech recognition failed: " + e.getMessage());
                sendEvent("onSpeechError", map);
            }
        }
    }

    @ReactMethod
    public void stopListening(Promise promise) {
        mainHandler.post(() -> {
            try {
                Log.i(TAG, "stopListening invoked");
                cleanupRecognizer();
                promise.resolve("Listening stopped");
            } catch (Exception e) {
                Log.e(TAG, "stopListening failed: " + e.getMessage(), e);
                promise.reject("STOP_ERROR", e.getMessage());
            }
        });
    }

    // RecognitionListener callbacks
    @Override
    public void onReadyForSpeech(Bundle params) {
        startupRetryCount = 0;
        Log.i(TAG, "onReadyForSpeech");
        WritableMap map = Arguments.createMap();
        map.putString("status", "ready");
        sendEvent("onSpeechReady", map);
    }

    @Override
    public void onBeginningOfSpeech() {
        Log.i(TAG, "onBeginningOfSpeech");
        WritableMap map = Arguments.createMap();
        map.putString("status", "speaking");
        sendEvent("onSpeechStart", map);
    }

    @Override
    public void onRmsChanged(float rmsdB) {}

    @Override
    public void onBufferReceived(byte[] buffer) {}

    @Override
    public void onEndOfSpeech() {
        Log.i(TAG, "onEndOfSpeech");
        isCurrentlyListening = false;
        WritableMap map = Arguments.createMap();
        map.putString("status", "ended");
        sendEvent("onSpeechEnd", map);
    }

    @Override
    public void onError(int error) {
        Log.w(TAG, "onError code: " + error + " (elapsed=" + (System.currentTimeMillis() - listenStartTime) + "ms)");
        if ((error == 11 || error == 8)
                && (System.currentTimeMillis() - listenStartTime < 1000L)
                && startupRetryCount < 2) {
            startupRetryCount++;
            Log.i(TAG, "Transient recognizer busy/disconnected error " + error + ", auto-retrying (" + startupRetryCount + "/2)...");
            destroyLocalRecognizerOnly();
            isCurrentlyListening = true;
            mainHandler.postDelayed(() -> beginRecognizerSession(null), 320L);
            return;
        }
        cleanupRecognizer();
        WritableMap map = Arguments.createMap();
        map.putInt("error", error);
        map.putString("message", "Speech recognition code: " + error);
        sendEvent("onSpeechError", map);
    }

    @Override
    public void onResults(Bundle results) {
        isCurrentlyListening = false;
        ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        String recognized = (matches != null && !matches.isEmpty()) ? matches.get(0) : "";
        Log.i(TAG, "onResults: '" + recognized + "'");
        cleanupRecognizer();

        long now = System.currentTimeMillis();
        if (!recognized.isEmpty() && recognized.equalsIgnoreCase(lastResultText) && (now - lastResultTime < 2500)) {
            Log.w(TAG, "SpeechRecognizer: ignoring duplicate onResults within 2.5s: '" + recognized + "'");
            return;
        }
        lastResultText = recognized;
        lastResultTime = now;

        WritableMap map = Arguments.createMap();
        map.putString("text", recognized);
        sendEvent("onSpeechResult", map);
    }

    @Override
    public void onPartialResults(Bundle partialResults) {
        ArrayList<String> matches = partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (matches != null && !matches.isEmpty()) {
            String partial = matches.get(0);
            Log.d(TAG, "onPartialResults: '" + partial + "'");
            WritableMap map = Arguments.createMap();
            map.putString("partialText", partial);
            sendEvent("onSpeechPartial", map);
        }
    }

    @Override
    public void onEvent(int eventType, Bundle params) {}

    // LifecycleEventListener callbacks to ensure zero microphone lingering
    @Override
    public void onHostResume() {}

    @Override
    public void onHostPause() {
        Log.i(TAG, "onHostPause: App minimized or locked - destroying speech recognizer immediately");
        cleanupRecognizer();
    }

    @Override
    public void onHostDestroy() {
        Log.i(TAG, "onHostDestroy: Cleaning up speech recognizer");
        cleanupRecognizer();
    }
}
