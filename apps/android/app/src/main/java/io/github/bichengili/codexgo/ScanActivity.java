package io.github.bichengili.codexgo;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.*;
import com.google.zxing.BarcodeFormat;
import com.journeyapps.barcodescanner.*;
import java.util.Collections;

/** Camera stays entirely native; QR content never executes as a URL or script. */
public class ScanActivity extends Activity {
  private DecoratedBarcodeView scanner;

  @Override public void onCreate(Bundle saved) {
    super.onCreate(saved);
    getWindow().setStatusBarColor(0xff0c1012);
    getWindow().setNavigationBarColor(0xff0c1012);
    LinearLayout shell = new LinearLayout(this);
    shell.setOrientation(LinearLayout.VERTICAL);
    shell.setBackgroundColor(0xff0c1012);
    TextView title = new TextView(this);
    title.setText("‹   连接电脑"); title.setTextColor(0xffedf1ee); title.setTextSize(19);
    title.setPadding(28, 28, 28, 28); title.setOnClickListener(v -> finish());
    shell.addView(title);
    scanner = new DecoratedBarcodeView(this);
    scanner.getBarcodeView().setDecoderFactory(new DefaultDecoderFactory(Collections.singletonList(BarcodeFormat.QR_CODE)));
    scanner.setStatusText("将电脑上的二维码放入框内");
    shell.addView(scanner, new LinearLayout.LayoutParams(-1, 0, 1));
    TextView note = new TextView(this);
    note.setText("打开电脑端 Codex Go，下滑找到二维码。\n配对后，关闭界面也会保留连接。");
    note.setTextColor(0xffa8bcb0); note.setGravity(Gravity.CENTER); note.setPadding(24, 32, 24, 24);
    shell.addView(note);
    Button manual = new Button(this); manual.setText("改用连接码");
    manual.setTextColor(0xffbdddc8); manual.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.TRANSPARENT));
    manual.setOnClickListener(v -> { setResult(RESULT_OK, new Intent().putExtra("manual", true)); finish(); });
    shell.addView(manual); setContentView(shell);
    scanner.decodeSingle(result -> {
      setResult(RESULT_OK, new Intent().putExtra("code", result.getText())); finish();
    });
  }
  @Override protected void onResume() { super.onResume(); scanner.resume(); }
  @Override protected void onPause() { scanner.pause(); super.onPause(); }
}
