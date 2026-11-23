package com.pocketai.services;

import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;
import android.util.Log;

import androidx.annotation.RequiresApi;

import com.pocketai.MainActivity;

/**
 * Quick Settings Tile in the Samsung notification drawer.
 * Pull down quick panel -> Tap "PocketAI" -> instant on-demand voice assistant.
 */
@RequiresApi(api = Build.VERSION_CODES.N)
public class PocketAITileService extends TileService {
    private static final String TAG = "PocketAITileService";

    @Override
    public void onStartListening() {
        super.onStartListening();
        Tile tile = getQsTile();
        if (tile != null) {
            tile.setState(Tile.STATE_ACTIVE);
            tile.setLabel("PocketAI");
            tile.setContentDescription("Launch PocketAI Voice Assistant");
            tile.updateTile();
        }
    }

    @Override
    public void onClick() {
        super.onClick();
        Log.i(TAG, "PocketAI Quick Settings Tile clicked");

        Intent intent = new Intent(this, MainActivity.class);
        intent.setAction(Intent.ACTION_ASSIST);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("assistant_triggered", true);
        intent.putExtra("auto_mic", true);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            PendingIntent pi = PendingIntent.getActivity(
                this,
                401,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            startActivityAndCollapse(pi);
        } else {
            startActivityAndCollapse(intent);
        }
    }
}
