package com.pocketai.modules;

import android.speech.tts.TextToSpeech;
import android.util.Log;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

import java.util.Locale;

/**
 * TextToSpeech module allowing PocketAI Jackie to speak voice responses aloud.
 */
public class TextToSpeechModule extends ReactContextBaseJavaModule implements TextToSpeech.OnInitListener {
    private static final String TAG = "TextToSpeechModule";
    private final ReactApplicationContext reactContext;
    private TextToSpeech tts;
    private boolean isInitialized = false;

    public TextToSpeechModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
        this.tts = new TextToSpeech(context, this);
    }

    @NonNull
    @Override
    public String getName() {
        return "TextToSpeech";
    }

    @Override
    public void onInit(int status) {
        if (status == TextToSpeech.SUCCESS) {
            int result = tts.setLanguage(Locale.getDefault());
            if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                tts.setLanguage(Locale.US);
            }
            tts.setPitch(1.0f);
            tts.setSpeechRate(1.05f);
            isInitialized = true;
            Log.i(TAG, "TextToSpeech initialized successfully");
        } else {
            Log.e(TAG, "TextToSpeech initialization failed with status: " + status);
        }
    }

    @ReactMethod
    public void speak(String text, Promise promise) {
        if (!isInitialized || tts == null) {
            if (promise != null) promise.reject("NOT_READY", "TextToSpeech not initialized yet");
            return;
        }
        if (text == null || text.trim().isEmpty()) {
            if (promise != null) promise.resolve(false);
            return;
        }

        try {
            int result = tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "pocketai_utterance_" + System.currentTimeMillis());
            if (promise != null) promise.resolve(result == TextToSpeech.SUCCESS);
        } catch (Exception e) {
            Log.e(TAG, "TTS speak error: " + e.getMessage(), e);
            if (promise != null) promise.reject("SPEAK_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void stop(Promise promise) {
        if (tts != null) {
            tts.stop();
        }
        if (promise != null) promise.resolve(true);
    }

    @ReactMethod
    public void isSpeaking(Promise promise) {
        if (tts != null) {
            promise.resolve(tts.isSpeaking());
        } else {
            promise.resolve(false);
        }
    }
}
