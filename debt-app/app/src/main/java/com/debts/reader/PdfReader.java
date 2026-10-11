package com.debts.reader;

import android.content.Context;
import android.net.Uri;

import com.tom_roush.pdfbox.android.PDFBoxResourceLoader;
import com.tom_roush.pdfbox.pdmodel.PDDocument;
import com.tom_roush.pdfbox.text.PDFTextStripper;
import com.tom_roush.pdfbox.text.TextPosition;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

public class PdfReader {

    public static List<KonnashParser.Customer> read(Context ctx, Uri uri) throws IOException {
        PDFBoxResourceLoader.init(ctx.getApplicationContext());
        List<KonnashParser.Customer> all = new ArrayList<>();
        try (InputStream in = ctx.getContentResolver().openInputStream(uri);
             PDDocument doc = PDDocument.load(in)) {
            for (int p = 1; p <= doc.getNumberOfPages(); p++) {
                final List<KonnashParser.Glyph> glyphs = new ArrayList<>();
                PDFTextStripper stripper = new PDFTextStripper() {
                    @Override
                    protected void processTextPosition(TextPosition t) {
                        glyphs.add(new KonnashParser.Glyph(t.getXDirAdj(), t.getYDirAdj(),
                                t.getWidthDirAdj(), t.getUnicode()));
                    }
                };
                stripper.setStartPage(p);
                stripper.setEndPage(p);
                stripper.getText(doc);
                all.addAll(KonnashParser.parsePage(glyphs));
            }
        }
        return all;
    }
}
