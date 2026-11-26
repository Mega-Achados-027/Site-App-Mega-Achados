package com.megaachados027.app;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;

public class MainActivity extends Activity {
    private static final String FALLBACK_URL =
            "https://ais-pre-2jqkpyjlk7m3234ljfdkxm-509271427523.us-east1.run.app";

    private WebView webView;
    private LinearLayout loadingOverlay;
    private LinearLayout errorOverlay;
    private TextView errorMessageView;
    private ProgressBar topProgressBar;
    private String appStartUrl;
    private String appHost;
    private boolean hasLoadedOnce = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        if (Build.VERSION.SDK_INT >= 21) {
            window.setStatusBarColor(Color.parseColor("#0B0C10"));
            window.setNavigationBarColor(Color.parseColor("#0B0C10"));
        }

        appStartUrl = readConfiguredAppUrl();
        try {
            Uri parsed = Uri.parse(appStartUrl);
            appHost = parsed.getHost() != null ? parsed.getHost().toLowerCase() : "";
        } catch (Exception e) {
            appHost = "";
        }

        FrameLayout root = new FrameLayout(this);
        root.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
        root.setBackgroundColor(Color.parseColor("#0B0C10"));
        root.setFitsSystemWindows(true);

        // Main WebView
        webView = new WebView(this);
        webView.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
        webView.setBackgroundColor(Color.parseColor("#0B0C10"));
        configureWebView(webView);
        root.addView(webView);

