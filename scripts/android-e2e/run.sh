#!/usr/bin/env bash
# Emulator smoke test for the KidEase Android APK. Never echoes the reviewer password.
set -u
set +x
OUT=${OUT:-e2e-out}; mkdir -p "$OUT"
UI="python3 scripts/android-e2e/ui.py"
PKG=ca.kidease.app
RES="$OUT/results.txt"; : > "$RES"
shot() { adb exec-out screencap -p > "$OUT/$1.png"; $UI texts > "$OUT/$1.ui.txt" 2>/dev/null || true; }
mark() { echo "$1: $2${3:+ ($3)}" | tee -a "$RES"; }
launch() { adb shell am force-stop $PKG; adb shell am start -W -n $PKG/.MainActivity >/dev/null; sleep 12; }
dismiss() { $UI tap '^(Accept|Accept all|OK|Got it|Allow|While using the app|Only this time|Not now|Skip|Close|Dismiss)$' 4 || true; }

login() { # $1 role $2 email
  launch; dismiss; dismiss
  $UI tap '(^|\s)(Sign in|Log in|Se connecter)(\s|$)' 25 || true; sleep 4; dismiss
  $UI wait 'EditText|Email' 30 >/dev/null
  $UI tapfield 0 && $UI type "$2"
  $UI tap '^(Continue|Next|Continuer)$' 4 && sleep 3
  $UI tapfield 1 || $UI tapfield 0
  $UI typeenv REVIEWER_ACCOUNT_PASSWORD
  adb shell input keyevent 111 || true
  shot "$1-login-filled"
  $UI tap '^(Sign in|Log in|Se connecter)$' 10 || adb shell input keyevent 66
  sleep 12; dismiss
  shot "$1-after-login"
  if $UI wait '(Account|Compte|Messages|Saved|Dashboard|Sign out|Log out|Waitlist|Tours)' 20 && ! $UI wait '(Incorrect|Invalid|wrong password|Try again)' 2; then
    mark "$1 reviewer login" PASS "$OUT/$1-after-login.png"; return 0
  fi
  mark "$1 reviewer login" FAIL "$OUT/$1-after-login.png"; return 1
}

logout() { adb shell pm clear $PKG >/dev/null; }

# 1. Launch
adb install -r "$APK" | tee "$OUT/install.log"
adb shell dumpsys package $PKG | grep -E 'versionCode|versionName' | tee "$OUT/version.txt"
launch; shot 01-launch
if adb shell pidof $PKG >/dev/null && $UI wait 'KidEase|daycare|garderie|Sign in|Search' 30; then mark "App launches" PASS "$OUT/01-launch.png"; else mark "App launches" FAIL "$OUT/01-launch.png"; fi

# 2. Parent login, account deletion entry, report on a listing
if login parent reviewer-parent@kidease.ca; then
  $UI tap '^(Account|Compte|Profile|Settings)$' 15 || $UI tap '(Menu|Open menu|menu)' 8 && $UI tap '(Account|Settings)' 8
  sleep 5
  for i in 1 2 3 4 5 6 7 8; do $UI wait 'Delete (my )?account|Supprimer le compte' 2 && break; adb shell input swipe 540 1700 540 500 300; sleep 1; done
  shot 03-account-settings
  if $UI wait 'Delete (my )?account|Supprimer le compte' 5; then
    $UI tap 'Delete (my )?account|Supprimer le compte' 5; sleep 5; shot 04-delete-account-screen
    mark "Account deletion entry" PASS "$OUT/03-account-settings.png, $OUT/04-delete-account-screen.png"
  else mark "Account deletion entry" FAIL "$OUT/03-account-settings.png"; fi
fi
logout

# 3. Report / block on a listing (signed out is enough to see the controls; parent session re-used if needed)
login parent-listing reviewer-parent@kidease.ca >/dev/null 2>&1 || true
adb shell am start -W -a android.intent.action.VIEW -d "https://www.kidease.ca/daycare/abi-family-childcare-500e7862" $PKG >/dev/null; sleep 12; dismiss
shot 05-listing-top
found=""
for i in $(seq 1 18); do
  if $UI wait '(Report (this )?(listing|centre|daycare)|Report a problem|Flag|Block|Signaler)' 2; then found=1; break; fi
  adb shell input swipe 540 1700 540 500 300; sleep 1
done
shot 06-listing-report
if [ -n "$found" ]; then
  $UI tap '(Report (this )?(listing|centre|daycare)|Report a problem|Signaler)' 5 && sleep 3 && shot 07-listing-report-open
  mark "Report/block on a listing" PASS "$OUT/06-listing-report.png"
else mark "Report/block on a listing" FAIL "$OUT/06-listing-report.png"; fi
logout

# 4. Daycare login
login daycare reviewer-provider@kidease.ca || { logout; login daycare-dotted reviewer.daycare@kidease.ca; }
logout

# 5. App links
adb shell pm verify-app-links --re-verify $PKG || true
sleep 30
adb shell pm get-app-links $PKG | tee "$OUT/get-app-links.txt"
adb shell am start -W -a android.intent.action.VIEW -d "https://kidease.ca/" >/dev/null; sleep 8
adb shell dumpsys activity activities | grep -E 'mResumedActivity|topResumedActivity' | tee "$OUT/deeplink-resumed.txt"
shot 08-deeplink-kidease-ca
if grep -q 'kidease.ca: verified' "$OUT/get-app-links.txt"; then mark "App links (kidease.ca)" PASS "$OUT/get-app-links.txt"; else mark "App links (kidease.ca)" FAIL "$OUT/get-app-links.txt"; fi
adb logcat -d > "$OUT/logcat.txt" 2>/dev/null || true
cat "$RES"
