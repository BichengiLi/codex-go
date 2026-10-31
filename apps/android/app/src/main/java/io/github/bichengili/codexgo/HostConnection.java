package io.github.bichengili.codexgo;

import android.util.Base64;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import org.json.*;

final class HostConnection {
  final String base, cookie, name;

  HostConnection(String base, String cookie, String name) {
    this.base = base;
    this.cookie = cookie;
    this.name = name;
  }

  static boolean validOrigin(String value) {
    try {
      URI u = new URI(value);
      String h = u.getHost();
      boolean lan =
          h != null
              && (h.equals("localhost")
                  || h.equals("127.0.0.1")
                  || h.matches(
                      "10\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}|192\\.168\\.\\d{1,3}\\.\\d{1,3}|172\\.(1[6-9]|2[0-9]|3[01])\\.\\d{1,3}\\.\\d{1,3}"));
      return h != null
          && ("https".equals(u.getScheme()) || ("http".equals(u.getScheme()) && lan))
          && u.getUserInfo() == null
          && u.getQuery() == null
          && u.getFragment() == null
          && (u.getPath().isEmpty() || u.getPath().equals("/"));
    } catch (Exception e) {
      return false;
    }
  }

  static JSONObject parseCode(String text) throws Exception {
    text = text.trim();
    if (!text.matches("CG1\\.[A-Za-z0-9_-]{1,2048}")) throw new IOException("请粘贴电脑 App 中的完整连接码。");
    JSONObject code =
        new JSONObject(
            new String(
                Base64.decode(
                    text.substring(4), Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING),
                StandardCharsets.UTF_8));
    long expires = code.getLong("expiresAt"), now = System.currentTimeMillis();
    if (code.getInt("version") != 1 || !code.getString("code").matches("[0-9]{8}"))
      throw new IOException("连接码格式无效。");
    if (expires < now || expires > now + 360000) throw new IOException("连接码已过期，或手机时间不准确。请在电脑刷新。");
    JSONArray urls = code.getJSONArray("urls");
    if (urls.length() < 1 || urls.length() > 12) throw new IOException("连接地址无效。");
    for (int i = 0; i < urls.length(); i++)
      if (!validOrigin(urls.getString(i))) throw new IOException("连接地址无效。");
    return code;
  }

  static HostConnection pair(String base, String code, String name) throws Exception {
    HttpURLConnection conn = open(base, "/api/pair", "POST", "");
    try {
      write(
          conn, new JSONObject().put("code", code).put("name", android.os.Build.MODEL).toString());
      String body = read(conn);
      if (conn.getResponseCode() != 200)
        throw new IOException(new JSONObject(body).optString("error", "配对失败。"));
      String cookie = conn.getHeaderField("Set-Cookie");
      if (cookie == null || !cookie.startsWith("codex_go_device="))
        throw new IOException("主机没有返回设备凭据。");
      return new HostConnection(base, cookie.split(";", 2)[0], name);
    } finally {
      conn.disconnect();
    }
  }

  static HostConnection connect(String text) throws Exception {
    JSONObject code = parseCode(text);
    JSONArray urls = code.getJSONArray("urls");
    Exception last = new IOException("无法连接电脑，请确认服务已启动。");
    for (int i = 0; i < urls.length(); i++) {
      try {
        return pair(urls.getString(i), code.getString("code"), code.optString("name", "电脑"));
      } catch (SocketTimeoutException
          | ConnectException
          | UnknownHostException
          | javax.net.ssl.SSLException e) {
        last = e;
      }
    }
    throw new IOException("无法连接电脑，请检查 Wi-Fi 或在电脑开启外网后重新复制连接码。", last);
  }

  static HttpURLConnection open(String base, String path, String method, String cookie)
      throws Exception {
    if (!validOrigin(base)
        || !path.startsWith("/api/")
        || path.contains("\\")
        || path.contains("\r")
        || path.contains("\n")
        || path.contains("#")) throw new IOException("无效请求。");
    URI relative = new URI(path);
    if (relative.isAbsolute()
        || relative.getAuthority() != null
        || relative.getRawPath().contains("%")
        || relative.getPath().contains("..")) throw new IOException("无效请求。");
    HttpURLConnection conn =
        (HttpURLConnection) new URL(base.replaceAll("/$", "") + path).openConnection();
    conn.setInstanceFollowRedirects(false);
    conn.setConnectTimeout(5000);
    conn.setReadTimeout(45000);
    conn.setRequestMethod(method);
    conn.setRequestProperty("Origin", base.replaceAll("/$", ""));
    if (!cookie.isEmpty()) conn.setRequestProperty("Cookie", cookie);
    return conn;
  }

  HttpURLConnection open(String path, String method) throws Exception {
    return open(base, path, method, cookie);
  }

  static void write(HttpURLConnection conn, String body) throws Exception {
    conn.setDoOutput(true);
    conn.setRequestProperty("Content-Type", "application/json");
    try (OutputStream stream = conn.getOutputStream()) {
      stream.write(body.getBytes(StandardCharsets.UTF_8));
    }
  }

  static String read(HttpURLConnection conn) throws Exception {
    InputStream stream =
        conn.getResponseCode() < 400 ? conn.getInputStream() : conn.getErrorStream();
    if (stream == null) return "{}";
    try (stream;
        ByteArrayOutputStream out = new ByteArrayOutputStream()) {
      byte[] buffer = new byte[8192];
      int n, total = 0;
      while ((n = stream.read(buffer)) != -1) {
        total += n;
        if (total > 16 * 1024 * 1024) throw new IOException("响应过大。");
        out.write(buffer, 0, n);
      }
      return out.toString("UTF-8");
    }
  }

  String json() throws Exception {
    return new JSONObject().put("base", base).put("cookie", cookie).put("name", name).toString();
  }

  static HostConnection restore(String json) throws Exception {
    JSONObject o = new JSONObject(json);
    if (!validOrigin(o.getString("base"))) throw new IOException("无效地址。");
    return new HostConnection(
        o.getString("base"), o.getString("cookie"), o.optString("name", "电脑"));
  }
}
