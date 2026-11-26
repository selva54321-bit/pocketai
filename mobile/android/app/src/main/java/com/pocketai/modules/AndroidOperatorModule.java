package com.pocketai.modules;

import android.Manifest;
import android.app.NotificationManager;
import android.app.SearchManager;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.provider.AlarmClock;
import android.provider.ContactsContract;
import android.provider.Settings;
import android.util.Log;
import android.view.KeyEvent;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.pocketai.services.NotificationListener;
import com.pocketai.services.PocketAIAccessibilityService;
import com.pocketai.services.WakeWordService;
import com.pocketai.retrieval.ContactRAGRetriever;
import com.pocketai.retrieval.ContactRAGRetriever.RAGResult;
import com.pocketai.retrieval.ContactRAGRetriever.ContactDocument;

import android.content.IntentFilter;
import android.os.BatteryManager;

import java.util.Set;
import java.util.Locale;

public class AndroidOperatorModule extends ReactContextBaseJavaModule {
    private static final String TAG = "AndroidOperator";
    private final ReactApplicationContext reactContext;
    public static AndroidOperatorModule instance = null;
    private static boolean isTorchOn = false;

    public AndroidOperatorModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
        instance = this;
    }

    @NonNull
    @Override
    public String getName() {
        return "AndroidOperator";
    }

    // -------------------------------------------------------------
    // Contact Resolution Helper (On-Device RAG Retrieval)
    // -------------------------------------------------------------

    public static class ResolvedContactInfo {
        public String matchedName;
        public String phoneNumber;
        public double confidence;

        public ResolvedContactInfo(String matchedName, String phoneNumber, double confidence) {
            this.matchedName = matchedName;
            this.phoneNumber = phoneNumber;
            this.confidence = confidence;
        }
    }

    private ResolvedContactInfo resolveContactWithRAG(String contactName) {
        if (contactName == null || contactName.trim().isEmpty()) {
            return null;
        }

        // If it's already a numeric phone number, strip non-digits and return
        String pureDigits = contactName.replaceAll("[^0-9+]", "");
        if (pureDigits.length() >= 7) {
            return new ResolvedContactInfo(contactName, pureDigits, 1.0);
        }

        // Check if READ_CONTACTS permission is available
        if (ContextCompat.checkSelfPermission(reactContext, Manifest.permission.READ_CONTACTS) 
                != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "READ_CONTACTS permission not granted. Cannot resolve: " + contactName);
            return null;
        }

        try {
            ContentResolver cr = reactContext.getContentResolver();
            RAGResult ragResult = ContactRAGRetriever.retrieveBestContact(cr, contactName);
            if (ragResult != null && ragResult.bestMatch != null) {
                ContactDocument doc = ragResult.bestMatch;
                String cleanNumber = doc.phoneNumber.replaceAll("[^0-9+]", "");
                Log.d(TAG, String.format(Locale.US, "RAG resolved '%s' -> '%s' (%s) with confidence %.3f",
                    contactName, doc.displayName, cleanNumber, ragResult.confidence));
                return new ResolvedContactInfo(doc.displayName, cleanNumber, ragResult.confidence);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error in RAG contact resolution: " + e.getMessage(), e);
        }

        return null;
    }

    private String resolveContactNumber(String contactName) {
        ResolvedContactInfo info = resolveContactWithRAG(contactName);
        return info != null ? info.phoneNumber : null;
    }

    // -------------------------------------------------------------
    // App Launching & Navigation
    // -------------------------------------------------------------

    @ReactMethod
    public void openApp(String packageName, Promise promise) {
        try {
            PackageManager pm = reactContext.getPackageManager();
            Intent launchIntent = pm.getLaunchIntentForPackage(packageName);
            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                reactContext.startActivity(launchIntent);
                promise.resolve("App opened: " + packageName);
            } else {
                Intent storeIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + packageName));
                storeIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                if (storeIntent.resolveActivity(pm) != null) {
                    reactContext.startActivity(storeIntent);
                    promise.resolve("Opened Play Store for: " + packageName);
                } else {
                    promise.reject("APP_NOT_FOUND", "Could not find package: " + packageName);
                }
            }
        } catch (Exception e) {
            promise.reject("OPEN_APP_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void navigateTo(String destination, Promise promise) {
        try {
            Uri gmmIntentUri = Uri.parse("google.navigation:q=" + Uri.encode(destination));
            Intent mapIntent = new Intent(Intent.ACTION_VIEW, gmmIntentUri);
            mapIntent.setPackage("com.google.android.apps.maps");
            mapIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            if (mapIntent.resolveActivity(reactContext.getPackageManager()) != null) {
                reactContext.startActivity(mapIntent);
                promise.resolve("Navigating to: " + destination);
            } else {
                Intent webMapIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com/maps/dir/?api=1&destination=" + Uri.encode(destination)));
                webMapIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                reactContext.startActivity(webMapIntent);
                promise.resolve("Opened web maps directions for: " + destination);
            }
        } catch (Exception e) {
            promise.reject("NAVIGATION_ERROR", e.getMessage());
        }
    }

    // -------------------------------------------------------------
    // Direct Calling & Messaging (Contacts Integrated)
    // -------------------------------------------------------------

    @ReactMethod
    public void makeCall(String contactOrNumber, Promise promise) {
        try {
            ResolvedContactInfo info = resolveContactWithRAG(contactOrNumber);
            String numberToCall = (info != null && !info.phoneNumber.isEmpty()) ? info.phoneNumber : contactOrNumber;
            String displayName = (info != null && !info.matchedName.isEmpty()) ? info.matchedName : contactOrNumber;

            Intent callIntent;
            // Check if CALL_PHONE permission is granted for instant direct call
            if (ContextCompat.checkSelfPermission(reactContext, Manifest.permission.CALL_PHONE) 
                    == PackageManager.PERMISSION_GRANTED) {
                callIntent = new Intent(Intent.ACTION_CALL);
                callIntent.setData(Uri.parse("tel:" + numberToCall));
                callIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                reactContext.startActivity(callIntent);
                promise.resolve("Calling " + displayName + " (" + numberToCall + ")");
            } else {
                // Fallback to dialer if user hasn't granted CALL_PHONE permission yet
                callIntent = new Intent(Intent.ACTION_DIAL);
                callIntent.setData(Uri.parse("tel:" + numberToCall));
                callIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                reactContext.startActivity(callIntent);
                promise.resolve("Opened dialer for " + displayName + " (" + numberToCall + ")");
            }
        } catch (Exception e) {
            promise.reject("CALL_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void sendSms(String recipient, String message, Promise promise) {
        try {
            ResolvedContactInfo info = resolveContactWithRAG(recipient);
            String target = (info != null && !info.phoneNumber.isEmpty()) ? info.phoneNumber : recipient;
            String displayName = (info != null && !info.matchedName.isEmpty()) ? info.matchedName : recipient;

            Intent smsIntent = new Intent(Intent.ACTION_SENDTO);
            smsIntent.setData(Uri.parse("smsto:" + (target != null ? target : "")));
            smsIntent.putExtra("sms_body", message);
            smsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            reactContext.startActivity(smsIntent);
            promise.resolve("SMS prepared for: " + displayName + " (" + target + ")");
        } catch (Exception e) {
            promise.reject("SMS_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void sendWhatsApp(String recipient, String message, Promise promise) {
        try {
            ResolvedContactInfo info = resolveContactWithRAG(recipient);
            String phoneToUse = (info != null && !info.phoneNumber.isEmpty()) 
                ? info.phoneNumber 
                : (recipient != null ? recipient.replaceAll("[^0-9+]", "") : "");
            String displayName = (info != null && !info.matchedName.isEmpty()) ? info.matchedName : recipient;

            // For WhatsApp api.whatsapp.com URL, phone number must be purely digits without '+'
            String cleanPhone = phoneToUse.replaceAll("[^0-9]", "");

            Uri uri;
            if (!cleanPhone.isEmpty()) {
                // Direct jump into the exact contact's chat with message ready to send!
                uri = Uri.parse("https://api.whatsapp.com/send?phone=" + cleanPhone + "&text=" + Uri.encode(message));
            } else {
                // If contact number couldn't be resolved, open WhatsApp share picker
                uri = Uri.parse("https://api.whatsapp.com/send?text=" + Uri.encode(message));
            }

            Intent waIntent = new Intent(Intent.ACTION_VIEW, uri);
            waIntent.setPackage("com.whatsapp");
            waIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            if (waIntent.resolveActivity(reactContext.getPackageManager()) != null) {
                PocketAIAccessibilityService.shouldAutoSendWhatsApp = true;
                reactContext.startActivity(waIntent);
                promise.resolve("Opened WhatsApp for " + displayName + (cleanPhone.isEmpty() ? "" : " (" + cleanPhone + ")"));
            } else {
                Intent webWaIntent = new Intent(Intent.ACTION_VIEW, uri);
                webWaIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                reactContext.startActivity(webWaIntent);
                promise.resolve("Opened web WhatsApp for " + displayName);
            }
        } catch (Exception e) {
            promise.reject("WHATSAPP_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void sendEmail(String recipient, String subject, String body, Promise promise) {
        try {
            Intent emailIntent = new Intent(Intent.ACTION_SENDTO);
            emailIntent.setData(Uri.parse("mailto:" + (recipient != null ? recipient : "")));
            if (subject != null) emailIntent.putExtra(Intent.EXTRA_SUBJECT, subject);
            if (body != null) emailIntent.putExtra(Intent.EXTRA_TEXT, body);
            emailIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            reactContext.startActivity(emailIntent);
            promise.resolve("Email client opened.");
        } catch (Exception e) {
            promise.reject("EMAIL_ERROR", e.getMessage());
        }
    }

    // -------------------------------------------------------------
    // Hardware & Device Controls (Brightness, DND, Torch, Volume)
    // -------------------------------------------------------------

    @ReactMethod
    public void setBrightness(int levelPercent, Promise promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                if (!Settings.System.canWrite(reactContext)) {
                    Intent intent = new Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS);
                    intent.setData(Uri.parse("package:" + reactContext.getPackageName()));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    reactContext.startActivity(intent);
                    promise.reject("PERMISSION_DENIED", "WRITE_SETTINGS permission required. Opened system settings.");
                    return;
                }
            }

            int clamped = Math.max(0, Math.min(100, levelPercent));
            int sysBrightness = (int) ((clamped / 100.0) * 255);

            Settings.System.putInt(
                reactContext.getContentResolver(),
                Settings.System.SCREEN_BRIGHTNESS,
                sysBrightness
            );
            promise.resolve("Brightness set to " + clamped + "%");
        } catch (Exception e) {
            promise.reject("BRIGHTNESS_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void setDoNotDisturb(boolean enable, Promise promise) {
        try {
            NotificationManager nm = (NotificationManager) reactContext.getSystemService(Context.NOTIFICATION_SERVICE);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                if (!nm.isNotificationPolicyAccessGranted()) {
                    Intent intent = new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    reactContext.startActivity(intent);
                    promise.reject("PERMISSION_DENIED", "DND access policy required. Opened settings.");
                    return;
                }

                int filter = enable ? NotificationManager.INTERRUPTION_FILTER_PRIORITY : NotificationManager.INTERRUPTION_FILTER_ALL;
                nm.setInterruptionFilter(filter);
                promise.resolve("Do Not Disturb set to: " + (enable ? "ON" : "OFF"));
            } else {
                promise.resolve("DND not supported on this Android API version.");
            }
        } catch (Exception e) {
            promise.reject("DND_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void toggleFlashlight(boolean enable, Promise promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                CameraManager cameraManager = (CameraManager) reactContext.getSystemService(Context.CAMERA_SERVICE);
                if (cameraManager != null) {
                    for (String id : cameraManager.getCameraIdList()) {
                        CameraCharacteristics characteristics = cameraManager.getCameraCharacteristics(id);
                        Boolean hasFlash = characteristics.get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                        if (hasFlash != null && hasFlash) {
                            cameraManager.setTorchMode(id, enable);
                            isTorchOn = enable;
                            promise.resolve("Flashlight turned " + (enable ? "ON" : "OFF"));
                            return;
                        }
                    }
                }
                promise.reject("NO_FLASH", "No flashlight hardware detected on this device.");
            } else {
                promise.reject("UNSUPPORTED", "Torch mode requires Android 6.0+.");
            }
        } catch (Exception e) {
            promise.reject("FLASHLIGHT_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void adjustVolume(String action, int levelPercent, Promise promise) {
        try {
            AudioManager am = (AudioManager) reactContext.getSystemService(Context.AUDIO_SERVICE);
            if (am == null) {
                promise.reject("AUDIO_ERROR", "AudioManager not available.");
                return;
            }

            int stream = AudioManager.STREAM_MUSIC;
            switch (action.toLowerCase()) {
                case "up":
                    am.adjustStreamVolume(stream, AudioManager.ADJUST_RAISE, AudioManager.FLAG_SHOW_UI);
                    promise.resolve("Volume raised.");
                    break;
                case "down":
                    am.adjustStreamVolume(stream, AudioManager.ADJUST_LOWER, AudioManager.FLAG_SHOW_UI);
                    promise.resolve("Volume lowered.");
                    break;
                case "mute":
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        am.adjustStreamVolume(stream, AudioManager.ADJUST_MUTE, AudioManager.FLAG_SHOW_UI);
                    }
                    promise.resolve("Media muted.");
                    break;
                case "unmute":
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        am.adjustStreamVolume(stream, AudioManager.ADJUST_UNMUTE, AudioManager.FLAG_SHOW_UI);
                    }
                    promise.resolve("Media unmuted.");
                    break;
                case "max":
                    int maxVol = am.getStreamMaxVolume(stream);
                    am.setStreamVolume(stream, maxVol, AudioManager.FLAG_SHOW_UI);
                    promise.resolve("Volume set to maximum.");
                    break;
                case "set":
                    int max = am.getStreamMaxVolume(stream);
                    int target = (int) ((Math.max(0, Math.min(100, levelPercent)) / 100.0) * max);
                    am.setStreamVolume(stream, target, AudioManager.FLAG_SHOW_UI);
                    promise.resolve("Volume set to " + levelPercent + "%");
                    break;
                default:
                    promise.reject("INVALID_ACTION", "Unknown volume action: " + action);
            }
        } catch (Exception e) {
            promise.reject("VOLUME_ERROR", e.getMessage());
        }
    }

    // -------------------------------------------------------------
    // Media Playback Controls
    // -------------------------------------------------------------

    @ReactMethod
    public void controlMedia(String action, Promise promise) {
        try {
            AudioManager am = (AudioManager) reactContext.getSystemService(Context.AUDIO_SERVICE);
            if (am == null) {
                promise.reject("AUDIO_ERROR", "AudioManager not available.");
                return;
            }

            int keyCode;
            switch (action.toLowerCase()) {
                case "next":
                    keyCode = KeyEvent.KEYCODE_MEDIA_NEXT;
                    break;
                case "previous":
                    keyCode = KeyEvent.KEYCODE_MEDIA_PREVIOUS;
                    break;
                case "stop":
                    keyCode = KeyEvent.KEYCODE_MEDIA_STOP;
                    break;
                case "play_pause":
                default:
                    keyCode = KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE;
                    break;
            }

            am.dispatchMediaKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, keyCode));
            am.dispatchMediaKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, keyCode));
            promise.resolve("Media action triggered: " + action);
        } catch (Exception e) {
            promise.reject("MEDIA_ERROR", e.getMessage());
        }
    }

    // -------------------------------------------------------------
    // Clocks, Alarms & Timers
    // -------------------------------------------------------------

    @ReactMethod
    public void startTimer(int seconds, String label, boolean skipUi, Promise promise) {
        try {
            Intent intent = new Intent(AlarmClock.ACTION_SET_TIMER);
            intent.putExtra(AlarmClock.EXTRA_LENGTH, seconds);
            intent.putExtra(AlarmClock.EXTRA_MESSAGE, label != null ? label : "Timer");
            intent.putExtra(AlarmClock.EXTRA_SKIP_UI, skipUi);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            if (intent.resolveActivity(reactContext.getPackageManager()) != null) {
                reactContext.startActivity(intent);
                promise.resolve("Timer set for " + seconds + " seconds.");
            } else {
                promise.reject("NO_CLOCK_APP", "No app available to handle timer intent.");
            }
        } catch (Exception e) {
            promise.reject("TIMER_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void setAlarm(int hour, int minute, String label, boolean skipUi, Promise promise) {
        try {
            Intent intent = new Intent(AlarmClock.ACTION_SET_ALARM);
            intent.putExtra(AlarmClock.EXTRA_HOUR, hour);
            intent.putExtra(AlarmClock.EXTRA_MINUTES, minute);
            intent.putExtra(AlarmClock.EXTRA_MESSAGE, label != null ? label : "Alarm");
            intent.putExtra(AlarmClock.EXTRA_SKIP_UI, skipUi);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            if (intent.resolveActivity(reactContext.getPackageManager()) != null) {
                reactContext.startActivity(intent);
                String timeStr = String.format("%02d:%02d", hour, minute);
                promise.resolve("Alarm set for " + timeStr);
            } else {
                promise.reject("NO_ALARM_APP", "No app available to handle alarm intent.");
            }
        } catch (Exception e) {
            promise.reject("ALARM_ERROR", e.getMessage());
        }
    }

    // -------------------------------------------------------------
    // Web & YouTube Search
    // -------------------------------------------------------------

    @ReactMethod
    public void searchWeb(String query, Promise promise) {
        try {
            // Defensive redirect: If query asks for YouTube, always open the native YouTube app instead of browser
            if (query != null && (query.toLowerCase().contains("youtube") || query.toLowerCase().contains("youtubr"))) {
                String cleanYt = query.replaceAll("(?i)\\b(on|in|from|at|via)\\s+(youtube|youtubr)\\b", "")
                                      .replaceAll("(?i)\\b(play|search\\s+for|search|watch|listen\\s+to)\\b", "")
                                      .replaceAll("(?i)\\b(youtube|youtubr)\\b", "")
                                      .trim();
                if (cleanYt.isEmpty()) cleanYt = "songs";
                Log.i(TAG, "Redirecting searchWeb with YouTube query to searchYouTube: " + cleanYt);
                searchYouTube(cleanYt, promise);
                return;
            }

            Intent intent = new Intent(Intent.ACTION_WEB_SEARCH);
            intent.putExtra(SearchManager.QUERY, query);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            reactContext.startActivity(intent);
            promise.resolve("Searching web for: " + query);
        } catch (Exception e) {
            try {
                Intent fallback = new Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com/search?q=" + Uri.encode(query)));
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                reactContext.startActivity(fallback);
                promise.resolve("Searching Google for: " + query);
            } catch (Exception ex) {
                promise.reject("SEARCH_ERROR", ex.getMessage());
            }
        }
    }

    @ReactMethod
    public void searchYouTube(String query, Promise promise) {
        try {
            if (query != null) {
                query = query.replaceAll("(?i)\\b(on|in|from|via)\\s+(youtube|youtubr)\\b", "")
                             .replaceAll("(?i)\\b(play|search\\s+for|search|watch|listen\\s+to)\\b", "")
                             .replaceAll("(?i)\\b(youtube|youtubr)\\b", "")
                             .trim();
                if (query.isEmpty()) query = "songs";
            }

            Intent ytIntent = new Intent(Intent.ACTION_SEARCH);
            ytIntent.setPackage("com.google.android.youtube");
            ytIntent.putExtra("query", query);
            ytIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            if (ytIntent.resolveActivity(reactContext.getPackageManager()) != null) {
                reactContext.startActivity(ytIntent);
                promise.resolve("Searching YouTube for: " + query);
            } else {
                Intent webYt = new Intent(Intent.ACTION_VIEW, Uri.parse("https://www.youtube.com/results?search_query=" + Uri.encode(query)));
                webYt.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                reactContext.startActivity(webYt);
                promise.resolve("Opened YouTube in browser for: " + query);
            }
        } catch (Exception e) {
            promise.reject("YOUTUBE_SEARCH_ERROR", e.getMessage());
        }
    }

    // -------------------------------------------------------------
    // System Settings & Clipboard
    // -------------------------------------------------------------

    @ReactMethod
    public void openSetting(String settingName, Promise promise) {
        try {
            Intent intent;
            String clean = settingName.toLowerCase();
            switch (clean) {
                case "wifi":
                case "wi-fi":
                    intent = new Intent(Settings.ACTION_WIFI_SETTINGS);
                    break;
                case "bluetooth":
                    intent = new Intent(Settings.ACTION_BLUETOOTH_SETTINGS);
                    break;
                case "location":
                    intent = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
                    break;
                case "sound":
                case "audio":
                    intent = new Intent(Settings.ACTION_SOUND_SETTINGS);
                    break;
                case "display":
                    intent = new Intent(Settings.ACTION_DISPLAY_SETTINGS);
                    break;
                case "battery":
                    intent = new Intent(Settings.ACTION_BATTERY_SAVER_SETTINGS);
                    break;
                case "apps":
                    intent = new Intent(Settings.ACTION_APPLICATION_SETTINGS);
                    break;
                default:
                    intent = new Intent(Settings.ACTION_SETTINGS);
                    break;
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            reactContext.startActivity(intent);
            promise.resolve("Opened " + clean + " settings.");
        } catch (Exception e) {
            promise.reject("SETTING_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void copyToClipboard(String text, Promise promise) {
        try {
            ClipboardManager clipboard = (ClipboardManager) reactContext.getSystemService(Context.CLIPBOARD_SERVICE);
            if (clipboard != null) {
                ClipData clip = ClipData.newPlainText("PocketAI", text);
                clipboard.setPrimaryClip(clip);
                promise.resolve("Copied to clipboard: " + text);
            } else {
                promise.reject("CLIPBOARD_ERROR", "Clipboard service unavailable.");
            }
        } catch (Exception e) {
            promise.reject("CLIPBOARD_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void openBatterySaverSettings(Promise promise) {
        openSetting("battery", promise);
    }

    @ReactMethod
    public void checkPermissions(Promise promise) {
        WritableMap map = Arguments.createMap();
        boolean canWriteSettings = false;
        boolean hasDndPolicy = false;
        boolean hasCallPhone = false;
        boolean hasReadContacts = false;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            canWriteSettings = Settings.System.canWrite(reactContext);
            NotificationManager nm = (NotificationManager) reactContext.getSystemService(Context.NOTIFICATION_SERVICE);
            hasDndPolicy = nm != null && nm.isNotificationPolicyAccessGranted();
            hasCallPhone = ContextCompat.checkSelfPermission(reactContext, Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED;
            hasReadContacts = ContextCompat.checkSelfPermission(reactContext, Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED;
        }

        map.putBoolean("canWriteSettings", canWriteSettings);
        map.putBoolean("hasDndPolicy", hasDndPolicy);
        map.putBoolean("hasCallPhone", hasCallPhone);
        map.putBoolean("hasReadContacts", hasReadContacts);
        promise.resolve(map);
    }

    // -------------------------------------------------------------
    // Wake Word ('Hey Jackie') Background Service Controls
    // -------------------------------------------------------------

    @ReactMethod
    public void startWakeWordService(Promise promise) {
        try {
            Intent intent = new Intent(reactContext, WakeWordService.class);
            intent.setAction(WakeWordService.ACTION_START);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactContext.startForegroundService(intent);
            } else {
                reactContext.startService(intent);
            }
            Log.i(TAG, "WakeWordService start requested");
            promise.resolve("WakeWordService started");
        } catch (Exception e) {
            Log.e(TAG, "Failed to start WakeWordService: " + e.getMessage(), e);
            promise.reject("WAKE_WORD_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void stopWakeWordService(Promise promise) {
        try {
            WakeWordService.isServiceRunning = false;
            Intent intent = new Intent(reactContext, WakeWordService.class);
            intent.setAction(WakeWordService.ACTION_STOP);
            reactContext.startService(intent);
            Log.i(TAG, "WakeWordService stop requested");
            promise.resolve("WakeWordService stopped");
        } catch (Exception e) {
            promise.reject("WAKE_WORD_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void setWakeWordForegroundState(boolean isForeground, Promise promise) {
        try {
            WakeWordService.isAppInForeground = isForeground;
            Intent intent = new Intent(reactContext, WakeWordService.class);
            intent.setAction(isForeground ? WakeWordService.ACTION_PAUSE : WakeWordService.ACTION_RESUME);
            reactContext.startService(intent);
            if (promise != null) promise.resolve(true);
        } catch (Exception e) {
            if (promise != null) promise.reject("WAKE_WORD_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void isWakeWordServiceRunning(Promise promise) {
        promise.resolve(WakeWordService.isServiceRunning);
    }

    @ReactMethod
    public void openDefaultAssistantSettings(Promise promise) {
        try {
            Intent intent = new Intent(Settings.ACTION_VOICE_INPUT_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            reactContext.startActivity(intent);
            promise.resolve("Opened assistant settings");
        } catch (Exception e) {
            try {
                Intent fallback = new Intent(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS);
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                reactContext.startActivity(fallback);
                promise.resolve("Opened default apps settings");
            } catch (Exception ex) {
                Log.e(TAG, "Failed to open assistant settings: " + ex.getMessage());
                promise.reject("SETTINGS_ERROR", ex.getMessage());
            }
        }
    }

    @ReactMethod
    public void getInitialWakeWordCommand(Promise promise) {
        try {
            if (getCurrentActivity() != null && getCurrentActivity().getIntent() != null) {
                Intent intent = getCurrentActivity().getIntent();
                boolean isAssistAction = Intent.ACTION_ASSIST.equals(intent.getAction()) || 
                                         Intent.ACTION_VOICE_COMMAND.equals(intent.getAction());
                boolean isAssistExtra = intent.getBooleanExtra("assistant_triggered", false) ||
                                        intent.getBooleanExtra("auto_mic", false);
                boolean wakeTriggered = intent.getBooleanExtra("wake_word_triggered", false);
                boolean triggered = isAssistAction || isAssistExtra || wakeTriggered;

                String commandText = intent.getStringExtra("command_text");
                // Clear extras so they only get consumed once
                intent.removeExtra("wake_word_triggered");
                intent.removeExtra("assistant_triggered");
                intent.removeExtra("auto_mic");
                intent.removeExtra("command_text");

                WritableMap map = Arguments.createMap();
                map.putBoolean("wakeWordTriggered", triggered);
                map.putString("commandText", commandText != null ? commandText : "");
                promise.resolve(map);
                return;
            }
            WritableMap map = Arguments.createMap();
            map.putBoolean("wakeWordTriggered", false);
            map.putString("commandText", "");
            promise.resolve(map);
        } catch (Exception e) {
            promise.reject("INTENT_ERROR", e.getMessage());
        }
    }

    private static long lastWakeWordEventTime = 0;
    private static String lastWakeWordText = "";

    public static void emitWakeWordEvent(boolean triggered, String commandText) {
        long now = System.currentTimeMillis();
        String safeText = commandText != null ? commandText.trim() : "";
        if (now - lastWakeWordEventTime < 2000 && safeText.equalsIgnoreCase(lastWakeWordText)) {
            Log.d(TAG, "Debouncing duplicate emitWakeWordEvent: '" + safeText + "'");
            return;
        }
        lastWakeWordEventTime = now;
        lastWakeWordText = safeText;

        if (instance != null && instance.reactContext.hasActiveReactInstance()) {
            WritableMap map = Arguments.createMap();
            map.putBoolean("wakeWordTriggered", triggered);
            map.putString("commandText", safeText);
            instance.reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit("onWakeWordDetected", map);
        }
    }

    public static void emitWakeWordStatusChanged(boolean enabled) {
        if (instance != null && instance.reactContext.hasActiveReactInstance()) {
            WritableMap map = Arguments.createMap();
            map.putBoolean("enabled", enabled);
            instance.reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit("onWakeWordStatusChanged", map);
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

    // -------------------------------------------------------------
    // Active System Notifications
    // -------------------------------------------------------------

    @ReactMethod
    public void isNotificationListenerEnabled(Promise promise) {
        try {
            Set<String> packageNames = NotificationManagerCompat.getEnabledListenerPackages(reactContext);
            boolean isEnabled = packageNames.contains(reactContext.getPackageName());
            promise.resolve(isEnabled);
        } catch (Exception e) {
            promise.reject("CHECK_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void openNotificationListenerSettings(Promise promise) {
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            reactContext.startActivity(intent);
            promise.resolve("Opened notification listener settings");
        } catch (Exception e) {
            promise.reject("SETTINGS_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void getActiveNotifications(Promise promise) {
        try {
            WritableArray array = NotificationListener.getActiveNotificationsArray(reactContext.getPackageName());
            promise.resolve(array);
        } catch (Exception e) {
            Log.e(TAG, "Error getting active notifications: " + e.getMessage(), e);
            promise.reject("NOTIF_ERROR", e.getMessage());
        }
    }

    // -------------------------------------------------------------
    // Hardware Queries & Device Controls
    // -------------------------------------------------------------

    @ReactMethod
    public void getBatteryStatus(Promise promise) {
        try {
            IntentFilter ifilter = new IntentFilter(Intent.ACTION_BATTERY_CHANGED);
            Intent batteryStatus = reactContext.registerReceiver(null, ifilter);
            if (batteryStatus != null) {
                int level = batteryStatus.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
                int scale = batteryStatus.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
                int status = batteryStatus.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
                int plugged = batteryStatus.getIntExtra(BatteryManager.EXTRA_PLUGGED, -1);
                boolean isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                                     status == BatteryManager.BATTERY_STATUS_FULL;
                int batteryPct = (int) ((level / (float) scale) * 100);

                WritableMap map = Arguments.createMap();
                map.putInt("percentage", batteryPct);
                map.putBoolean("isCharging", isCharging);
                map.putString("status", isCharging ? "Charging" : "Discharging");
                map.putString("summary", "Battery is at " + batteryPct + "%" + (isCharging ? " and charging" : ""));
                promise.resolve(map);
                return;
            }
            promise.reject("BATTERY_ERROR", "Could not get battery status");
        } catch (Exception e) {
            promise.reject("BATTERY_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void setRingerMode(String mode, Promise promise) {
        try {
            AudioManager audio = (AudioManager) reactContext.getSystemService(Context.AUDIO_SERVICE);
            if (audio == null) {
                promise.reject("AUDIO_ERROR", "AudioManager not found");
                return;
            }
            String target = mode != null ? mode.toLowerCase().trim() : "normal";
            if (target.contains("silent") || target.contains("mute")) {
                audio.setRingerMode(AudioManager.RINGER_MODE_SILENT);
                promise.resolve("Phone set to Silent mode");
            } else if (target.contains("vibrate")) {
                audio.setRingerMode(AudioManager.RINGER_MODE_VIBRATE);
                promise.resolve("Phone set to Vibrate mode");
            } else {
                audio.setRingerMode(AudioManager.RINGER_MODE_NORMAL);
                promise.resolve("Phone sound turned on (Normal mode)");
            }
        } catch (Exception e) {
            promise.reject("RINGER_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void openCamera(String mode, Promise promise) {
        try {
            Intent cameraIntent = new Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE);
            boolean isSelfie = mode != null && (mode.contains("front") || mode.contains("selfie"));
            if (isSelfie) {
                cameraIntent.putExtra("android.intent.extras.CAMERA_FACING", 1);
                cameraIntent.putExtra("android.intent.extra.USE_FRONT_CAMERA", true);
            }
            cameraIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            reactContext.startActivity(cameraIntent);
            promise.resolve(isSelfie ? "Opened front selfie camera" : "Opened camera");
        } catch (Exception e) {
            promise.reject("CAMERA_ERROR", e.getMessage());
        }
    }

    // -------------------------------------------------------------
    // Accessibility Global Actions
    // -------------------------------------------------------------

    @ReactMethod
    public void isAccessibilityServiceEnabled(Promise promise) {
        promise.resolve(PocketAIAccessibilityService.isServiceRunning());
    }

    @ReactMethod
    public void openAccessibilitySettings(Promise promise) {
        try {
            Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            reactContext.startActivity(intent);
            promise.resolve("Opened accessibility settings");
        } catch (Exception e) {
            promise.reject("SETTINGS_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void takeScreenshot(Promise promise) {
        if (!PocketAIAccessibilityService.isServiceRunning()) {
            promise.reject("ACCESSIBILITY_DISABLED", "PocketAI Accessibility Service is required to take screenshots. Please enable it in Settings.");
            return;
        }
        boolean ok = PocketAIAccessibilityService.instance.takeScreenshot();
        if (ok) {
            promise.resolve("Screenshot captured");
        } else {
            promise.reject("SCREENSHOT_FAILED", "Failed to capture screenshot");
        }
    }

    @ReactMethod
    public void lockScreen(Promise promise) {
        if (!PocketAIAccessibilityService.isServiceRunning()) {
            promise.reject("ACCESSIBILITY_DISABLED", "PocketAI Accessibility Service is required to lock the screen. Please enable it in Settings.");
            return;
        }
        boolean ok = PocketAIAccessibilityService.instance.lockScreen();
        if (ok) {
            promise.resolve("Screen locked");
        } else {
            promise.reject("LOCK_FAILED", "Failed to lock screen");
        }
    }

    @ReactMethod
    public void openNotificationPanel(Promise promise) {
        if (!PocketAIAccessibilityService.isServiceRunning()) {
            promise.reject("ACCESSIBILITY_DISABLED", "PocketAI Accessibility Service is required. Please enable it in Settings.");
            return;
        }
        boolean ok = PocketAIAccessibilityService.instance.openNotifications();
        if (ok) {
            promise.resolve("Opened notification panel");
        } else {
            promise.reject("PANEL_FAILED", "Failed to open notification panel");
        }
    }

    @ReactMethod
    public void openQuickSettingsPanel(Promise promise) {
        if (!PocketAIAccessibilityService.isServiceRunning()) {
            promise.reject("ACCESSIBILITY_DISABLED", "PocketAI Accessibility Service is required. Please enable it in Settings.");
            return;
        }
        boolean ok = PocketAIAccessibilityService.instance.openQuickSettings();
        if (ok) {
            promise.resolve("Opened Quick Settings panel");
        } else {
            promise.reject("PANEL_FAILED", "Failed to open Quick Settings panel");
        }
    }
}
