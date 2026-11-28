package ca.kidease.app;

import android.net.Uri;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.UUID;

@CapacitorPlugin(name = "PdfShareFiles")
public class PdfShareFilesPlugin extends Plugin {
    @PluginMethod
    public void stage(PluginCall call) {
        String filename = call.getString("filename");
        String base64 = call.getString("base64");
        if (filename == null || !filename.matches("[a-zA-Z0-9_.-]{1,180}\\.pdf")
                || base64 == null || base64.length() > 28_000_000) {
            call.reject("Invalid PDF");
            return;
        }

        File root = new File(getContext().getCacheDir(), "shared-pdfs");
        long cutoff = System.currentTimeMillis() - 86_400_000L;
        File[] previous = root.listFiles();
        if (previous != null) {
            for (File folder : previous) {
                File[] files = folder.listFiles();
                if (folder.lastModified() < cutoff && files != null) {
                    for (File file : files) {
                        file.delete();
                    }
                    folder.delete();
                }
            }
        }

        File folder = new File(root, UUID.randomUUID().toString());
        File file = new File(folder, filename);
        try {
            byte[] content = Base64.decode(base64, Base64.DEFAULT);
            if (!folder.mkdirs()) throw new IOException("Cache directory unavailable");
            try (FileOutputStream output = new FileOutputStream(file)) {
                output.write(content);
            }
            JSObject result = new JSObject();
            result.put("uri", Uri.fromFile(file).toString());
            call.resolve(result);
        } catch (IOException | IllegalArgumentException error) {
            file.delete();
            folder.delete();
            call.reject("Could not prepare PDF");
        }
    }
}
