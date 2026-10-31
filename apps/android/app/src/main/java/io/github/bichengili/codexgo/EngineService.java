package io.github.bichengili.codexgo;

import android.app.*;
import android.content.Intent;
import android.os.*;
import android.system.*;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

public class EngineService extends Service {
  static volatile boolean running = false, ready = false;
  static volatile String status = "准备启动…";
  static volatile HostConnection connection;
  private volatile java.lang.Process process;
  private volatile boolean stopping;
  private boolean requestedStop;
  private volatile boolean workerFinished;
  private Thread cleanupThread;
  private PowerManager.WakeLock wake;

  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    if (intent != null && "STOP".equals(intent.getAction())) {
      requestedStop = true;
      stopSelf();
      return START_NOT_STICKY;
    }
    if (running) return START_NOT_STICKY;
    running = true;
    ready = false;
    connection = null;
    stopping = false;
    requestedStop = false;
    status = "准备手机运行环境…";
    NotificationManager manager = getSystemService(NotificationManager.class);
    manager.createNotificationChannel(
        new NotificationChannel("engine", "手机本地开发", NotificationManager.IMPORTANCE_LOW));
    PendingIntent open =
        PendingIntent.getActivity(
            this,
            0,
            new Intent(this, MainActivity.class),
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    PendingIntent stop =
        PendingIntent.getService(
            this,
            1,
            new Intent(this, EngineService.class).setAction("STOP"),
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    startForeground(
        1,
        new Notification.Builder(this, "engine")
            .setSmallIcon(io.github.bichengili.codexgo.R.drawable.icon)
            .setContentTitle("Codex Go 手机本地运行中")
            .setContentText("项目在手机中运行，点击返回 App")
            .setContentIntent(open)
            .addAction(new Notification.Action.Builder(null, "停止", stop).build())
            .setOngoing(true)
            .build());
    wake =
        ((PowerManager) getSystemService(POWER_SERVICE))
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "CodexGo:Engine");
    wake.acquire();
    new Thread(this::launch, "codex-local").start();
    return START_NOT_STICKY;
  }

  private void launch() {
    try {
      if (!Arrays.asList(Build.SUPPORTED_ABIS).contains("arm64-v8a"))
        throw new IOException("此安装包的手机本地模式需要 ARM64 设备。");
      File root = RuntimeInstaller.install(this);
      if (stopping) return;
      File home = new File(getFilesDir(), "home"), tmp = new File(getCacheDir(), "proot");
      new File(home, "workspace").mkdirs();
      new File(home, ".l2s").mkdirs();
      tmp.mkdirs();
      String lib = getApplicationInfo().nativeLibraryDir;
      List<String> args =
          new ArrayList<>(
              Arrays.asList(
                  lib + "/libproot.so",
                  "--kill-on-exit",
                  "--link2symlink",
                  "--sysvipc",
                  "-L",
                  "-0",
                  "--rootfs=" + root.getAbsolutePath(),
                  "--cwd=/root",
                  "-b",
                  "/dev",
                  "-b",
                  "/dev/urandom:/dev/random",
                  "-b",
                  "/proc",
                  "-b",
                  "/proc/self/fd:/dev/fd",
                  "-b",
                  "/proc/self/fd/0:/dev/stdin",
                  "-b",
                  "/proc/self/fd/1:/dev/stdout",
                  "-b",
                  "/proc/self/fd/2:/dev/stderr",
                  "-b",
                  "/sys",
                  "-b",
                  "/system",
                  "-b",
                  "/apex",
                  "-b",
                  home.getAbsolutePath() + ":/root",
                  "-b",
                  root.getAbsolutePath() + ":" + root.getAbsolutePath(),
                  "/usr/bin/env",
                  "HOME=/root",
                  "USER=root",
                  "SHELL=/bin/bash",
                  "PATH=/usr/local/bin:/usr/bin:/bin:/opt/codex/bin",
                  "LD_LIBRARY_PATH=",
                  "LANG=C.UTF-8",
                  "TMPDIR=/tmp",
                  "NODE_OPTIONS=--dns-result-order=ipv4first",
                  "/bin/sh",
                  "-c",
                  "echo $$ > /tmp/codex-go.pid; exec /usr/local/bin/node /opt/codex-go/host.cjs"));
      Vault vault = new Vault(this);
      ProcessBuilder builder = new ProcessBuilder(args).directory(getFilesDir());
      Map<String, String> env = builder.environment();
      env.clear();
      env.put("PATH", "/system/bin:/system/xbin");
      env.put("HOME", getFilesDir().getAbsolutePath());
      env.put("TMPDIR", tmp.getAbsolutePath());
      env.put("ANDROID_ROOT", "/system");
      env.put("ANDROID_DATA", "/data");
      env.put("PROOT_TMP_DIR", tmp.getAbsolutePath());
      env.put("PROOT_LOADER", lib + "/libproot-loader.so");
      env.put("PROOT_L2S_DIR", new File(home, ".l2s").getAbsolutePath());
      env.put("LD_LIBRARY_PATH", lib);
      // Secrets are environment entries, never shell command arguments or logs.
      int command = args.indexOf("/bin/sh");
      args.add(command, "CODEX_GO_BASE_URL=" + vault.get("base"));
      args.add(command + 1, "CODEX_GO_MODEL=" + vault.get("model"));
      env.put("CODEX_GO_API_KEY", vault.get("key"));
      builder.command(args);
      if (stopping) return;
      process = builder.start();
      status = "正在启动 Codex 引擎…";
      new Thread(
              () -> {
                try (InputStream err = process.getErrorStream()) {
                  Compat.copy(err, null);
                } catch (Exception ignored) {
                }
              },
              "codex-stderr")
          .start();
      try (BufferedReader reader =
          new BufferedReader(
              new InputStreamReader(
                  process.getInputStream(), java.nio.charset.StandardCharsets.UTF_8))) {
        String line;
        while ((line = reader.readLine()) != null) {
          if (stopping) break;
          if (line.length() > 4096) continue;
          try {
            JSONObject data = new JSONObject(line);
            if (!data.optString("type").equals("ready")) continue;
            String address = data.getString("url");
            if (!address.matches("http://127\\.0\\.0\\.1:[0-9]{1,5}"))
              throw new IOException("本地引擎地址无效。");
            connection = HostConnection.pair(address, data.getString("code"), "手机本地");
            ready = true;
            status = "手机本地已就绪";
          } catch (org.json.JSONException ignored) {
          }
        }
      }
      if (!stopping) status = "手机引擎已退出，项目和会话已保留。请重新启动。";
    } catch (Exception e) {
      if (!stopping) status = e instanceof IOException ? e.getMessage() : "手机环境启动失败，项目已保留。请重新启动。";
    } finally {
      ready = false;
      connection = null;
      workerFinished = true;
      if (stopping && process == null) running = false;
      stopSelf();
    }
  }

