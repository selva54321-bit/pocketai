package com.pocketai.services;

import android.service.voice.VoiceInteractionService;
import android.util.Log;

/**
 * PocketAI VoiceInteractionService
 * Allows PocketAI to be selected as the phone's Default Digital Assistant.
 */
public class PocketAIVoiceInteractionService extends VoiceInteractionService {
    private static final String TAG = "PocketAIVoiceService";

    @Override
    public void onReady() {
        super.onReady();
        Log.i(TAG, "PocketAIVoiceInteractionService ready as system assistant");
    }

    @Override
    public void onShutdown() {
        Log.i(TAG, "PocketAIVoiceInteractionService shutdown");
        super.onShutdown();
    }
}
