package com.pocketai.services;

import android.os.Bundle;
import android.service.voice.VoiceInteractionSession;
import android.service.voice.VoiceInteractionSessionService;

/**
 * Session service that instantiates PocketAIVoiceInteractionSession
 * when the user triggers the assistant via Home button or Samsung Side Button.
 */
public class PocketAIVoiceInteractionSessionService extends VoiceInteractionSessionService {
    @Override
    public VoiceInteractionSession onNewSession(Bundle args) {
        return new PocketAIVoiceInteractionSession(this);
    }
}
