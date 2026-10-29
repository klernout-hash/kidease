package ca.kidease.app;

import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

/** Same-host Admin and Cloudflare Access redirects stay in the WebView. */
public class AdminWebOnlyClient extends BridgeWebViewClient {
    public AdminWebOnlyClient(Bridge bridge) {
        super(bridge);
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        Uri url = request.getUrl();
        if (request.isForMainFrame() && AdminWebOnly.isBlocked(url)) {
            view.loadUrl(AdminWebOnly.noteUrl(url));
            return true;
        }
        return super.shouldOverrideUrlLoading(view, request);
    }
}
