# Erudoza iOS

Native SwiftUI version of Erudoza.

## What is included

- SwiftUI navigation for topic discovery, course maps, lessons, quizzes, and the tutor sheet.
- App Intents for opening an Erudoza topic and starting a study session from Shortcuts or Siri.
- A shared Xcode scheme named `TeachApp`.

## Run

Open `TeachApp.xcodeproj` in Xcode, choose the `TeachApp` scheme, select an iOS Simulator, and run.

Command-line equivalent on macOS:

```sh
xcodebuild \
  -project TeachApp.xcodeproj \
  -scheme TeachApp \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  build
```
