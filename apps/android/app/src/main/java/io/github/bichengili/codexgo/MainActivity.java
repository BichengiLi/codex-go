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
  private PendingUpload pendingUpload;
  private static final class PendingUpload {
    final String id, threadId;
    final int view, remaining;
    final HostConnection target;
    PendingUpload(String id, String threadId, int view, int remaining, HostConnection target) {
      this.id = id; this.threadId = threadId; this.view = view;
      this.remaining = remaining; this.target = target;
    }
  }
  private boolean destroyed = false;
  private int generation = 0;

  @Override
  public void onCreate(Bundle saved) {
    super.onCreate(saved);
    vault = new Vault(this);
    getWindow().setStatusBarColor(Color.rgb(12, 16, 18));
    getWindow().setNavigationBarColor(Color.rgb(12, 16, 18));
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
    e.setBackground(surface(0xff18251f, 0xff34463a, 12));
    LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(-1, -2);
    layout.topMargin = dp(6); layout.bottomMargin = dp(12); e.setLayoutParams(layout);
    e.setSingleLine(secret);
    if (secret) e.setInputType(129);
    page.addView(e);
    return e;
  }

  private Button button(String title, Runnable action) {
    Button b = new Button(this);
    b.setText(title);
    b.setAllCaps(false);
    b.setTextColor(0xff182313);
    b.setBackgroundTintList(android.content.res.ColorStateList.valueOf(0xffc0ec91));
    b.setTextSize(16); b.setGravity(Gravity.CENTER_VERTICAL | Gravity.START);
    b.setPadding(dp(24), 0, dp(24), 0);
    b.setBackground(surface(0xffbdddc8, 0xffbdddc8, 16));
    LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, dp(72));
    p.topMargin = dp(10);
    b.setLayoutParams(p);
    page.addView(b);
    b.setOnClickListener(v -> action.run());
    return b;
  }

  private void message(String value) {
    if (status != null) status.setText(value);
  }

  private void background(Callable<HostConnection> action, boolean save) {
    if (connecting) return;
    connecting = true; int view = generation;
    message("正在连接…");
    work.execute(() -> {
      try {
        HostConnection result = action.call();
        if (save) vault.put("remote", result.json());
        ui.post(() -> { if (!destroyed && generation == view) { connecting = false; showHost(result); } });
      } catch (Exception e) {
        ui.post(() -> { if (!destroyed && generation == view) { connecting = false;
          message(e instanceof IOException ? e.getMessage() : "连接失败，请检查设置。");
        }});
      }
    });
  }

  private String screen = "home";
  private boolean connecting;
  private static final int INK = 0xffedf1ee, MUTED = 0xff8fa69b, ACCENT = 0xffbdddc8;

  private android.graphics.drawable.GradientDrawable surface(int fill, int stroke, int radius) {
    android.graphics.drawable.GradientDrawable d = new android.graphics.drawable.GradientDrawable();
    d.setColor(fill); d.setCornerRadius(dp(radius)); d.setStroke(dp(1), stroke); return d;
  }

  private void appear(View view, long delay) {
    if (!android.animation.ValueAnimator.areAnimatorsEnabled()) return;
    view.setAlpha(0); view.setTranslationY(dp(18));
    view.animate().alpha(1).translationY(0).setStartDelay(delay).setDuration(950)
        .setInterpolator(new android.view.animation.DecelerateInterpolator(2)).start();
  }

  private void openPage(String name) {
    generation++; screen = name; connecting = false; closeStreams();
    if (web != null) { web.removeJavascriptInterface("CodexNative"); web.destroy(); web = null; }
    ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true);
    scroll.setBackground(new android.graphics.drawable.GradientDrawable(
        android.graphics.drawable.GradientDrawable.Orientation.TL_BR,
        new int[] {0xff15231f, 0xff0c1012, 0xff0c1012}));
    page = new LinearLayout(this); page.setOrientation(LinearLayout.VERTICAL);
    page.setPadding(dp(28), dp(36), dp(28), dp(30)); scroll.addView(page); setContentView(scroll);
    if (!name.equals("home")) {
      TextView back = text("‹  返回", 14, MUTED); back.setPadding(0, 0, 0, dp(22));
      back.setOnClickListener(v -> home()); page.addView(back);
    }
    status = text("", 13, 0xffedbba6);
    status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
  }

  private void heading(String title, String subtitle) {
    TextView eyebrow = text("YOUR WORK. WITH YOU.", 10, MUTED); eyebrow.setLetterSpacing(.22f);
    page.addView(eyebrow); appear(eyebrow, 50);
    TextView brand = text(title, 38, INK); brand.setTypeface(android.graphics.Typeface.create("sans-serif-light", android.graphics.Typeface.NORMAL));
    brand.setPadding(0, dp(16), 0, dp(12)); page.addView(brand); appear(brand, 200);
    TextView tagline = text(subtitle, 15, ACCENT); tagline.setLineSpacing(dp(5), 1);
    page.addView(tagline); appear(tagline, 450);
  }

  private void home() {
    openPage("home");
    heading("Codex Go.", "灵感在路上，开发也可以。");
    TextView note = text("你的项目、上下文与下一步，随时在手边。", 12, MUTED);
    note.setPadding(0, dp(12), 0, dp(44)); page.addView(note); appear(note, 650);
    Button remote = button("连接电脑    ↗", this::scan); appear(remote, 850);
    Button local = button("本地调用    →", this::enterLocal);
    local.setTextColor(INK); local.setBackgroundTintList(null);
    local.setBackground(surface(0xff1b2924, 0xff34483d, 16)); appear(local, 1050);
    page.addView(status);
    try {
      String saved = vault.get("remote");
      if (!saved.isEmpty()) {
        HostConnection remembered = HostConnection.restore(saved);
        TextView device = text("已配对 · " + remembered.name, 12, MUTED);
        device.setPadding(0, dp(36), 0, dp(8)); page.addView(device); appear(device, 1250);
        Button resume = button("继续连接  ·  " + remembered.name, () -> reconnect(remembered));
        resume.setTextColor(ACCENT); resume.setBackgroundTintList(null);
        resume.setBackground(surface(0xff14201b, 0xff2b3e32, 14)); appear(resume, 1350);
        TextView disconnect = text("断开此电脑", 12, MUTED); disconnect.setGravity(Gravity.CENTER);
        disconnect.setPadding(0, dp(18), 0, dp(12)); page.addView(disconnect);
        disconnect.setOnClickListener(v -> disconnect(remembered));
      }
    } catch (Exception e) { message("保存的凭据不可用，请重新扫码。"); }
    TextView foot = text("自己的 API · 自己的项目 · 随时接续", 11, 0xff617c6c);
    foot.setPadding(0, dp(52), 0, 0); foot.setGravity(Gravity.CENTER); page.addView(foot); appear(foot, 1500);
  }

  private void reconnect(HostConnection remembered) {
    background(() -> {
      HttpURLConnection c = remembered.open("/api/host", "GET");
      try {
        HostConnection.read(c);
        if (c.getResponseCode() == 401) throw new IOException("配对已撤销，请重新扫码。");
        if (c.getResponseCode() != 200) throw new IOException("电脑暂不可达，请检查网络与电脑状态。");
        return remembered;
      } finally { c.disconnect(); }
    }, false);
  }

  private void disconnect(HostConnection target) {
    new AlertDialog.Builder(this).setTitle("断开与电脑的连接？")
        .setMessage("保留电脑上的项目和对话，再次连接时需要扫码。")
        .setNegativeButton("取消", null).setPositiveButton("断开", (d, which) -> {
          int view = generation;
          work.execute(() -> {
            HttpURLConnection c = null;
            try {
              c = target.open("/api/host", "GET");
              String body = HostConnection.read(c);
              if (c.getResponseCode() != 200) throw new IOException();
              String id = new JSONObject(body).getString("deviceId"); c.disconnect();
              c = target.open("/api/devices/" + id, "DELETE");
              HostConnection.read(c);
              if (c.getResponseCode() != 200) throw new IOException();
              vault.put("remote", "");
              ui.post(() -> { if (!destroyed && generation == view) home(); });
            } catch (Exception e) { ui.post(() -> { if (generation == view) message("电脑暂不可达，尚未撤销配对，请连接恢复后重试。"); }); }
            finally { if (c != null) c.disconnect(); }
          });
        }).show();
  }

  private void scan() {
    if (checkSelfPermission(android.Manifest.permission.CAMERA) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
      requestPermissions(new String[] {android.Manifest.permission.CAMERA}, 21); return;
    }
    startActivityForResult(new Intent(this, ScanActivity.class), 20);
  }

  private void manualCode(String initial) {
    openPage("pair"); heading("连接电脑", "一个连接，让工作继续。");
    label("粘贴电脑端的完整连接码，也可以返回使用扫码。");
    EditText code = input("CG1. 开头的连接码", false); code.setMaxLines(5); code.setText(initial);
    button("连接电脑", () -> background(() -> HostConnection.connect(code.getText().toString()), true));
    page.addView(status);
  }

  @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] grants) {
    super.onRequestPermissionsResult(request, permissions, grants);
    if (request == 21) {
      if (grants.length > 0 && grants[0] == android.content.pm.PackageManager.PERMISSION_GRANTED) scan();
      else { manualCode(""); message("相机权限未开启，可以粘贴连接码，或在系统设置中开启相机权限。"); }
    }
  }

  private void enterLocal() {
    try {
      if (EngineService.ready && EngineService.connection != null) { showHost(EngineService.connection); return; }
      if (vault.get("key").isEmpty() || vault.get("base").isEmpty() || vault.get("model").isEmpty()) { configureLocal(); return; }
      openPage("loading"); heading("准备好，开始创造。", "正在连接你的本地工作空间。"); page.addView(status);
      startLocal();
    } catch (Exception e) { configureLocal(); message("请重新配置模型服务。"); }
  }

  private void startLocal() {
    if (!EngineService.running) startForegroundService(new Intent(this, EngineService.class));
    waitForEngine();
  }

  private void configureLocal() {
    openPage("config"); heading("接入你的模型", "你的服务，你的选择。");
    label("模型服务地址"); EditText base = input("https://api.example.com/v1", false); base.setSingleLine(true);
    base.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI);
    label("API Key"); EditText key = input("输入 API Key", true);
    try { base.setText(vault.get("base")); if (!vault.get("key").isEmpty()) key.setHint("已加密保存，留空继续使用"); } catch (Exception ignored) {}
    label("模型服务需支持 Responses 接口。密钥仅加密保存在此手机。");
    LinearLayout choices = new LinearLayout(this); choices.setOrientation(LinearLayout.VERTICAL);
    final List<String> selected = new ArrayList<>();
    final String[] identity = {"", ""};
    Spinner active = new Spinner(this);
    Runnable refreshActive = () -> {
      String previous = active.getSelectedItem() == null ? "" : active.getSelectedItem().toString();
      ArrayAdapter<String> adapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, new ArrayList<>(selected));
      active.setAdapter(adapter);
      if (selected.contains(previous)) active.setSelection(selected.indexOf(previous));
    };
    Runnable reset = () -> { identity[0] = ""; selected.clear(); choices.removeAllViews(); refreshActive.run(); };
    android.text.TextWatcher changed = new android.text.TextWatcher() {
      public void beforeTextChanged(CharSequence s, int a, int count, int after) {}
      public void onTextChanged(CharSequence s, int start, int before, int count) { reset.run(); }
      public void afterTextChanged(android.text.Editable e) {}
    };
    base.addTextChangedListener(changed); key.addTextChangedListener(changed);
    Button fetch = button("获取模型    ↓", () -> {});
    page.addView(choices); label("当前使用的模型"); page.addView(active);
    fetch.setOnClickListener(v -> {
      final String address, secret;
      try {
        address = ModelProvider.address(base.getText().toString());
        secret = key.getText().toString().isEmpty() ? vault.get("key") : key.getText().toString().trim();
        if (secret.isEmpty()) throw new IOException("请填写 API Key。");
      } catch (Exception e) { message(e instanceof IOException ? e.getMessage() : "无法读取配置。"); return; }
      int view = generation; fetch.setEnabled(false); message("正在获取模型…");
      work.execute(() -> {
        try {
          List<String> models = ModelProvider.models(address, secret);
          Set<String> saved = new HashSet<>();
          if (address.equals(vault.get("base")) && secret.equals(vault.get("key"))) {
            JSONArray remembered = new JSONArray(vault.get("models").isEmpty() ? "[]" : vault.get("models"));
            for (int i = 0; i < remembered.length(); i++) saved.add(remembered.getString(i));
          }
          String previous = vault.get("model");
          ui.post(() -> {
            if (destroyed || generation != view) return;
            fetch.setEnabled(true);
            try {
              String currentKey = key.getText().toString().isEmpty() ? vault.get("key") : key.getText().toString().trim();
              if (!address.equals(ModelProvider.address(base.getText().toString())) || !secret.equals(currentKey)) { message("配置已变更，请重新获取模型。"); return; }
            } catch (Exception e) { return; }
            reset.run(); identity[0] = address; identity[1] = secret;
            for (String model : models) {
              CheckBox check = new CheckBox(this); check.setText(model); check.setTextColor(INK);
              check.setButtonTintList(android.content.res.ColorStateList.valueOf(ACCENT));
              boolean checked = saved.contains(model) || (saved.isEmpty() && model.equals(previous));
              if (checked) selected.add(model); check.setChecked(checked);
              check.setOnCheckedChangeListener((b, enabled) -> { if (enabled) selected.add(model); else selected.remove(model); refreshActive.run(); });
              choices.addView(check);
            }
            refreshActive.run(); if (selected.contains(previous)) active.setSelection(selected.indexOf(previous));
            message("已获取 " + models.size() + " 个模型，请选择要使用的模型。");
          });
        } catch (Exception e) { ui.post(() -> { if (!destroyed && generation == view) {
          fetch.setEnabled(true); message(e instanceof IOException ? e.getMessage() : "服务返回的模型列表无法读取。");
        }}); }
      });
    });
    button("保存并开始    →", () -> {
      try {
        if (identity[0].isEmpty() || selected.isEmpty() || active.getSelectedItem() == null) throw new IOException("请先获取模型，并至少选择一个。");
        if (EngineService.running) throw new IOException("请先停止本地环境，再更改模型配置。");
        vault.put("base", identity[0]); vault.put("key", identity[1]);
        vault.put("models", new JSONArray(selected).toString()); vault.put("model", active.getSelectedItem().toString());
        key.setText(""); enterLocal();
      } catch (Exception e) { message(e instanceof IOException ? e.getMessage() : "无法保存模型配置。"); }
    });
    page.addView(status);
    if (EngineService.running) button("停止本地环境", () -> { startService(new Intent(this, EngineService.class).setAction("STOP")); message("正在停止，项目和对话会保留。"); });
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
    generation++; screen = "chat";
    host = selected;
    closeStreams();
    if (web != null) web.destroy();
    LinearLayout shell = new LinearLayout(this);
    shell.setOrientation(LinearLayout.VERTICAL);
    shell.setBackgroundColor(0xff0c1012);
    TextView heading = text("‹ 首页    ·    当前运行主机：" + selected.name, 14, 0xffc0ec91);
    heading.setPadding(dp(16), dp(9), dp(16), dp(9));
    heading.setOnClickListener(v -> home());
    shell.addView(heading);
    LinearLayout sessions = new LinearLayout(this);
    sessions.setPadding(dp(12), 0, dp(12), dp(4));
    boolean local = selected == EngineService.connection;
    try {
      String saved = vault.get("remote");
      if (!saved.isEmpty()) {
        HostConnection remote = HostConnection.restore(saved);
        TextView computer = text((local ? "" : "● ") + "电脑会话", 14, local ? MUTED : ACCENT);
        computer.setGravity(Gravity.CENTER); computer.setPadding(dp(10), dp(12), dp(10), dp(12));
        computer.setOnClickListener(v -> { if (local) showHost(remote); });
        sessions.addView(computer, new LinearLayout.LayoutParams(0, -2, 1));
      }
    } catch (Exception ignored) {}
    TextView phone = text((local ? "● " : "") + "手机本地会话", 14, local ? ACCENT : MUTED);
    phone.setGravity(Gravity.CENTER); phone.setPadding(dp(10), dp(12), dp(10), dp(12));
    phone.setOnClickListener(v -> { if (!local) enterLocal(); });
    sessions.addView(phone, new LinearLayout.LayoutParams(0, -2, 1));
    shell.addView(sessions);
    if (selected == EngineService.connection) {
      TextView settings = text("模型与 API 设置   ↗", 12, ACCENT);
      settings.setPadding(dp(16), 0, dp(16), dp(10)); settings.setOnClickListener(v -> configureLocal()); shell.addView(settings);
    }
    web = new WebView(this);
    web.setBackgroundColor(0xff0c1012);
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
          || path.startsWith("/api/files/upload")
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
    public void upload(String id, String threadId, int remaining) {
      if (!id.matches("[0-9]{1,12}") || !threadId.matches("[0-9a-fA-F-]{36}") || remaining < 1 || remaining > 8) return;
      ui.post(() -> {
        if (destroyed || generation != view) return;
        if (pendingUpload != null) { uploadResult(new PendingUpload(id, threadId, view, remaining, target), new JSONArray(), "已有文件选择窗口打开。"); return; }
        PendingUpload upload = new PendingUpload(id, threadId, view, remaining, target);
        pendingUpload = upload;
        Intent choose = new Intent(Intent.ACTION_OPEN_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
            .putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        try { startActivityForResult(choose, 8); }
        catch (Exception e) {
          pendingUpload = null;
          uploadResult(upload, new JSONArray(), "无法打开文件选择窗口。");
        }
      });
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

  private void uploadResult(PendingUpload upload, JSONArray files, String error) {
    JSONObject response = new JSONObject();
    try {
      response.put("files", files);
      if (error != null) response.put("error", error);
    } catch (org.json.JSONException ignored) {}
    script(upload.view, "window.codexGoResult(" + JSONObject.quote(upload.id) + ",200," + JSONObject.quote(response.toString()) + ")");
  }

  @Override
  protected void onActivityResult(int request, int result, Intent data) {
    super.onActivityResult(request, result, data);
    if (request == 8) {
      PendingUpload upload = pendingUpload;
      pendingUpload = null;
      if (upload == null || upload.view != generation) return;
      if (result != RESULT_OK || data == null) { uploadResult(upload, new JSONArray(), null); return; }
      List<Uri> documents = new ArrayList<>();
      ClipData clip = data.getClipData();
      if (clip != null) {
        for (int i = 0; i < clip.getItemCount(); i++) documents.add(clip.getItemAt(i).getUri());
      } else if (data.getData() != null) documents.add(data.getData());
      if (documents.size() > upload.remaining) {
        uploadResult(upload, new JSONArray(), "每条消息最多 8 个附件，本次还可添加 " + upload.remaining + " 个。"); return;
      }
      work.execute(() -> {
        JSONArray files = new JSONArray();
        String error = null;
        try {
          for (Uri document : documents) {
            if (destroyed || generation != upload.view) break;
            files.put(AttachmentUpload.send(this, upload.target, upload.threadId, document));
          }
        } catch (Exception e) {
          error = e instanceof IOException ? e.getMessage() : "附件上传失败，请检查文件与连接。";
        }
        uploadResult(upload, files, error);
      });
      return;
    }
    if (request == 20) {
      if (result == RESULT_OK && data != null) {
        if (data.getBooleanExtra("manual", false)) manualCode("");
        else { manualCode(""); String code = data.getStringExtra("code");
          if (code != null) background(() -> HostConnection.connect(code), true);
        }
      }
      return;
    }
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
    if (!screen.equals("home")) home();
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
