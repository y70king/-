package com.debts.reader;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;

public class TelegramSender {

    public static void send(String token, String chatId, String text) throws IOException {
        URL url = new URL("https://api.telegram.org/bot" + token + "/sendMessage");
        HttpURLConnection con = (HttpURLConnection) url.openConnection();
        con.setConnectTimeout(15000);
        con.setReadTimeout(20000);
        con.setRequestMethod("POST");
        con.setDoOutput(true);
        con.setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
        String body = "chat_id=" + URLEncoder.encode(chatId, "UTF-8")
                + "&text=" + URLEncoder.encode(text, "UTF-8");
        try (OutputStream os = con.getOutputStream()) {
            os.write(body.getBytes("UTF-8"));
        }
        int code = con.getResponseCode();
        if (code != 200) {
            String err = readAll(con.getErrorStream());
            String desc = err;
            try {
                desc = new JSONObject(err).optString("description", err);
            } catch (Exception ignored) {
            }
            throw new IOException(code + " " + desc);
        }
        readAll(con.getInputStream());
        con.disconnect();
    }

    private static String readAll(InputStream in) throws IOException {
        if (in == null) return "";
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int n;
        while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
        in.close();
        return bos.toString("UTF-8");
    }
}
