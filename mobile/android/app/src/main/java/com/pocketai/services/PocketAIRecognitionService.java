package com.pocketai.services;

import android.content.Intent;
import android.speech.RecognitionService;
import android.util.Log;

/**
 * RecognitionService required by Android's VoiceInteractionService specification.
 */
public class PocketAIRecognitionService extends RecognitionService {
    private static final String TAG = "PocketAIRecognition";

    @Override
    protected void onStartListening(Intent recognizerIntent, Callback listener) {
        Log.i(TAG, "onStartListening");
    }

    @Override
    protected void onCancel(Callback listener) {
        Log.i(TAG, "onCancel");
    }

    @Override
    protected void onStopListening(Callback listener) {
        Log.i(TAG, "onStopListening");
    }
}
