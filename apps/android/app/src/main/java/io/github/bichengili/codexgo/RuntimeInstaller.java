package io.github.bichengili.codexgo;

import android.content.Context;
import android.system.Os;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.zip.GZIPInputStream;
import org.json.JSONObject;

/** Transactional installation: immutable userspace and persistent /root are separate. */
final class RuntimeInstaller {
  static File install(Context context) throws Exception {
    String json;
    try (InputStream in = context.getAssets().open("runtime.json")) {
      json = new String(Compat.all(in), StandardCharsets.UTF_8);
    }
    JSONObject manifest = new JSONObject(json);
    File root = new File(context.getFilesDir(), "runtime"),
        marker = new File(root, ".version"),
        backup = new File(context.getFilesDir(), "runtime-backup");
    if (!root.exists() && backup.exists() && !backup.renameTo(root))
      throw new IOException("无法恢复之前的运行环境。");
    if (marker.isFile() && Compat.read(marker.toPath()).equals(manifest.getString("sha256")))
      return root;
    if (context.getFilesDir().getUsableSpace() < 1500L * 1024 * 1024)
      throw new IOException("可用空间不足，请保留至少 1.5 GB。");
    File staging = new File(context.getFilesDir(), "runtime-staging");
    remove(staging.toPath());
    staging.mkdirs();
    File archive = new File(context.getCacheDir(), "runtime.tgz");
    try {
      EngineService.status = "正在校验手机运行环境…";
      MessageDigest hash = MessageDigest.getInstance("SHA-256");
      try (InputStream in = context.getAssets().open("runtime.tgz");
          OutputStream out = new FileOutputStream(archive)) {
        byte[] buffer = new byte[65536];
        int n;
        while ((n = in.read(buffer)) != -1) {
          hash.update(buffer, 0, n);
          out.write(buffer, 0, n);
        }
      }
      if (!hex(hash.digest()).equals(manifest.getString("sha256")))
        throw new IOException("运行环境校验失败，请重新安装。");
      EngineService.status = "正在解压手机运行环境，首次启动需要几分钟…";
      try (InputStream in =
          new BufferedInputStream(
              new GZIPInputStream(new FileInputStream(archive), 65536), 65536)) {
        extract(in, staging);
      }
      Compat.write(new File(staging, ".version").toPath(), manifest.getString("sha256"));
      remove(backup.toPath());
      if (root.exists() && !root.renameTo(backup)) throw new IOException("无法更新运行环境，项目已保留。");
      if (!staging.renameTo(root)) {
        backup.renameTo(root);
        throw new IOException("无法完成运行环境安装。");
      }
      remove(backup.toPath());
      return root;
    } finally {
      archive.delete();
      if (staging.exists()) remove(staging.toPath());
    }
  }

  private static String hex(byte[] bytes) {
    StringBuilder s = new StringBuilder();
    for (byte b : bytes) s.append(String.format("%02x", b & 255));
    return s.toString();
  }

  private static String string(byte[] h, int start, int count) {
    int end = start;
    while (end < start + count && h[end] != 0) end++;
    return new String(h, start, end - start, StandardCharsets.UTF_8);
  }

  private static long number(byte[] h, int start, int count) throws IOException {
    try {
      String n = string(h, start, count).trim();
      return n.isEmpty() ? 0 : Long.parseLong(n, 8);
    } catch (Exception e) {
      throw new IOException("运行环境归档格式无效。");
    }
  }

  private static Path resolve(Path root, String name) throws IOException {
    if (name.startsWith("/")) throw new IOException("绝对归档路径。");
    Path p = root.resolve(name).normalize();
    if (!p.startsWith(root) || name.contains("\\")) throw new IOException("归档路径越界。");
    return p;
  }

  private static void copy(InputStream in, OutputStream out, long size) throws IOException {
    byte[] b = new byte[65536];
    while (size > 0) {
      int n = in.read(b, 0, (int) Math.min(size, b.length));
      if (n < 0) throw new EOFException();
      if (out != null) out.write(b, 0, n);
      size -= n;
    }
  }

