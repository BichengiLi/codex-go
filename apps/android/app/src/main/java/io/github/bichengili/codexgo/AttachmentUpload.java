package io.github.bichengili.codexgo;

import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import java.io.*;
import java.net.HttpURLConnection;
import org.json.JSONObject;

/** Streams only user-selected document URIs to the same API as the web client. */
final class AttachmentUpload {
  static final long MAX_BYTES = 200L * 1024 * 1024;

  static JSONObject send(Context context, HostConnection host, String threadId, Uri uri)
      throws Exception {
    if (uri == null || !"content".equals(uri.getScheme()))
      throw new IOException("请选择系统文档提供的文件。");
    String name = "attachment";
    long size = -1;
    try (Cursor cursor = context.getContentResolver().query(
        uri, new String[] {OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE}, null, null, null)) {
      if (cursor != null && cursor.moveToFirst()) {
        int title = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
        int length = cursor.getColumnIndex(OpenableColumns.SIZE);
        if (title >= 0 && !cursor.isNull(title)) name = cursor.getString(title);
        if (length >= 0 && !cursor.isNull(length)) size = cursor.getLong(length);
      }
    }
    if (size > MAX_BYTES) throw new IOException("单个附件最大支持 200 MB。");
    String path = "/api/files/upload?threadId=" + Uri.encode(threadId) + "&name=" + Uri.encode(name);
    HttpURLConnection connection = host.open(path, "POST");
    try {
      connection.setReadTimeout(300000);
      connection.setDoOutput(true);
      connection.setRequestProperty("Content-Type", "application/octet-stream");
      if (size >= 0) connection.setFixedLengthStreamingMode(size);
      else connection.setChunkedStreamingMode(65536);
      try (InputStream in = context.getContentResolver().openInputStream(uri);
          OutputStream out = connection.getOutputStream()) {
        if (in == null) throw new IOException("无法读取所选文件。");
        byte[] buffer = new byte[65536];
        int count;
        long total = 0;
        while ((count = in.read(buffer)) != -1) {
          total += count;
          if (total > MAX_BYTES) throw new IOException("单个附件最大支持 200 MB。");
          out.write(buffer, 0, count);
        }
      }
      JSONObject result = new JSONObject(HostConnection.read(connection));
      if (connection.getResponseCode() != 200)
        throw new IOException(result.optString("error", "附件上传失败，请检查连接后重试。"));
      return result;
    } finally { connection.disconnect(); }
  }
}
