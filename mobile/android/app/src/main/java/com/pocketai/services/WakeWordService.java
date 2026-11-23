package com.pocketai.services;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.pocketai.MainActivity;
import com.pocketai.R;
import com.pocketai.modules.AndroidOperatorModule;

import java.util.ArrayList;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Foreground Service that continuously listens in the background for the wake word "Hey Jackie"
 * and immediately brings the PocketAI app to the foreground over the home screen.
 */
public class WakeWordService extends Service implements RecognitionListener {
    private static final String TAG = "WakeWordService";
    private static final String CHANNEL_ID = "pocketai_wake_word_channel";
    private static final int NOTIFICATION_ID = 4040;

    public static final String ACTION_START = "com.pocketai.action.START_WAKE_WORD";
    public static final String ACTION_STOP = "com.pocketai.action.STOP_WAKE_WORD";
    public static final String ACTION_PAUSE = "com.pocketai.action.PAUSE_WAKE_WORD";
    public static final String ACTION_RESUME = "com.pocketai.action.RESUME_WAKE_WORD";
    public static final String ACTION_TRIGGER_TEST = "com.pocketai.action.TRIGGER_TEST";

    public static volatile boolean isServiceRunning = false;
    public static volatile boolean isAppInForeground = false;
    public static volatile boolean isScreenOn = true;
    public static WakeWordService instance = null;

    private SpeechRecognizer speechRecognizer;
    private Intent recognizerIntent;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private boolean isListeningActive = false;
    private long lastTriggerTime = 0;
    private int consecutiveSilenceCount = 0;
    private boolean isReceiverRegistered = false;

    // Wake word variations: "Hey Jackie", "Jackie", "Hey Jacky", "Jacky", "Hi Jackie", "Ok Jackie", "Hey Jaki"
    private static final Pattern WAKE_WORD_PATTERN = Pattern.compile(
        "(?i).*?\\b(hey\\s+jackie|jackie|hey\\s+jacky|jacky|hi\\s+jackie|hi\\s+jacky|ok\\s+jackie|hey\\s+jaki|hey\\s+jaggy)\\b[,\\s]*(.*)"
    );

    // Dynamic screen broadcast receiver: Disables microphone when screen is OFF
    private final BroadcastReceiver screenReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String action = intent != null ? intent.getAction() : null;
            if (Intent.ACTION_SCREEN_OFF.equals(action)) {
                Log.i(TAG, "Screen went OFF: Releasing microphone (zero background mic, zero green dot)");
                isScreenOn = false;
                mainHandler.removeCallbacksAndMessages(null);
                cleanupRecognizer();
            } else if (Intent.ACTION_SCREEN_ON.equals(action) || Intent.ACTION_USER_PRESENT.equals(action)) {
                Log.i(TAG, "Screen went ON: Ready for hands-free voice command");
                isScreenOn = true;
                consecutiveSilenceCount = 0;
                if (isServiceRunning && !isAppInForeground) {
                    scheduleRestart(400);
                }
            }
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;

        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        isScreenOn = pm == null || pm.isInteractive();

        IntentFilter filter = new IntentFilter();
        filter.addAction(Intent.ACTION_SCREEN_ON);
        filter.addAction(Intent.ACTION_SCREEN_OFF);
        filter.addAction(Intent.ACTION_USER_PRESENT);
        registerReceiver(screenReceiver, filter);
        isReceiverRegistered = true;

        Log.i(TAG, "WakeWordService created (screenOn=" + isScreenOn + ")");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : ACTION_START;

        if (ACTION_STOP.equals(action)) {
            Log.i(TAG, "Stopping WakeWordService via action");
            stopServiceInternal();
            return START_NOT_STICKY;
        }

        if (ACTION_TRIGGER_TEST.equals(action)) {
            String testText = intent != null ? intent.getStringExtra("test_text") : "hey jackie";
            if (testText == null || testText.isEmpty()) testText = "hey jackie";
            Log.i(TAG, "Triggering test wake word: " + testText);
            handleWakeWordMatch(testText);
            return START_STICKY;
        }

        if (ACTION_PAUSE.equals(action)) {
            Log.i(TAG, "App is in foreground, pausing background wake-word listener");
            isAppInForeground = true;
            cleanupRecognizer();
            return START_STICKY;
        }

        if (ACTION_RESUME.equals(action)) {
            Log.i(TAG, "App returned to background/home, resuming wake-word listener");
            isAppInForeground = false;
            scheduleRestart(400);
            return START_STICKY;
        }

        // Start Foreground Notification
        createNotificationChannel();
        Intent openAppIntent = new Intent(this, MainActivity.class);
        openAppIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            0,
            openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("PocketAI Voice Trigger Active")
            .setContentText("Listening for 'Hey Jackie'...")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        isServiceRunning = true;
        Log.i(TAG, "WakeWordService started as foreground service");

        if (!isAppInForeground) {
            scheduleRestart(500);
        }

