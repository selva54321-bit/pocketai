package com.pocketai

import android.content.Intent
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.pocketai.modules.AndroidOperatorModule

class MainActivity : ReactActivity() {

  override fun getMainComponentName(): String = "pocketai"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    handleAssistantIntent(intent)
  }

  override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    setIntent(intent)
    handleAssistantIntent(intent)
  }

  private fun handleAssistantIntent(intent: Intent?) {
    if (intent == null) return

    val isAssistAction = Intent.ACTION_ASSIST == intent.action || 
                         Intent.ACTION_VOICE_COMMAND == intent.action
    val isAssistExtra = intent.getBooleanExtra("assistant_triggered", false) ||
                        intent.getBooleanExtra("auto_mic", false)
    val wakeWordTriggered = intent.getBooleanExtra("wake_word_triggered", false)
    val commandText = intent.getStringExtra("command_text") ?: ""

    // Clean up extras immediately so this intent cannot trigger multiple times
    intent.removeExtra("wake_word_triggered")
    intent.removeExtra("command_text")
    intent.removeExtra("assistant_triggered")
    intent.removeExtra("auto_mic")

    if (isAssistAction || isAssistExtra || wakeWordTriggered || commandText.isNotEmpty()) {
      AndroidOperatorModule.emitWakeWordEvent(true, commandText)
    }
  }
}
