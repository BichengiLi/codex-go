package io.github.bichengili.codexgo;

import static org.junit.Assert.*;
import static org.junit.Assume.*;

import java.io.IOException;
import java.nio.file.*;
import java.nio.file.attribute.PosixFilePermissions;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class RuntimeInstallerTest {
  @Rule public TemporaryFolder temporary = new TemporaryFolder();

  @Test public void removesUnreadableProotBindDirectoryDuringUpgrade() throws Exception {
    assumeTrue(FileSystems.getDefault().supportedFileAttributeViews().contains("posix"));
    Path backup = temporary.newFolder("runtime-backup").toPath();
    Path blocked = Files.createDirectories(
        backup.resolve("data/user/0/io.github.bichengili.codexgo/files/runtime"));
    Files.setPosixFilePermissions(blocked, PosixFilePermissions.fromString("---------"));
    try {
      // Root bypasses these permissions and cannot reproduce the device failure.
      assumeFalse(Files.isReadable(blocked));
      RuntimeInstaller.remove(backup);
      assertFalse(Files.exists(backup, LinkOption.NOFOLLOW_LINKS));
    } finally {
      if (Files.exists(blocked, LinkOption.NOFOLLOW_LINKS))
        Files.setPosixFilePermissions(blocked, PosixFilePermissions.fromString("rwx------"));
    }
  }

  @Test public void cleanupDoesNotFollowHomeOrDanglingSymlinks() throws Exception {
    Path backup = temporary.newFolder("runtime-backup").toPath();
    Path home = temporary.newFolder("home").toPath();
    Path project = home.resolve("project.txt");
    Files.write(project, new byte[] {1, 2, 3});
    try {
      Files.createSymbolicLink(backup.resolve("home"), home);
      Files.createSymbolicLink(backup.resolve("missing"), home.resolve("missing"));
    } catch (UnsupportedOperationException | IOException unavailable) {
      assumeNoException("Host does not permit symbolic links", unavailable);
    }
    RuntimeInstaller.remove(backup);
    assertFalse(Files.exists(backup, LinkOption.NOFOLLOW_LINKS));
    assertArrayEquals(new byte[] {1, 2, 3}, Files.readAllBytes(project));
  }
}