        return START_STICKY;
    }

    private void scheduleRestart(long delayMs) {
        mainHandler.removeCallbacksAndMessages(null);
        mainHandler.postDelayed(this::startListeningProcess, delayMs);
    }

    private void startListeningProcess() {
        mainHandler.post(() -> {
            if (!isServiceRunning || isAppInForeground || !isScreenOn) {
                Log.d(TAG, "Skip startListening: running=" + isServiceRunning + ", foreground=" + isAppInForeground + ", screenOn=" + isScreenOn);
                return;
            }

            try {
                if (!SpeechRecognizer.isRecognitionAvailable(this)) {
                    Log.e(TAG, "SpeechRecognizer not available for WakeWordService");
                    return;
                }

                cleanupRecognizer();

                speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this);
                speechRecognizer.setRecognitionListener(this);

                recognizerIntent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                recognizerIntent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getPackageName());
                recognizerIntent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
                recognizerIntent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);

                speechRecognizer.startListening(recognizerIntent);
                isListeningActive = true;
                Log.d(TAG, "WakeWordService listening for 'Hey Jackie'...");
            } catch (Exception e) {
                Log.e(TAG, "Error starting wake word speech recognizer: " + e.getMessage(), e);
                cleanupRecognizer();
                scheduleRestart(1000);
            }
        });
    }

    private synchronized void handleWakeWordMatch(String fullText) {
        long now = System.currentTimeMillis();
        if (now - lastTriggerTime < 2500) {
            // Debounce double triggers
            return;
        }
        lastTriggerTime = now;
        Log.i(TAG, ">>> 'Hey Jackie' MATCH DETECTED! fullText='" + fullText + "' <<<");

        // 1. Immediate Haptic Pulse
        try {
            Vibrator vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (vibrator != null && vibrator.hasVibrator()) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createOneShot(160, VibrationEffect.DEFAULT_AMPLITUDE));
                } else {
                    vibrator.vibrate(160);
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Vibration error: " + e.getMessage());
        }

        // 2. Extract follow-up command if user spoke in one breath (e.g. "Hey Jackie, call Kalif")
        String command = "";
        Matcher matcher = WAKE_WORD_PATTERN.matcher(fullText);
        if (matcher.find()) {
            command = matcher.group(2) != null ? matcher.group(2).trim() : "";
        }

        // 3. Stop background recognizer so foreground operator gets microphone cleanly
        cleanupRecognizer();

        // 4. Launch MainActivity to foreground over home screen
        Intent launchIntent = new Intent(this, MainActivity.class);
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK 
                            | Intent.FLAG_ACTIVITY_SINGLE_TOP 
                            | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        launchIntent.putExtra("wake_word_triggered", true);
        if (!command.isEmpty()) {
            launchIntent.putExtra("command_text", command);
        }

        try {
            PendingIntent pi = PendingIntent.getActivity(
                this,
                202,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            pi.send();
        } catch (Exception e) {
            try {
                startActivity(launchIntent);
            } catch (Exception ex) {
                Log.e(TAG, "Failed to launch MainActivity: " + ex.getMessage());
            }
        }

        // Notify JS module directly if instance exists
        AndroidOperatorModule.emitWakeWordEvent(true, command);
    }

    private void cleanupRecognizer() {
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
        isListeningActive = false;
    }

    private void stopServiceInternal() {
        isServiceRunning = false;
        mainHandler.removeCallbacksAndMessages(null);
        cleanupRecognizer();
        if (isReceiverRegistered) {
            try {
                unregisterReceiver(screenReceiver);
            } catch (Exception ignored) {}
            isReceiverRegistered = false;
        }
        stopForeground(true);
        stopSelf();
    }

    @Override
    public void onResults(Bundle results) {
        isListeningActive = false;
        ArrayList<String> matches = results != null ? results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION) : null;
        boolean matched = false;

        if (matches != null) {
            for (String text : matches) {
                if (text != null && WAKE_WORD_PATTERN.matcher(text).matches()) {
                    matched = true;
                    consecutiveSilenceCount = 0;
                    handleWakeWordMatch(text);
                    break;
                }
            }
        }

        if (!matched && isServiceRunning && !isAppInForeground && isScreenOn) {
            scheduleRestart(400);
        }
    }

    @Override
    public void onPartialResults(Bundle partialResults) {
        ArrayList<String> matches = partialResults != null ? partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION) : null;
        if (matches != null) {
            for (String text : matches) {
                if (text != null && WAKE_WORD_PATTERN.matcher(text).matches()) {
                    consecutiveSilenceCount = 0;
                    handleWakeWordMatch(text);
                    break;
                }
            }
        }
    }

    @Override
    public void onError(int error) {
        isListeningActive = false;
        cleanupRecognizer();
        if (isServiceRunning && !isAppInForeground && isScreenOn) {
            // Silence / No match timeout (6 or 7)
            if (error == 6 || error == 7) {
                consecutiveSilenceCount++;
                if (consecutiveSilenceCount >= 3) {
                    // Back off to 6 seconds instead of continuously locking microphone
                    Log.d(TAG, "Silence threshold reached (" + consecutiveSilenceCount + "), sleeping 6s");
                    scheduleRestart(6000);
                    return;
                }
                scheduleRestart(500);
            } else {
                scheduleRestart(1200);
            }
        }
    }

    @Override
    public void onReadyForSpeech(Bundle params) {}
    @Override
    public void onBeginningOfSpeech() {}
    @Override
    public void onRmsChanged(float rmsdB) {}
    @Override
    public void onBufferReceived(byte[] buffer) {}
    @Override
    public void onEndOfSpeech() {
        isListeningActive = false;
    }
    @Override
    public void onEvent(int eventType, Bundle params) {}

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "PocketAI Voice Trigger",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Background voice detection for 'Hey Jackie'");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    @Override
    public void onDestroy() {
        stopServiceInternal();
        instance = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
