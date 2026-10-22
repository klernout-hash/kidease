package ca.kidease.app;

import android.util.Log;
import androidx.credentials.CreateCredentialResponse;
import androidx.credentials.CreatePublicKeyCredentialRequest;
import androidx.credentials.CreatePublicKeyCredentialResponse;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.GetPublicKeyCredentialOption;
import androidx.credentials.PublicKeyCredential;
import androidx.credentials.exceptions.CreateCredentialException;
import androidx.credentials.exceptions.GetCredentialException;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

/**
 * Credential Manager fallback for Android WebViews that have no WebAuthn API.
 * The request JSON comes from @simplewebauthn/server. Play Services is not
 * referenced here, so the Huawei flavour can still compile.
 */
@CapacitorPlugin(name = "Passkey")
public class PasskeyPlugin extends Plugin {
    private static final String TAG = "KidEasePasskey";
    private final Executor executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void create(PluginCall call) {
        String requestJson = call.getString("requestJson");
        if (requestJson == null || requestJson.isEmpty() || getActivity() == null) {
            call.reject("Passkey needs the app window");
            return;
        }
        CredentialManager manager = CredentialManager.create(getContext());
        CreatePublicKeyCredentialRequest request = new CreatePublicKeyCredentialRequest(requestJson);
        manager.createCredentialAsync(
            getActivity(),
            request,
            null,
            executor,
            new CredentialManagerCallback<CreateCredentialResponse, CreateCredentialException>() {
                @Override
                public void onResult(CreateCredentialResponse result) {
                    if (!(result instanceof CreatePublicKeyCredentialResponse)) {
                        call.reject("Passkey response was empty");
                        return;
                    }
                    JSObject ret = new JSObject();
                    ret.put("responseJson", ((CreatePublicKeyCredentialResponse) result).getRegistrationResponseJson());
                    call.resolve(ret);
                }

                @Override
                public void onError(CreateCredentialException error) {
                    Log.w(TAG, "create failed");
                    call.reject(error.getMessage() == null ? "Passkey was not saved" : error.getMessage());
                }
            }
        );
    }

    @PluginMethod
    public void get(PluginCall call) {
        String requestJson = call.getString("requestJson");
        if (requestJson == null || requestJson.isEmpty() || getActivity() == null) {
            call.reject("Passkey needs the app window");
            return;
        }
        GetPublicKeyCredentialOption option = new GetPublicKeyCredentialOption(requestJson);
        GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(option).build();
        CredentialManager manager = CredentialManager.create(getContext());
        manager.getCredentialAsync(
            getActivity(),
            request,
            null,
            executor,
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override
                public void onResult(GetCredentialResponse result) {
                    if (!(result.getCredential() instanceof PublicKeyCredential)) {
                        call.reject("Passkey response was empty");
                        return;
                    }
                    JSObject ret = new JSObject();
                    ret.put("responseJson", ((PublicKeyCredential) result.getCredential()).getAuthenticationResponseJson());
                    call.resolve(ret);
                }

                @Override
                public void onError(GetCredentialException error) {
                    Log.w(TAG, "get failed");
                    call.reject(error.getMessage() == null ? "Passkey sign-in did not work" : error.getMessage());
                }
            }
        );
    }
}
