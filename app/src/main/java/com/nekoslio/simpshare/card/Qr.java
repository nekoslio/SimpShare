package com.nekoslio.simpshare.card;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.MultiFormatWriter;
import com.google.zxing.WriterException;
import com.google.zxing.common.BitMatrix;

import java.util.EnumMap;
import java.util.Map;

/** 二维码生成（zxing，纠错级别 M，含静区；任何主题下都白底黑码保证识别率）。 */
final class Qr {

    private static final String DARK = "#1C1B1F";

    private Qr() {
    }

    /** 在 (x, y, size) 区域绘制二维码（白底黑码），失败返回 false */
    static boolean draw(Canvas canvas, String text, int x, int y, int size) {
        if (text == null || text.isEmpty()) return false;
        try {
            Map<EncodeHintType, Object> hints = new EnumMap<>(EncodeHintType.class);
            hints.put(EncodeHintType.CHARACTER_SET, "UTF-8");
            hints.put(EncodeHintType.ERROR_CORRECTION, com.google.zxing.qrcode.decoder.ErrorCorrectionLevel.M);
            hints.put(EncodeHintType.MARGIN, 4);
            BitMatrix matrix = new MultiFormatWriter()
                    .encode(text, BarcodeFormat.QR_CODE, size, size, hints);

            Paint white = new Paint();
            white.setColor(Color.WHITE);
            Paint dark = new Paint();
            dark.setColor(Color.parseColor(DARK));

            canvas.save();
            canvas.translate(x, y);
            canvas.drawRect(0, 0, size, size, white);
            for (int gy = 0; gy < size; gy++) {
                for (int gx = 0; gx < size; gx++) {
                    if (matrix.get(gx, gy)) canvas.drawRect(gx, gy, gx + 1, gy + 1, dark);
                }
            }
            canvas.restore();
            return true;
        } catch (WriterException e) {
            return false;
        }
    }
}