  private static void extract(InputStream in, File directory) throws Exception {
    Path root = directory.toPath().toAbsolutePath().normalize();
    List<String[]> links = new ArrayList<>();
    List<Path> hard = new ArrayList<>();
    List<String> hardTargets = new ArrayList<>();
    byte[] header = new byte[512];
    String longName = null, longLink = null;
    Map<String, String> pax = new HashMap<>();
    long total = 0;
    int count = 0;
    while (true) {
      int got = Compat.read(in, header, 512);
      if (got != 512) throw new EOFException();
      boolean zero = true;
      for (byte b : header)
        if (b != 0) {
          zero = false;
          break;
        }
      if (zero) break;
      long expected = number(header, 148, 8), actual = 0;
      for (int i = 0; i < 512; i++) actual += (i >= 148 && i < 156) ? 32 : (header[i] & 255);
      if (actual != expected) throw new IOException("归档头校验失败。");
      char type = (char) header[156];
      long size = number(header, 124, 12);
      if (size < 0 || size > 1024L * 1024 * 1024) throw new IOException("归档成员过大。");
      if (type == 'L' || type == 'K' || type == 'x' || type == 'g') {
        if (size > 1024 * 1024) throw new IOException("归档元数据过大。");
        byte[] bytes = new byte[(int) size];
        if (Compat.read(in, bytes, (int) size) != size) throw new EOFException();
        copy(in, null, (512 - size % 512) % 512);
        String text = new String(bytes, StandardCharsets.UTF_8).replace("\0", "");
        if (type == 'L') longName = text;
        else if (type == 'K') longLink = text;
        else if (type == 'x') {
          int at = 0;
          while (at < bytes.length) {
            int space = at;
            while (space < bytes.length && bytes[space] != ' ') space++;
            int length =
                Integer.parseInt(new String(bytes, at, space - at, StandardCharsets.US_ASCII));
            if (length <= 0 || at + length > bytes.length) throw new IOException("PAX 格式无效。");
            String entry =
                new String(bytes, space + 1, at + length - space - 2, StandardCharsets.UTF_8);
            int equal = entry.indexOf('=');
            if (equal > 0) pax.put(entry.substring(0, equal), entry.substring(equal + 1));
            at += length;
          }
        }
        continue;
      }
      String name =
          pax.getOrDefault(
              "path",
              longName != null
                  ? longName
                  : (string(header, 345, 155).isEmpty() ? "" : string(header, 345, 155) + "/")
                      + string(header, 0, 100));
      String link =
          pax.getOrDefault("linkpath", longLink != null ? longLink : string(header, 157, 100));
      if (pax.containsKey("size")) size = Long.parseLong(pax.get("size"));
      pax.clear();
      longName = null;
      longLink = null;
      if (size < 0 || size > 1024L * 1024 * 1024) throw new IOException("归档成员过大。");
      total += size;
      if (total > 2L * 1024 * 1024 * 1024 || ++count > 100000) throw new IOException("归档过大。");
      Path target = resolve(root, name);
      int mode = (int) number(header, 100, 8) & 0777;
      // Links are created last; no extraction can follow an archive-created symlink.
      boolean copied = false;
      if (type == '5') {
        Files.createDirectories(target);
      } else if (type == '0' || type == 0) {
        Files.createDirectories(target.getParent());
        try (OutputStream out = Files.newOutputStream(target, StandardOpenOption.CREATE_NEW)) {
          copy(in, out, size);
        }
        Os.chmod(target.toString(), mode | 0400);
        copied = true;
      } else if (type == '2') {
        resolve(
            root,
            link.startsWith("/")
                ? link.substring(1)
                : root.relativize(target.getParent().resolve(link).normalize()).toString());
        links.add(new String[] {target.toString(), link});
      } else if (type == '1') {
        hard.add(target);
        hardTargets.add(link);
      }
      if (!copied) copy(in, null, size);
      copy(in, null, (512 - size % 512) % 512);
    }
    for (int i = 0; i < hard.size(); i++) {
      Path target = hard.get(i), source = resolve(root, hardTargets.get(i));
      Files.createDirectories(target.getParent());
      Files.copy(source, target);
      Os.chmod(target.toString(), 0755);
    }
    for (String[] pair : links) {
      Path target = Paths.get(pair[0]);
      Files.createDirectories(target.getParent());
      Files.createSymbolicLink(target, Paths.get(pair[1]));
    }
  }

  static void remove(Path target) throws IOException {
    if (!Files.exists(target, LinkOption.NOFOLLOW_LINKS)) return;
    if (Files.isDirectory(target, LinkOption.NOFOLLOW_LINKS)) {
      try (var children = Files.newDirectoryStream(target)) {
        for (Path child : children) remove(child);
      }
    }
    Files.delete(target);
  }
}
