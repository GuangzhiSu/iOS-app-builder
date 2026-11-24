# Pocket Build repository workflow

When the user asks to implement an app, edit the app source and run the appropriate checks. A push changing native sources automatically builds the free SideStore route. PWA changes automatically publish through Pages.

When the user asks only to build existing code, do not make dummy source edits. Create or update `.pocketbuild/request.json` on `main` with exactly:

```json
{"id":"pb-UNIQUE-REQUEST-ID","mode":"sidestore","createdAt":"CURRENT-ISO-UTC-TIME"}
```

Use a fresh unique ID, current time, and the user's selected `sidestore` or `testflight` mode. Requests expire after 24 hours. Include the request ID in the commit message. Read the file first if it exists, and preserve unrelated work.

Use the connected GitHub account for this repository. This path does not require a browser token, an extra backend, or a custom GPT. It does require the current ChatGPT/Codex session to have repository write tools and user authorization.

Inspect `ios-build.yml` runs whose `head_sha` equals the request commit. Confirm the plan job's request ID and mode. Return the actual run, Release, IPA and stable SideStore source URLs. A failed signing preflight is a configuration failure, not a successful TestFlight delivery.

Never request Apple account passwords, device pairing files or signing keys in chat. Signing secrets belong in the user's GitHub `apple-signing` environment. Do not claim builds are installed, or shortcut callbacks prove certificate renewal. Device install, VPN permission, personal automation setup and actual expiry verification require the user's iPhone.

Run `node --test test/*.test.mjs` and `node prepare.mjs` for relevant code changes. Native compilation is checked on the GitHub macOS runner. Do not enable the optional TestFlight schedule until the user has configured and tested signing.
