package com.school.timetable;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * يعرض واجهة التطبيق (HTML/JS داخل assets/www) في WebView،
 * ويوفر جسراً للحفظ التلقائي وحفظ الملفات المصدّرة ومشاركتها وفتح ملفات JSON.
 */
public class MainActivity extends Activity {

    private static final String START_URL = "https://appassets.androidplatform.net/assets/www/index.html";
    private static final String DATA_FILE = "timetable_data.json";
    private static final String EXPORT_DIR = "SchoolTimetable";
    private static final int REQ_OPEN_FILE = 1;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;

    // آخر ملف مُصدَّر (للمشاركة والفتح)
    private File lastFile;
    private String lastMime;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setTextZoom(100);

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("appassets.androidplatform.net".equals(uri.getHost())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (ActivityNotFoundException ignored) {
                }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                try {
                    startActivityForResult(Intent.createChooser(i, "اختر ملف الجدول (JSON)"), REQ_OPEN_FILE);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        web.addJavascriptInterface(new Bridge(), "AndroidBridge");

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(START_URL);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_OPEN_FILE) {
            if (fileCallback != null) {
                fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
                fileCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        // تغلق الواجهة النافذة المفتوحة أولاً؛ وإلا نخرج من التطبيق
        web.evaluateJavascript("(window.handleBack && window.handleBack()) ? 'yes' : 'no'", value -> {
            if (value == null || !value.contains("yes")) finish();
        });
    }

    @Override
    protected void onDestroy() {
        if (web != null) web.destroy();
        super.onDestroy();
    }

    private void toast(final String msg) {
        runOnUiThread(() -> Toast.makeText(this, msg, Toast.LENGTH_LONG).show());
    }

    private static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        return out.toByteArray();
    }

    private static String safeName(String name) {
        String n = name == null ? "" : name.replaceAll("[\\\\/:*?\"<>|]", "-").trim();
        return n.isEmpty() ? "export" : n;
    }

    /** الجسر الذي تستدعيه الواجهة باسم window.AndroidBridge */
    private class Bridge {

        @JavascriptInterface
        public String loadData() {
            File f = new File(getFilesDir(), DATA_FILE);
            if (!f.exists()) return "";
            try (InputStream in = new FileInputStream(f)) {
                return new String(readAll(in), StandardCharsets.UTF_8);
            } catch (IOException e) {
                return "";
            }
        }

        @JavascriptInterface
        public void saveData(String json) {
            File tmp = new File(getFilesDir(), DATA_FILE + ".tmp");
            File f = new File(getFilesDir(), DATA_FILE);
            try (OutputStream out = new FileOutputStream(tmp)) {
                out.write(json.getBytes(StandardCharsets.UTF_8));
            } catch (IOException e) {
                return;
            }
            if (!tmp.renameTo(f)) {
                f.delete();
                tmp.renameTo(f);
            }
        }

        /** يحفظ الملف في مجلد التنزيلات ويعيد رسالة لعرضها */
        @JavascriptInterface
        public String saveFile(String name, String mime, String base64) {
            name = safeName(name);
            byte[] data = Base64.decode(base64, Base64.DEFAULT);

            // نسخة في الذاكرة المؤقتة للمشاركة والفتح
            try {
                File dir = new File(getCacheDir(), "exports");
                if (!dir.exists()) dir.mkdirs();
                File f = new File(dir, name);
                try (OutputStream out = new FileOutputStream(f)) {
                    out.write(data);
                }
                lastFile = f;
                lastMime = mime;
            } catch (IOException e) {
                return "تعذر حفظ الملف: " + e.getMessage();
            }

            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentResolver cr = getContentResolver();
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.Downloads.DISPLAY_NAME, name);
                    v.put(MediaStore.Downloads.MIME_TYPE, mime);
                    v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + EXPORT_DIR);
                    Uri uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (uri == null) throw new IOException("MediaStore");
                    try (OutputStream out = cr.openOutputStream(uri)) {
                        if (out == null) throw new IOException("stream");
                        out.write(data);
                    }
                    return "saved:Download/" + EXPORT_DIR + "/" + name;
                } else {
                    File dir = new File(getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS), EXPORT_DIR);
                    if (!dir.exists()) dir.mkdirs();
                    File f = new File(dir, name);
                    try (OutputStream out = new FileOutputStream(f)) {
                        out.write(data);
                    }
                    return "saved:" + f.getAbsolutePath();
                }
            } catch (Exception e) {
                // لم يُحفظ في التنزيلات، لكن المشاركة ما زالت ممكنة
                return "shareonly:" + name;
            }
        }

        @JavascriptInterface
        public void shareLast() {
            if (lastFile == null) return;
            runOnUiThread(() -> {
                try {
                    Uri uri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".files", lastFile);
                    Intent i = new Intent(Intent.ACTION_SEND);
                    i.setType(lastMime);
                    i.putExtra(Intent.EXTRA_STREAM, uri);
                    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(Intent.createChooser(i, "مشاركة الملف"));
                } catch (Exception e) {
                    toast("تعذرت المشاركة");
                }
            });
        }

        @JavascriptInterface
        public void openLast() {
            if (lastFile == null) return;
            runOnUiThread(() -> {
                try {
                    Uri uri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".files", lastFile);
                    Intent i = new Intent(Intent.ACTION_VIEW);
                    i.setDataAndType(uri, lastMime);
                    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(i);
                } catch (ActivityNotFoundException e) {
                    toast("لا يوجد تطبيق لفتح هذا الملف. ثبّت Excel أو Word أو WPS Office.");
                } catch (Exception e) {
                    toast("تعذر فتح الملف");
                }
            });
        }
    }
}