  @Override
  public void onDestroy() {
    stopping = true;
    ready = false;
    connection = null;
    stopOwnedProcess();
    if (process == null && workerFinished) running = false;
    if (wake != null && wake.isHeld()) wake.release();
    if (requestedStop) status = "本地环境已停止。项目和会话已保留。";
    super.onDestroy();
  }

  private synchronized void stopOwnedProcess() {
    if (cleanupThread != null) return;
    java.lang.Process child = process;
    if (child != null)
      cleanupThread =
          new Thread(
              () -> {
                try {
                  File pid = new File(getFilesDir(), "runtime/tmp/codex-go.pid");
                  if (pid.isFile()) {
                    String value = Compat.read(pid.toPath()).trim();
                    if (value.matches("[0-9]+")) {
                      int id = Integer.parseInt(value);
                      String cmd = Compat.read(Paths.get("/proc/" + id + "/cmdline"));
                      if (cmd.contains("/opt/codex-go/host.cjs")) Os.kill(id, OsConstants.SIGTERM);
                    }
                  }
                  if (!child.waitFor(4, TimeUnit.SECONDS)) {
                    // Locate the owned PRoot by /proc identity; Android 8 has no Process.pid().
                    File[] processes = new File("/proc").listFiles();
                    if (processes != null)
                      for (File p : processes) {
                        if (!p.getName().matches("[0-9]+")) continue;
                        try {
                          String cmd = Compat.read(new File(p, "cmdline").toPath());
                          String info = Compat.read(new File(p, "status").toPath());
                          if (cmd.startsWith(getApplicationInfo().nativeLibraryDir + "/libproot.so")
                              && info.contains("Uid:\t" + android.os.Process.myUid() + "\t"))
                            Os.kill(Integer.parseInt(p.getName()), OsConstants.SIGQUIT);
                        } catch (Exception ignored) {
                        }
                      }
                  }
                  if (!child.waitFor(2, TimeUnit.SECONDS)) child.destroyForcibly();
                } catch (Exception ignored) {
                  child.destroyForcibly();
                } finally {
                  running = false;
                }
              },
              "codex-stop");
    if (cleanupThread != null) cleanupThread.start();
  }
}
