package com.pocketai

import android.content.Intent
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.pocketai.modules.AndroidOperatorModule

class MainActivity : ReactActivity() {

  override fun getMainComponentName(): String = "pocketai"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    setIntent(intent)
    val wakeWordTriggered = intent?.getBooleanExtra("wake_word_triggered", false) ?: false
    val commandText = intent?.getStringExtra("command_text") ?: ""
    if (wakeWordTriggered || commandText.isNotEmpty()) {
      AndroidOperatorModule.emitWakeWordEvent(wakeWordTriggered, commandText)
    }
  }
}
