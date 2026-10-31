package io.github.bichengili.codexgo;

import java.io.*;
import java.net.*;
import java.util.*;
import org.json.*;

/** Calls only the configured HTTPS provider and never follows a key-bearing redirect. */
final class ModelProvider {
  static String address(String value) throws Exception {
    URI u = new URI(value.trim());
    if (!"https".equals(u.getScheme()) || u.getHost() == null || u.getUserInfo() != null
        || u.getQuery() != null || u.getFragment() != null)
      throw new IOException("请输入 HTTPS 模型服务地址，例如 https://api.example.com/v1。");
    return u.toString().replaceAll("/+$", "");
  }

  static List<String> models(String base, String key) throws Exception {
    if (key.trim().isEmpty() || key.contains("\n") || key.contains("\r")) throw new IOException("请填写有效 API Key。");
    HttpURLConnection conn = (HttpURLConnection) new URL(address(base) + "/models").openConnection();
    conn.setInstanceFollowRedirects(false); conn.setConnectTimeout(15000); conn.setReadTimeout(20000);
    conn.setRequestProperty("Authorization", "Bearer " + key);
    conn.setRequestProperty("Accept", "application/json");
    try {
      int status = conn.getResponseCode();
      if (status == 401 || status == 403) throw new IOException("服务拒绝访问，请检查 API Key。");
      if (status != 200) throw new IOException("获取模型失败（HTTP " + status + "），请确认服务地址包含正确的 API 路径。");
      try (InputStream in = conn.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
        byte[] buffer = new byte[8192]; int n, total = 0;
        while ((n = in.read(buffer)) != -1) {
          total += n;
          if (total > 2 * 1024 * 1024) throw new IOException("模型列表过大。");
          out.write(buffer, 0, n);
        }
        return parseModels(out.toString("UTF-8"));
      }
    } finally { conn.disconnect(); }
  }

  static List<String> parseModels(String response) throws Exception {
    JSONArray data = new JSONObject(response).getJSONArray("data");
    SortedSet<String> ids = new TreeSet<>();
    for (int i = 0; i < data.length(); i++) {
      JSONObject item = data.optJSONObject(i);
      if (item == null || !(item.opt("id") instanceof String)) continue;
      String id = item.getString("id").trim();
      if (!id.isEmpty() && id.length() <= 256 && !id.matches(".*[\\r\\n].*")) ids.add(id);
    }
    if (ids.isEmpty()) throw new IOException("服务没有返回可用模型。");
    return new ArrayList<>(ids);
  }
}