        // Slim top progress bar
        topProgressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        FrameLayout.LayoutParams barParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(3));
        barParams.gravity = Gravity.TOP;
        topProgressBar.setLayoutParams(barParams);
        topProgressBar.setMax(100);
        topProgressBar.setVisibility(View.GONE);
        root.addView(topProgressBar);

        // Native dark splash / loading overlay
        loadingOverlay = buildLoadingOverlay();
        root.addView(loadingOverlay);

        // Native offline / retry overlay
        errorOverlay = buildErrorOverlay();
        errorOverlay.setVisibility(View.GONE);
        root.addView(errorOverlay);

        setContentView(root);

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(appStartUrl);
        }
    }

    private String readConfiguredAppUrl() {
        try {
            InputStream is = getAssets().open("app_url.txt");
            BufferedReader reader = new BufferedReader(new InputStreamReader(is, "UTF-8"));
            String line = reader.readLine();
            reader.close();
            if (line != null) {
                String trimmed = line.trim();
                if (trimmed.startsWith("https://") && trimmed.length() > 10) {
                    return trimmed;
                }
            }
        } catch (Exception ignored) {
            // Fall through to default URL
        }
        return FALLBACK_URL;
    }

    private void configureWebView(WebView wv) {
        WebSettings settings = wv.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadsImagesAutomatically(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        if (Build.VERSION.SDK_INT >= 17) {
            settings.setMediaPlaybackRequiresUserGesture(false);
        }
        if (Build.VERSION.SDK_INT >= 21) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        }

        String defaultUa = settings.getUserAgentString();
        if (defaultUa != null) {
            String cleanUa = defaultUa.replace("; wv", "") + " MegaAchados027App/2.0";
            settings.setUserAgentString(cleanUa);
        }

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= 21) {
            cookieManager.setAcceptThirdPartyCookies(wv, true);
        }

        wv.setWebViewClient(new WebViewClient() {
            // Overrides WebViewClient.shouldOverrideUrlLoading(WebView, WebResourceRequest) on API 24+
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (Build.VERSION.SDK_INT >= 21 && request != null && request.getUrl() != null) {
                    return handleNavigationUrl(request.getUrl().toString());
                }
                return false;
            }

            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleNavigationUrl(url);
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                errorOverlay.setVisibility(View.GONE);
                topProgressBar.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                hasLoadedOnce = true;
                loadingOverlay.setVisibility(View.GONE);
                topProgressBar.setVisibility(View.GONE);
                if (Build.VERSION.SDK_INT >= 21) {
                    CookieManager.getInstance().flush();
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (Build.VERSION.SDK_INT >= 21 && request != null && !request.isForMainFrame()) {
                    return;
                }
                showConnectionError("Não foi possível carregar o Mega Achados 027 agora. Verifique sua internet ou tente novamente.");
            }

            @SuppressWarnings("deprecation")
            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                super.onReceivedError(view, errorCode, description, failingUrl);
                if (!hasLoadedOnce || (failingUrl != null && failingUrl.equals(appStartUrl))) {
                    showConnectionError("Sem conexão no momento. Toque abaixo para tentar novamente.");
                }
            }
        });

        wv.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                topProgressBar.setProgress(newProgress);
                if (newProgress >= 90) {
                    loadingOverlay.setVisibility(View.GONE);
                }
                if (newProgress >= 100) {
                    topProgressBar.setVisibility(View.GONE);
                }
            }

            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                WebView tempWebView = new WebView(MainActivity.this);
                tempWebView.setWebViewClient(new WebViewClient() {
                    // Overrides WebViewClient.shouldOverrideUrlLoading(WebView, WebResourceRequest) on API 24+
                    public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                        if (Build.VERSION.SDK_INT >= 21 && req != null && req.getUrl() != null) {
                            openExternalUrl(req.getUrl().toString());
                        }
                        v.destroy();
                        return true;
                    }

                    @SuppressWarnings("deprecation")
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView v, String url) {
                        openExternalUrl(url);
                        v.destroy();
                        return true;
                    }
                });
                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(tempWebView);
                resultMsg.sendToTarget();
                return true;
            }
        });
    }

    private boolean handleNavigationUrl(String url) {
        if (url == null || url.isEmpty()) return false;
        try {
            Uri uri = Uri.parse(url);
            String scheme = uri.getScheme() != null ? uri.getScheme().toLowerCase() : "";
            String host = uri.getHost() != null ? uri.getHost().toLowerCase() : "";

            // Keep our own app host inside the native WebView
            if (("https".equals(scheme) || "http".equals(scheme))
                    && !appHost.isEmpty()
                    && host.equals(appHost)) {
                // Never try to load APK download inside WebView — hand to system browser/downloader
                if (url.contains("/api/download/") || url.endsWith(".apk")) {
                    openExternalUrl(url);
                    return true;
                }
                return false;
            }

            // Open store links (Amazon, Mercado Livre, KaBuM!, Magalu, Shopee, WhatsApp, flights) in native apps / browser
            openExternalUrl(url);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private void openExternalUrl(String url) {
        if (url == null || url.isEmpty()) return;
        try {
            if (url.startsWith("intent://")) {
                Intent intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
                intent.addCategory(Intent.CATEGORY_BROWSABLE);
                intent.setComponent(null);
                if (intent.resolveActivity(getPackageManager()) != null) {
                    startActivity(intent);
                    return;
                }
                String fallback = intent.getStringExtra("browser_fallback_url");
                if (fallback != null && fallback.startsWith("http")) {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(fallback)));
                }
                return;
            }
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            startActivity(intent);
        } catch (Exception ignored) {
            // Safely ignore malformed external URIs
        }
    }

    private LinearLayout buildLoadingOverlay() {
        LinearLayout container = new LinearLayout(this);
        container.setOrientation(LinearLayout.VERTICAL);
        container.setGravity(Gravity.CENTER);
        container.setBackgroundColor(Color.parseColor("#0B0C10"));
        container.setPadding(dp(32), dp(32), dp(32), dp(32));

        TextView title = new TextView(this);
        title.setText("Mega Achados 027");
        title.setTextColor(Color.parseColor("#FACC15"));
        title.setTextSize(24);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER);
        container.addView(title);

        TextView subtitle = new TextView(this);
        subtitle.setText("Carregando promoções ao vivo...");
        subtitle.setTextColor(Color.parseColor("#A1A1AA"));
        subtitle.setTextSize(14);
        subtitle.setGravity(Gravity.CENTER);
        subtitle.setPadding(0, dp(8), 0, dp(24));
        container.addView(subtitle);

        ProgressBar spinner = new ProgressBar(this);
        container.addView(spinner);

        return container;
    }

    private LinearLayout buildErrorOverlay() {
        LinearLayout container = new LinearLayout(this);
        container.setOrientation(LinearLayout.VERTICAL);
        container.setGravity(Gravity.CENTER);
        container.setBackgroundColor(Color.parseColor("#0B0C10"));
        container.setPadding(dp(32), dp(32), dp(32), dp(32));

        TextView title = new TextView(this);
        title.setText("Mega Achados 027");
        title.setTextColor(Color.parseColor("#FFFFFF"));
        title.setTextSize(22);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER);
        container.addView(title);

        errorMessageView = new TextView(this);
        errorMessageView.setText("Sem conexão no momento.");
        errorMessageView.setTextColor(Color.parseColor("#D4D4D8"));
        errorMessageView.setTextSize(14);
        errorMessageView.setGravity(Gravity.CENTER);
        errorMessageView.setPadding(0, dp(12), 0, dp(24));
        container.addView(errorMessageView);

        Button retryBtn = new Button(this);
        retryBtn.setText("Tentar novamente");
        retryBtn.setAllCaps(false);
        retryBtn.setTextColor(Color.parseColor("#0B0C10"));
        retryBtn.setBackgroundColor(Color.parseColor("#FACC15"));
        retryBtn.setPadding(dp(24), dp(12), dp(24), dp(12));
        retryBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                errorOverlay.setVisibility(View.GONE);
                loadingOverlay.setVisibility(View.VISIBLE);
                webView.loadUrl(appStartUrl);
            }
        });
        container.addView(retryBtn);

        return container;
    }

    private void showConnectionError(String msg) {
        loadingOverlay.setVisibility(View.GONE);
        topProgressBar.setVisibility(View.GONE);
        if (errorMessageView != null) {
            errorMessageView.setText(msg);
        }
        errorOverlay.setVisibility(View.VISIBLE);
    }

    private int dp(int value) {
        float density = getResources().getDisplayMetrics().density;
        return Math.round(value * density);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) {
            webView.saveState(outState);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) {
            webView.onPause();
        }
        if (Build.VERSION.SDK_INT >= 21) {
            CookieManager.getInstance().flush();
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}
