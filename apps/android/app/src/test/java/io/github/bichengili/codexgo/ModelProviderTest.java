package io.github.bichengili.codexgo;

import static org.junit.Assert.*;
import java.util.Arrays;
import org.junit.Test;

public class ModelProviderTest {
  @Test public void normalizesHttpsApiRootAndRejectsEmbeddedCredentials() throws Exception {
    assertEquals("https://api.example.com/v1", ModelProvider.address(" https://api.example.com/v1/ "));
    for (String address : Arrays.asList("http://api.example.com/v1", "https://user:key@example.com", "https://example.com/?key=secret", "https://example.com/#fragment", "not a url")) {
      assertThrows(Exception.class, () -> ModelProvider.address(address));
    }
  }

  @Test public void discoversSortedUniqueModelIdsAndRejectsEmptyOrMalformedResponses() throws Exception {
    assertEquals(Arrays.asList("alpha", "beta"), ModelProvider.parseModels("{\"data\":[{\"id\":\"beta\"},{\"id\":\" alpha \"},{\"id\":\"beta\"},{\"id\":null},{\"id\":123},{\"id\":\"\"}]}"));
    for (String response : Arrays.asList("{\"data\":[]}", "{\"error\":\"no models\"}", "html response")) {
      assertThrows(Exception.class, () -> ModelProvider.parseModels(response));
    }
  }
}
