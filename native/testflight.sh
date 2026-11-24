#!/usr/bin/env bash
set -euo pipefail
for name in IOS_P12_BASE64 IOS_P12_PASSWORD IOS_PROFILE_BASE64 ASC_KEY_BASE64 ASC_KEY_ID ASC_ISSUER_ID; do
  if [[ -z "${!name:-}" ]]; then echo "Missing signing secret: $name"; exit 1; fi
done
if ! xcodebuild -version | head -1 | grep -Eq 'Xcode (2[6-9]|[3-9][0-9])'; then
  echo "Select an Xcode 26+ runner image before App Store Connect submission."; exit 1
fi
if [[ ! "$ASC_KEY_ID" =~ ^[A-Za-z0-9]+$ ]]; then echo "Invalid ASC_KEY_ID"; exit 1; fi
KEYCHAIN_PATH="$RUNNER_TEMP/pocket-build-signing.keychain-db"
CERT_PATH="$RUNNER_TEMP/pocket-build.p12"
PROFILE_PATH="$RUNNER_TEMP/pocket-build.mobileprovision"
PROFILE_PLIST="$RUNNER_TEMP/pocket-build-profile.plist"
KEY_DIR="$HOME/.appstoreconnect/private_keys"
KEY_PATH="$KEY_DIR/AuthKey_${ASC_KEY_ID}.p8"
PROFILE_INSTALLED=""
cleanup() {
  security delete-keychain "$KEYCHAIN_PATH" >/dev/null 2>&1 || true
  rm -f "$CERT_PATH" "$PROFILE_PATH" "$PROFILE_PLIST" "$KEY_PATH"
  if [[ -n "$PROFILE_INSTALLED" ]]; then rm -f "$PROFILE_INSTALLED"; fi
}
trap cleanup EXIT
mkdir -p build/export "$KEY_DIR"
python3 - <<'PY'
import base64, os, pathlib, re
if not re.fullmatch(r'[A-Za-z0-9]+',os.environ['ASC_KEY_ID']):
    raise SystemExit('Invalid ASC_KEY_ID')
tmp=pathlib.Path(os.environ['RUNNER_TEMP'])
for name,dest in [
 ('IOS_P12_BASE64',tmp/'pocket-build.p12'),
 ('IOS_PROFILE_BASE64',tmp/'pocket-build.mobileprovision'),
 ('ASC_KEY_BASE64',pathlib.Path.home()/'.appstoreconnect/private_keys'/('AuthKey_'+os.environ['ASC_KEY_ID']+'.p8'))]:
    dest.write_bytes(base64.b64decode(os.environ[name],validate=True))
    dest.chmod(0o600)
PY
KEYCHAIN_PASSWORD="$(uuidgen)"
echo "::add-mask::$KEYCHAIN_PASSWORD"
security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
security set-keychain-settings -lut 21600 "$KEYCHAIN_PATH"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
security import "$CERT_PATH" -P "$IOS_P12_PASSWORD" -A -t cert -f pkcs12 -k "$KEYCHAIN_PATH"
security list-keychain -d user -s "$KEYCHAIN_PATH" login.keychain-db
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH" >/dev/null
security cms -D -i "$PROFILE_PATH" > "$PROFILE_PLIST"
PROFILE_UUID="$(/usr/libexec/PlistBuddy -c 'Print :UUID' "$PROFILE_PLIST")"
TEAM_ID="$(/usr/libexec/PlistBuddy -c 'Print :TeamIdentifier:0' "$PROFILE_PLIST")"
export TEAM_ID PROFILE_UUID PROFILE_PLIST
python3 - <<'PY'
import os, plistlib, re, datetime
with open(os.environ['PROFILE_PLIST'],'rb') as f: p=plistlib.load(f)
if not re.fullmatch(r'[A-Fa-f0-9-]+',p['UUID']): raise SystemExit('Invalid profile UUID')
if p['Entitlements'].get('application-identifier')!=os.environ['TEAM_ID']+'.'+os.environ['BUNDLE_ID']:
    raise SystemExit('Profile Bundle ID does not match BUNDLE_ID')
if p.get('ProvisionedDevices') or p.get('ProvisionsAllDevices') or p['Entitlements'].get('get-task-allow'):
    raise SystemExit('Use an App Store Connect distribution profile')
if p['ExpirationDate']<=datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None):
    raise SystemExit('Provisioning profile expired')
opts={'method':'app-store-connect','destination':'export','signingStyle':'manual',
      'teamID':os.environ['TEAM_ID'],'signingCertificate':'Apple Distribution',
      'provisioningProfiles':{os.environ['BUNDLE_ID']:p['UUID']}}
with open('build/ExportOptions.plist','wb') as f: plistlib.dump(opts,f)
PY
mkdir -p "$HOME/Library/MobileDevice/Provisioning Profiles"
PROFILE_INSTALLED="$HOME/Library/MobileDevice/Provisioning Profiles/$PROFILE_UUID.mobileprovision"
cp "$PROFILE_PATH" "$PROFILE_INSTALLED"
xcodebuild -project native/PocketBuild.xcodeproj -scheme PocketBuild \
  -configuration Release -destination 'generic/platform=iOS' \
  -archivePath build/PocketBuild.xcarchive CODE_SIGN_STYLE=Manual \
  DEVELOPMENT_TEAM="$TEAM_ID" PRODUCT_BUNDLE_IDENTIFIER="$BUNDLE_ID" \
  PROVISIONING_PROFILE_SPECIFIER="$PROFILE_UUID" CODE_SIGN_IDENTITY="Apple Distribution" \
  MARKETING_VERSION="$VERSION" CURRENT_PROJECT_VERSION="$BUILD_NUMBER" archive
xcodebuild -exportArchive -archivePath build/PocketBuild.xcarchive \
  -exportPath build/export -exportOptionsPlist build/ExportOptions.plist
xcrun altool --upload-app -t ios -f build/export/PocketBuild.ipa \
  --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"
echo "Uploaded. Apple processing, compliance, tester assignment and applicable beta review still follow."
