package io.github.bichengili.codexgo;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;

final class Compat {
  static byte[] all(InputStream stream) throws IOException {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    copy(stream, out);
    return out.toByteArray();
  }

  static void copy(InputStream in, OutputStream out) throws IOException {
    byte[] b = new byte[65536];
    int n;
    while ((n = in.read(b)) != -1) if (out != null) out.write(b, 0, n);
  }

  static int read(InputStream in, byte[] b, int size) throws IOException {
    int at = 0, n;
    while (at < size && (n = in.read(b, at, size - at)) != -1) at += n;
    return at;
  }

  static String read(Path file) throws IOException {
    return new String(Files.readAllBytes(file), StandardCharsets.UTF_8);
  }

  static void write(Path file, String text) throws IOException {
    Files.write(file, text.getBytes(StandardCharsets.UTF_8));
  }
}
