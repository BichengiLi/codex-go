package io.github.bichengili.codexgo;

import android.app.*;
import android.content.*;
import android.graphics.Color;
import android.net.Uri;
import android.os.*;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;

public class MainActivity extends Activity {
  private final ExecutorService work = Executors.newFixedThreadPool(4);
  private final Handler ui = new Handler(Looper.getMainLooper());
  private final Map<String, HttpURLConnection> subscriptions = new ConcurrentHashMap<>();
  private final Set<String> cancelled = ConcurrentHashMap.newKeySet();
  private WebView web;
  private HostConnection host;
  private Vault vault;
  private LinearLayout page;
  private TextView status;
  private String pendingDownload;
  private HostConnection downloadHost;
  private boolean destroyed = false;
  private int generation = 0;

  @Override
  public void onCreate(Bundle saved) {
    super.onCreate(saved);
    vault = new Vault(this);
    getWindow().setStatusBarColor(Color.rgb(16, 19, 16));
    getWindow().setNavigationBarColor(Color.rgb(16, 19, 16));
    home();
  }

  private int dp(int n) {
    return (int) (getResources().getDisplayMetrics().density * n);
  }

  private TextView text(String value, int size, int color) {
    TextView t = new TextView(this);
    t.setText(value);
    t.setTextSize(size);
    t.setTextColor(color);
    t.setPadding(0, dp(6), 0, dp(6));
    return t;
  }

  private void label(String value) {
    page.addView(text(value, 14, 0xffa9b6a2));
  }

  private EditText input(String hint, boolean secret) {
    EditText e = new EditText(this);
    e.setHint(hint);
    e.setTextColor(0xffedf3e8);
    e.setHintTextColor(0xff7e8b77);
    e.setTextSize(15);
    e.setPadding(dp(10), dp(10), dp(10), dp(10));
    e.setSingleLine(secret);
    if (secret) e.setInputType(129);
    page.addView(e);
    return e;
  }

