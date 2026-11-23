package com.pocketai.services;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.service.voice.VoiceInteractionSession;
import android.util.Log;

import com.pocketai.MainActivity;

/**
 * VoiceInteractionSession for PocketAI.
 * Triggered on long-press Home button, gesture corner swipe, or Samsung Side button.
 */
public class PocketAIVoiceInteractionSession extends VoiceInteractionSession {
    private static final String TAG = "PocketAIVoiceSession";

    public PocketAIVoiceInteractionSession(Context context) {
        super(context);
    }

    @Override
    public void onShow(Bundle args, int flags) {
        super.onShow(args, flags);
        Log.i(TAG, "Assistant session invoked via system gesture or key (flags=" + flags + ")");

        try {
            Intent intent = new Intent(getContext(), MainActivity.class);
            intent.setAction(Intent.ACTION_ASSIST);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK 
                          | Intent.FLAG_ACTIVITY_SINGLE_TOP 
                          | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            intent.putExtra("assistant_triggered", true);
            intent.putExtra("auto_mic", true);
            getContext().startActivity(intent);
        } catch (Exception e) {
            Log.e(TAG, "Failed to launch MainActivity from assistant session: " + e.getMessage(), e);
        } finally {
            hide();
        }
    }
}
