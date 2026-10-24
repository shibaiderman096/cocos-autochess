package com.cocos.game;

import android.content.res.AssetFileDescriptor;
import android.graphics.PixelFormat;
import android.graphics.SurfaceTexture;
import android.media.MediaPlayer;
import android.util.Log;
import android.view.Surface;
import android.view.SurfaceView;
import android.view.TextureView;
import android.view.ViewGroup;
import com.cocos.lib.CocosActivity;
import com.cocos.lib.CocosHelper;
import com.cocos.lib.JsbBridgeWrapper;
import java.io.IOException;

/** A decoded video under the transparent game surface, without intercepting game input. */
public final class SkyVideoBackground implements TextureView.SurfaceTextureListener {
    private static volatile SkyVideoBackground instance;
    private final CocosActivity activity;
    private final TextureView view;
    private MediaPlayer player;
    private Surface surface;
    private String path = "";
    private volatile String owner = "";
    private boolean prepared, enabled, foreground;
    private int position;

    static void attach(CocosActivity activity, SurfaceView gameSurface) {
        gameSurface.setZOrderOnTop(true);
        gameSurface.getHolder().setFormat(PixelFormat.TRANSLUCENT);
        instance = new SkyVideoBackground(activity, (ViewGroup) gameSurface.getParent());
    }

    private SkyVideoBackground(CocosActivity activity, ViewGroup parent) {
        this.activity = activity;
        view = new TextureView(activity);
        view.setClickable(false); view.setFocusable(false);
        view.setSurfaceTextureListener(this);
        parent.addView(view, 0, new ViewGroup.LayoutParams(-1, -1));
    }

    public static void show(String path, String owner) {
        SkyVideoBackground target = instance;
        if (target == null) return;
        target.activity.runOnUiThread(() -> {
            if (instance != target) return;
            target.releasePlayer(); target.path = path; target.owner = owner;
            target.position = 0; target.enabled = true;
            if (target.view.isAvailable()) target.open(target.view.getSurfaceTexture());
        });
    }

    public static void setPlaying(String owner, boolean enabled) {
        SkyVideoBackground target = instance;
        if (target == null) return;
        target.activity.runOnUiThread(() -> {
            if (instance != target || !owner.equals(target.owner)) return;
            target.enabled = enabled; target.syncPlayback();
        });
    }

    public static void hide(String owner) {
        SkyVideoBackground target = instance;
        if (target == null) return;
        target.activity.runOnUiThread(() -> {
            if (instance != target || !owner.equals(target.owner)) return;
            target.path = ""; target.owner = ""; target.enabled = false; target.releasePlayer();
        });
    }

    static void onResume() {
        if (instance != null) { instance.foreground = true; instance.syncPlayback(); }
    }

    static void onPause() {
        if (instance != null) { instance.foreground = false; instance.syncPlayback(); }
    }

    static void onDestroy() {
        if (instance == null) return;
        instance.releasePlayer();
        ((ViewGroup) instance.view.getParent()).removeView(instance.view);
        instance = null;
    }

    private void open(SurfaceTexture texture) {
        if (path.isEmpty() || texture == null || player != null) return;
        final String requestOwner = owner;
        final MediaPlayer decoder = new MediaPlayer();
        player = decoder; surface = new Surface(texture);
        try {
            if (path.startsWith("@assets/") || !path.startsWith("/")) {
                String asset = path.startsWith("@assets/") ? path.substring(8) : path;
                try (AssetFileDescriptor file = activity.getAssets().openFd(asset)) {
                    decoder.setDataSource(file.getFileDescriptor(), file.getStartOffset(), file.getLength());
                }
            } else decoder.setDataSource(path);
            decoder.setSurface(surface); decoder.setLooping(true); decoder.setVolume(0, 0);
            decoder.setOnPreparedListener(media -> {
                if (player != media || !owner.equals(requestOwner)) return;
                prepared = true;
                if (position > 0) media.seekTo(position);
                syncPlayback();
            });
            decoder.setOnInfoListener((media, what, extra) -> {
                if (player == media && owner.equals(requestOwner) && what == MediaPlayer.MEDIA_INFO_VIDEO_RENDERING_START) {
                    emit(requestOwner, "ready");
                    Log.i("SkyVideoBackground", "First frame rendered: " + requestOwner);
                }
                return false;
            });
            decoder.setOnErrorListener((media, what, extra) -> {
                if (player == media && owner.equals(requestOwner)) {
                    emit(requestOwner, "error"); releasePlayer();
                }
                return true;
            });
            decoder.prepareAsync();
        } catch (IOException | RuntimeException error) {
            Log.w("SkyVideoBackground", "Cannot open background video", error);
            releasePlayer(); emit(requestOwner, "error");
        }
    }

    private void emit(String requestOwner, String state) {
        CocosHelper.runOnGameThreadAtForeground(() -> {
            if (instance == this && owner.equals(requestOwner))
                JsbBridgeWrapper.getInstance().dispatchEventToScript("sky-video-state", requestOwner + ":" + state);
        });
    }

    private void syncPlayback() {
        if (!prepared || player == null) return;
        if (foreground && enabled) player.start();
        else if (player.isPlaying()) player.pause();
    }

    private void releasePlayer() {
        prepared = false;
        if (player != null) { player.release(); player = null; }
        if (surface != null) { surface.release(); surface = null; }
    }

    @Override public void onSurfaceTextureAvailable(SurfaceTexture texture, int width, int height) { open(texture); }
    @Override public void onSurfaceTextureSizeChanged(SurfaceTexture texture, int width, int height) { }
    @Override public void onSurfaceTextureUpdated(SurfaceTexture texture) { }
    @Override public boolean onSurfaceTextureDestroyed(SurfaceTexture texture) {
        if (prepared && player != null) position = player.getCurrentPosition();
        releasePlayer(); return true;
    }
}
