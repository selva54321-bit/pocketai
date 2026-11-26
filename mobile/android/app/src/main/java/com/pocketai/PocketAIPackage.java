package com.pocketai;

import androidx.annotation.NonNull;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;
import com.pocketai.modules.AndroidOperatorModule;
import com.pocketai.modules.PocketAIAgentModule;
import com.pocketai.modules.SpeechRecognitionModule;
import com.pocketai.modules.TextToSpeechModule;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class PocketAIPackage implements ReactPackage {
    @NonNull
    @Override
    public List<NativeModule> createNativeModules(@NonNull ReactApplicationContext reactContext) {
        List<NativeModule> modules = new ArrayList<>();
        modules.add(new AndroidOperatorModule(reactContext));
        modules.add(new PocketAIAgentModule(reactContext));
        modules.add(new SpeechRecognitionModule(reactContext));
        modules.add(new TextToSpeechModule(reactContext));
        return modules;
    }

    @NonNull
    @Override
    public List<ViewManager> createViewManagers(@NonNull ReactApplicationContext reactContext) {
        return Collections.emptyList();
    }
}
