package com.absence.register;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.StrictMode;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

public class MainActivity extends Activity {
    private static final int PICK_FILE = 1;
    private static final String DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    private static final String FOLDER = "سجلات الغيابات";

    private WebView web;
    private ValueCallback<Uri[]> pendingFileCallback;
    private Uri lastSaved;
    private WebView printView; // kept alive until the print job has read it

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Below Android 10 the saved file is shared as a file:// Uri.
        StrictMode.setVmPolicy(new StrictMode.VmPolicy.Builder().build());

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        web.addJavascriptInterface(new Bridge(), "Android");
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pendingFileCallback != null) pendingFileCallback.onReceiveValue(null);
                pendingFileCallback = callback;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{DOCX_MIME, "application/pdf", "text/plain", "application/msword"});
                try {
                    startActivityForResult(Intent.createChooser(i, "اختر ملف الأسماء"), PICK_FILE);
                } catch (ActivityNotFoundException e) {
                    pendingFileCallback = null;
                    return false;
                }
                return true;
            }
        });
        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == PICK_FILE && pendingFileCallback != null) {
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null) result = new Uri[]{data.getData()};
            pendingFileCallback.onReceiveValue(result);
            pendingFileCallback = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    private void toast(final String msg) {
        runOnUiThread(new Runnable() {
            public void run() { Toast.makeText(MainActivity.this, msg, Toast.LENGTH_LONG).show(); }
        });
    }

    private class Bridge {
        @JavascriptInterface
        public String getTemplate() {
            try {
                InputStream in = getAssets().open("template.docx");
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                in.close();
                return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
            } catch (Exception e) {
                return "";
            }
        }

        /** Saves to Downloads/سجلات الغيابات. Returns the shown path, "PERM" when permission was requested, or "ERR:...". */
        @JavascriptInterface
        public String saveFile(String base64, String name) {
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentResolver r = getContentResolver();
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                    v.put(MediaStore.MediaColumns.MIME_TYPE, DOCX_MIME);
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + FOLDER);
                    Uri uri = r.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (uri == null) return "ERR:تعذّر إنشاء الملف";
                    OutputStream os = r.openOutputStream(uri);
                    os.write(bytes);
                    os.close();
                    lastSaved = uri;
                } else {
                    if (Build.VERSION.SDK_INT >= 23 &&
                            checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                        requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, 2);
                        return "PERM";
                    }
                    File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), FOLDER);
                    dir.mkdirs();
                    File f = new File(dir, name);
                    for (int i = 2; f.exists(); i++) f = new File(dir, name.replace(".docx", " (" + i + ").docx"));
                    FileOutputStream fos = new FileOutputStream(f);
                    fos.write(bytes);
                    fos.close();
                    lastSaved = Uri.fromFile(f);
                    name = f.getName();
                }
                return "التنزيلات / " + FOLDER + " / " + name;
            } catch (Exception e) {
                return "ERR:" + e.getMessage();
            }
        }

        /** Lays the register out in an off-screen WebView and opens the system print screen ("Save as PDF"). */
        @JavascriptInterface
        public void printPdf(final String html, final String name) {
            runOnUiThread(new Runnable() {
                public void run() {
                    final WebView pv = new WebView(MainActivity.this);
                    printView = pv;
                    pv.getSettings().setAllowFileAccess(true);
                    pv.setWebViewClient(new WebViewClient() {
                        private boolean started;

                        @Override
                        public void onPageFinished(WebView view, String url) {
                            if (started) return;
                            started = true;
                            PrintManager pm = (PrintManager) getSystemService(PRINT_SERVICE);
                            PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(name);
                            PrintAttributes attrs = new PrintAttributes.Builder()
                                    .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                                    .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                                    .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
                                    .build();
                            pm.print(name, adapter, attrs);
                        }
                    });
                    pv.loadDataWithBaseURL("file:///android_asset/", html, "text/html", "UTF-8", null);
                }
            });
        }

        @JavascriptInterface
        public void openFile() {
            if (lastSaved == null) return;
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(lastSaved, DOCX_MIME);
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                startActivity(i);
            } catch (ActivityNotFoundException e) {
                toast("لا يوجد تطبيق لفتح ملفات Word. ثبّت WPS Office أو Microsoft Word.");
            }
        }

        @JavascriptInterface
        public void shareFile() {
            if (lastSaved == null) return;
            Intent i = new Intent(Intent.ACTION_SEND);
            i.setType(DOCX_MIME);
            i.putExtra(Intent.EXTRA_STREAM, lastSaved);
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(i, "مشاركة السجل");
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(chooser);
        }
    }
}
