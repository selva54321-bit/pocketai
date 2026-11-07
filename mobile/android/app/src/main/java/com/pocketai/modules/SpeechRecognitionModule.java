package com.pocketai.modules;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.util.ArrayList;

public class SpeechRecognitionModule extends ReactContextBaseJavaModule implements RecognitionListener {
    private final ReactApplicationContext reactContext;
    private SpeechRecognizer speechRecognizer;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    public SpeechRecognitionModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
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
    public void startListening(Promise promise) {
        mainHandler.post(() -> {
            try {
                if (!SpeechRecognizer.isRecognitionAvailable(reactContext)) {
                    promise.reject("UNAVAILABLE", "Speech recognition is not available on this device.");
                    return;
                }

                if (speechRecognizer != null) {
                    speechRecognizer.destroy();
                }

                speechRecognizer = SpeechRecognizer.createSpeechRecognizer(reactContext);
                speechRecognizer.setRecognitionListener(this);

                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
                intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);

                speechRecognizer.startListening(intent);
                promise.resolve("Listening started");
            } catch (Exception e) {
                promise.reject("START_ERROR", e.getMessage());
            }
        });
    }

    @ReactMethod
    public void stopListening(Promise promise) {
        mainHandler.post(() -> {
            try {
                if (speechRecognizer != null) {
                    speechRecognizer.stopListening();
                }
                promise.resolve("Listening stopped");
            } catch (Exception e) {
                promise.reject("STOP_ERROR", e.getMessage());
            }
        });
    }

    // RecognitionListener callbacks
    @Override
    public void onReadyForSpeech(Bundle params) {
        WritableMap map = Arguments.createMap();
        map.putString("status", "ready");
        sendEvent("onSpeechReady", map);
    }

    @Override
    public void onBeginningOfSpeech() {
        WritableMap map = Arguments.createMap();
        map.putString("status", "speaking");
        sendEvent("onSpeechStart", map);
    }

    @Override
    public void onRmsChanged(float rmsdB) {
        // Can be used for audio waveform animation
    }

    @Override
    public void onBufferReceived(byte[] buffer) {}

    @Override
    public void onEndOfSpeech() {
        WritableMap map = Arguments.createMap();
        map.putString("status", "ended");
        sendEvent("onSpeechEnd", map);
    }

    @Override
    public void onError(int error) {
        WritableMap map = Arguments.createMap();
        map.putInt("error", error);
        map.putString("message", "Speech recognition error code: " + error);
        sendEvent("onSpeechError", map);
    }

    @Override
    public void onResults(Bundle results) {
        ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        WritableMap map = Arguments.createMap();
        if (matches != null && !matches.isEmpty()) {
            map.putString("text", matches.get(0));
        } else {
            map.putString("text", "");
        }
        sendEvent("onSpeechResult", map);
    }

    @Override
    public void onPartialResults(Bundle partialResults) {
        ArrayList<String> matches = partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (matches != null && !matches.isEmpty()) {
            WritableMap map = Arguments.createMap();
            map.putString("partialText", matches.get(0));
            sendEvent("onSpeechPartial", map);
        }
    }

    @Override
    public void onEvent(int eventType, Bundle params) {}
}