  private void button(String title, Runnable action) {
    Button b = new Button(this);
    b.setText(title);
    b.setAllCaps(false);
    b.setTextColor(0xff182313);
    b.setBackgroundTintList(android.content.res.ColorStateList.valueOf(0xffc0ec91));
    LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, dp(50));
    p.topMargin = dp(10);
    b.setLayoutParams(p);
    page.addView(b);
    b.setOnClickListener(v -> action.run());
  }

  private void message(String value) {
    if (status != null) status.setText(value);
  }

  private void background(Callable<HostConnection> action, boolean save) {
    message("正在连接…");
    work.execute(
        () -> {
          try {
            HostConnection result = action.call();
            if (save) vault.put("remote", result.json());
            ui.post(
                () -> {
                  if (!destroyed) showHost(result);
                });
          } catch (Exception e) {
            ui.post(() -> message(e instanceof IOException ? e.getMessage() : "连接失败，请检查设置。"));
          }
        });
  }

  private void home() {
    generation++;
    closeStreams();
    if (web != null) {
      web.removeJavascriptInterface("CodexNative");
      web.destroy();
      web = null;
    }
    ScrollView scroll = new ScrollView(this);
    scroll.setBackgroundColor(0xff101310);
    page = new LinearLayout(this);
    page.setOrientation(LinearLayout.VERTICAL);
    page.setPadding(dp(24), dp(22), dp(24), dp(28));
    scroll.addView(page);
    setContentView(scroll);
    page.addView(text("C↗  CODEX GO", 24, 0xffc0ec91));
    label("项目随身，随时继续。选择在哪里运行任务。");
    status = text("", 13, 0xfff3c6aa);
    page.addView(status);
    page.addView(text("连接电脑", 23, 0xffedf3e8));
    label("在电脑 App 启动服务，复制连接码到这里。同一 Wi-Fi 可直接连接；跨网络时请先在电脑开启外网。");
    EditText code = input("粘贴 CG1. 开头的完整连接码", false);
    code.setMaxLines(4);
    button("连接电脑", () -> background(() -> HostConnection.connect(code.getText().toString()), true));
    try {
      String saved = vault.get("remote");
      if (!saved.isEmpty()) {
        HostConnection remembered = HostConnection.restore(saved);
        button(
            "重新连接 · " + remembered.name,
            () ->
                background(
                    () -> {
                      HttpURLConnection c = remembered.open("/api/host", "GET");
                      try {
                        HostConnection.read(c);
                        if (c.getResponseCode() != 200) throw new IOException("配对已失效，请使用新连接码。");
                        return remembered;
                      } finally {
                        c.disconnect();
                      }
                    },
                    false));
      }
    } catch (Exception e) {
      message("保存的凭据不可用，请重新连接。");
    }
    page.addView(text("手机本地", 23, 0xffedf3e8));
    label("任务在此手机运行，项目和会话保存在 App 中。首次解压约需 1.5 GB 可用空间。需要联网调用模型。");
    EditText base = input("模型服务地址，例如 https://api.example.com/v1", false);
    base.setSingleLine(true);
    EditText model = input("模型名称", false);
    model.setSingleLine(true);
    EditText key = input("API Key（加密保存）", true);
    try {
      base.setText(vault.get("base"));
      model.setText(vault.get("model"));
      if (!vault.get("key").isEmpty()) key.setHint("已保存 API Key，留空继续使用");
    } catch (Exception ignored) {
    }
    label("手机运行环境可以访问此 App 的全部项目；默认严格审批。PRoot 提供 Linux 兼容环境，系统隔离由 Android App 提供。");
    button(
        "启动手机本地",
        () -> {
          try {
            String address = base.getText().toString().trim(),
                modelName = model.getText().toString().trim(),
                secret = key.getText().toString();
            URI u = new URI(address);
            if (!"https".equals(u.getScheme())
                || u.getHost() == null
                || u.getUserInfo() != null
                || u.getQuery() != null
                || u.getFragment() != null) throw new IOException("请输入 HTTPS 模型服务地址。");
            if (modelName.isEmpty()) throw new IOException("请填写模型名称。");
            if (secret.isEmpty()) secret = vault.get("key");
            if (secret.isEmpty()) throw new IOException("请填写 API Key。");
            if (EngineService.running) {
              message("本地环境已运行，先停止后再更改模型配置。");
              return;
            }
            vault.put("base", address);
            vault.put("model", modelName);
            vault.put("key", secret);
            key.setText("");
            startForegroundService(new Intent(this, EngineService.class));
            waitForEngine();
          } catch (Exception e) {
            message(e instanceof IOException ? e.getMessage() : "无法保存模型配置。");
          }
        });
    if (EngineService.ready && EngineService.connection != null)
      button("进入正在运行的手机项目", () -> showHost(EngineService.connection));
    if (EngineService.running)
      button(
          "停止手机本地环境",
          () -> {
            startService(new Intent(this, EngineService.class).setAction("STOP"));
            message("正在停止，项目和会话会保留。");
          });
    label("远程模式使用电脑的模型配置；本地模式使用上面保存的配置。返回此页可切换，切换不会移动项目或重复发送任务。");
  }

  private void waitForEngine() {
    int view = generation;
    long launched = android.os.SystemClock.elapsedRealtime();
    ui.post(
        new Runnable() {
          public void run() {
            if (destroyed || generation != view) return;
            message(EngineService.status);
            if (EngineService.ready && EngineService.connection != null) {
              showHost(EngineService.connection);
              return;
            }
            if (EngineService.running || android.os.SystemClock.elapsedRealtime() - launched < 3000)
              ui.postDelayed(this, 700);
            else
              ui.postDelayed(
                  () -> {
                    if (generation == view) message(EngineService.status);
                  },
                  500);
          }
        });
  }

  @SuppressWarnings("SetJavaScriptEnabled")
  private void showHost(HostConnection selected) {
    generation++;
    host = selected;
    closeStreams();
    if (web != null) web.destroy();
    LinearLayout shell = new LinearLayout(this);
    shell.setOrientation(LinearLayout.VERTICAL);
    shell.setBackgroundColor(0xff101310);
    TextView heading = text("‹ 切换主机    ·    " + selected.name, 14, 0xffc0ec91);
    heading.setPadding(dp(16), dp(9), dp(16), dp(9));
    heading.setOnClickListener(v -> home());
    shell.addView(heading);
    web = new WebView(this);
    web.setBackgroundColor(0xff101310);
    web.getSettings().setJavaScriptEnabled(true);
    web.getSettings().setDomStorageEnabled(true);
    web.getSettings().setAllowFileAccess(false);
    web.getSettings().setAllowContentAccess(false);
    web.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    web.addJavascriptInterface(new Bridge(selected, generation), "CodexNative");
    web.setWebViewClient(
        new WebViewClient() {
          @Override
          public WebResourceResponse shouldInterceptRequest(
              WebView view, WebResourceRequest request) {
            Uri u = request.getUrl();
            if (!u.getScheme().equals("https") || !u.getHost().equals("codex-go.local"))
              return blocked();
            String p = u.getPath();
            if (p.equals("/")) p = "/index.html";
            if (p.contains("..") || p.contains("\\") || p.startsWith("/api/")) return blocked();
            try {
              String mime =
                  p.endsWith(".js")
                      ? "application/javascript"
                      : p.endsWith(".css")
                          ? "text/css"
                          : p.endsWith(".svg") ? "image/svg+xml" : "text/html";
              return new WebResourceResponse(mime, "UTF-8", getAssets().open("web" + p));
            } catch (Exception e) {
              return blocked();
            }
          }

          @Override
          public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return true;
          }
        });
    shell.addView(web, new LinearLayout.LayoutParams(-1, 0, 1));
    setContentView(shell);
    web.loadUrl("https://codex-go.local/");
  }

  private WebResourceResponse blocked() {
    return new WebResourceResponse(
        "text/plain",
        "UTF-8",
        403,
        "Forbidden",
        Collections.emptyMap(),
        new ByteArrayInputStream(new byte[0]));
  }

  private void script(int view, String code) {
    ui.post(
        () -> {
          if (!destroyed && view == generation && web != null) web.evaluateJavascript(code, null);
        });
  }

  private void closeStreams() {
    for (HttpURLConnection c : subscriptions.values()) c.disconnect();
    subscriptions.clear();
    cancelled.clear();
  }

  final class Bridge {
    private final HostConnection target;
    private final int view;

    Bridge(HostConnection target, int view) {
      this.target = target;
      this.view = view;
    }

    @JavascriptInterface
    public boolean useEventPolling() {
      return target.base.startsWith("https://");
    }

    @JavascriptInterface
    public void request(String id, String path, String method, String body) {
      if (!id.matches("[0-9]{1,12}")
          || !Arrays.asList("GET", "POST", "DELETE").contains(method)
          || body.length() > 128 * 1024
          || path.startsWith("/api/events")
          || path.startsWith("/api/files/download")) return;
      work.execute(
          () -> {
            int status = 0;
            String response = "{\"error\":\"与主机的连接中断，请核对历史后重试。\"}";
            HttpURLConnection c = null;
            try {
              c = target.open(path, method);
              if (!body.isEmpty()) HostConnection.write(c, body);
              response = HostConnection.read(c);
              status = c.getResponseCode();
            } catch (Exception ignored) {
            } finally {
              if (c != null) c.disconnect();
            }
            script(
                view,
                "window.codexGoResult("
                    + JSONObject.quote(id)
                    + ","
                    + status
                    + ","
                    + JSONObject.quote(response)
                    + ")");
          });
    }

    @JavascriptInterface
    public void subscribe(String id, String path) {
      if (!id.matches("[0-9]{1,12}") || !path.startsWith("/api/events?")) return;
      new Thread(
              () -> {
                HttpURLConnection c = null;
                try {
                  c = target.open(path, "GET");
                  c.setReadTimeout(35000);
                  c.setRequestProperty("Accept", "text/event-stream");
                  subscriptions.put(id, c);
                  if (cancelled.remove(id) || generation != view) return;
                  if (c.getResponseCode() != 200) throw new IOException("stream");
                  try (BufferedReader reader =
                      new BufferedReader(
                          new InputStreamReader(c.getInputStream(), StandardCharsets.UTF_8))) {
                    String line, type = "message";
                    StringBuilder data = new StringBuilder();
                    while ((line = reader.readLine()) != null
                        && generation == view
                        && !cancelled.contains(id)) {
                      if (line.length() > 1024 * 1024 || data.length() > 2 * 1024 * 1024)
                        throw new IOException("event too large");
                      if (line.isEmpty()) {
                        if (data.length() > 0)
                          script(
                              view,
                              "window.codexGoEvent("
                                  + JSONObject.quote(id)
                                  + ","
                                  + JSONObject.quote(type)
                                  + ","
                                  + JSONObject.quote(data.toString())
                                  + ")");
                        data.setLength(0);
                        type = "message";
                      } else if (line.startsWith("event:")) type = line.substring(6).trim();
                      else if (line.startsWith("data:")) {
                        if (data.length() > 0) data.append('\n');
                        data.append(line.substring(line.startsWith("data: ") ? 6 : 5));
                      }
                    }
                  }
                } catch (Exception ignored) {
                } finally {
                  if (c != null) c.disconnect();
                  subscriptions.remove(id);
                  boolean closed = cancelled.remove(id);
                  if (!closed)
                    script(
                        view, "window.codexGoEvent(" + JSONObject.quote(id) + ",\"error\",\"\")");
                }
              },
              "codex-events")
          .start();
    }

    @JavascriptInterface
    public void unsubscribe(String id) {
      cancelled.add(id);
      HttpURLConnection c = subscriptions.remove(id);
      if (c != null) c.disconnect();
    }

    @JavascriptInterface
    public void home() {
      ui.post(() -> MainActivity.this.home());
    }

    @JavascriptInterface
    public void download(String path) {
      if (!path.startsWith("/api/files/download?")) return;
      ui.post(
          () -> {
            if (pendingDownload != null) return;
            pendingDownload = path;
            downloadHost = target;
            String name = Uri.parse(path).getQueryParameter("path");
            if (name == null) name = "download";
            name = name.replace('\\', '/');
            name = name.substring(name.lastIndexOf('/') + 1);
            Intent save =
                new Intent(Intent.ACTION_CREATE_DOCUMENT)
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .setType("application/octet-stream")
                    .putExtra(Intent.EXTRA_TITLE, name);
            try {
              startActivityForResult(save, 7);
            } catch (Exception e) {
              pendingDownload = null;
              Toast.makeText(MainActivity.this, "无法打开文件保存窗口。", Toast.LENGTH_LONG).show();
            }
          });
    }

    @JavascriptInterface
    public void openLink(String address) {
      try {
        URI u = new URI(address);
        if (!Arrays.asList("https", "http").contains(u.getScheme()) || u.getUserInfo() != null)
          return;
        ui.post(
            () -> {
              try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(address)));
              } catch (Exception ignored) {
              }
            });
      } catch (Exception ignored) {
      }
    }
  }

  @Override
  protected void onActivityResult(int request, int result, Intent data) {
    super.onActivityResult(request, result, data);
    if (request != 7) return;
    String path = pendingDownload;
    HostConnection selected = downloadHost;
    pendingDownload = null;
    downloadHost = null;
    if (result != RESULT_OK || data == null || path == null) return;
    Uri destination = data.getData();
    work.execute(
        () -> {
          HttpURLConnection c = null;
          try {
            c = selected.open(path, "GET");
            if (c.getResponseCode() != 200) throw new IOException("下载失败。");
            try (InputStream in = c.getInputStream();
                OutputStream out = getContentResolver().openOutputStream(destination, "wt")) {
              byte[] buffer = new byte[65536];
              int n;
              long size = 0;
              while ((n = in.read(buffer)) != -1) {
                size += n;
                if (size > 200L * 1024 * 1024) throw new IOException("文件超过 200 MB。");
                out.write(buffer, 0, n);
              }
            }
            ui.post(() -> Toast.makeText(this, "文件已保存", Toast.LENGTH_LONG).show());
          } catch (Exception e) {
            try {
              getContentResolver().delete(destination, null, null);
            } catch (Exception ignored) {
            }
            ui.post(() -> Toast.makeText(this, "下载失败，请检查连接后重试。", Toast.LENGTH_LONG).show());
          } finally {
            if (c != null) c.disconnect();
          }
        });
  }

  @Override
  public void onBackPressed() {
    if (web != null) home();
    else super.onBackPressed();
  }

  @Override
  protected void onDestroy() {
    destroyed = true;
    generation++;
    closeStreams();
    if (web != null) {
      web.removeJavascriptInterface("CodexNative");
      web.destroy();
    }
    work.shutdownNow();
    ui.removeCallbacksAndMessages(null);
    super.onDestroy();
  }
}
