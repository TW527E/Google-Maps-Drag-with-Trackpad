[繁體中文](https://github.com/TW527E/Google-Maps-Drag-with-Trackpad/blob/main/README.md) · [**English**](https://github.com/TW527E/Google-Maps-Drag-with-Trackpad/blob/main/README.en.md)

# Google Maps Trackpad Pan & Pinch Zoom

Natural trackpad controls for Google Maps on the web, designed with MacBook users in mind.

[![Install from Greasy Fork](https://img.shields.io/badge/Greasy%20Fork-Install-b82929)](https://greasyfork.org/zh-TW/scripts/588879-google-maps-觸控板雙指拖曳與縮放)
[![Tampermonkey](https://img.shields.io/badge/Tampermonkey-Userscript-00485b)](https://www.tampermonkey.net/)

[Install now](https://greasyfork.org/zh-TW/scripts/588879-google-maps-觸控板雙指拖曳與縮放) · [Report an issue](https://github.com/TW527E/Google-Maps-Drag-with-Trackpad/issues)

## Overview

Google Maps normally interprets a two-finger vertical swipe as zoom input
instead of panning the map. This Tampermonkey userscript rearranges those
controls to behave more like a native map application:

| Input | Result |
| --- | --- |
| Two-finger trackpad swipe | Pan the map vertically, horizontally, or diagonally |
| Two-finger trackpad pinch | Use Google Maps' native pinch zoom |
| Regular mouse wheel | Keep Google Maps' native wheel zoom |

The script intercepts trackpad input only over the map surface. Scrolling in
search results, side panels, and other interface areas continues to work
normally.

## Features

- Vertical, horizontal, and diagonal two-finger panning.
- Native pinch zoom centered around the pointer position.
- Automatic detection of trackpad gestures and regular mouse-wheel input.
- Trackpad inertia is preserved for natural-feeling movement.
- Works across Google Maps' dynamic page and URL transitions.
- No analytics, tracking, data collection, or third-party requests.

## Installation

### Greasy Fork (recommended)

1. Install [Tampermonkey](https://www.tampermonkey.net/) or another compatible
   userscript manager.
2. Open the [Greasy Fork script page](https://greasyfork.org/zh-TW/scripts/588879-google-maps-觸控板雙指拖曳與縮放).
3. Select **Install this script** and confirm the installation in your
   userscript manager.
4. Reload [Google Maps](https://www.google.com/maps).

### Manual installation

1. Create a new userscript in Tampermonkey.
2. Copy the complete contents of
   [`google-maps-trackpad.user.js`](https://github.com/TW527E/Google-Maps-Drag-with-Trackpad/blob/main/google-maps-trackpad.user.js).
3. Paste it into the editor, save it, and reload Google Maps.

## Configuration

To customize the controls, edit `SETTINGS` near the top of the userscript:

```js
const SETTINGS = Object.freeze({
  panSpeed: 1,
  gestureEndDelayMs: 90,
  minimumDelta: 0.01,
  inputDevice: 'auto',
  mouseWheelDeltaThreshold: 50,
  inputTransactionTimeoutMs: 180,
  pinchMomentumGuardMs: 140,
  recentPanMomentumMs: 700,
  pointerTakeoverGuardMs: 140,
});
```

| Setting | Default | Description |
| --- | --- | --- |
| `panSpeed` | `1` | Panning-distance multiplier. Increase it for faster movement. |
| `gestureEndDelayMs` | `90` | Delay before ending the synthetic drag after wheel input stops. |
| `minimumDelta` | `0.01` | Ignores extremely small values that may be caused by sensor noise. |
| `inputDevice` | `'auto'` | Detection mode: `'auto'`, `'trackpad'`, or `'mouse'`. |
| `mouseWheelDeltaThreshold` | `50` | Initial large-delta threshold used to recognize a mouse-wheel step. |
| `inputTransactionTimeoutMs` | `180` | Maximum interval for grouping wheel events into one gesture. |
| `pinchMomentumGuardMs` | `140` | Quiet period used to discard residual pan inertia after a pinch interrupts a fast pan. |
| `recentPanMomentumMs` | `700` | Time window in which a new gesture actively interrupts an already-running map momentum animation. |
| `pointerTakeoverGuardMs` | `140` | Quiet period used to discard residual two-finger inertia after the physical pointer takes over. |

## Input-device detection

Browsers do not currently expose a property that directly identifies whether a
`WheelEvent` came from a mouse or trackpad. The userscript therefore considers
the delta unit, initial delta size, horizontal movement, and event grouping to
estimate the input device.

For most systems, keep the default:

```js
inputDevice: 'auto'
```

If a high-resolution mouse or its driver is detected incorrectly, use:

```js
inputDevice: 'mouse'
```

To force every non-pinch wheel event to pan the map, use:

```js
inputDevice: 'trackpad'
```

## How it works

On macOS, a regular two-finger swipe is normally exposed as a `WheelEvent`,
while a trackpad pinch is commonly exposed as a `WheelEvent` with
`ctrlKey === true`. During the capture phase, the userscript handles regular
trackpad movement over the map before Google Maps can interpret it as zoom
input. It translates the deltas into a continuous mouse drag. When a pinch
interrupts a fast pan, the userscript holds the unfinished drag stationary,
discards residual pan-inertia events, and releases the drag at zero velocity
after input becomes quiet. This prevents the map from shifting, snapping back,
or resuming an old kinetic animation underneath the zoom. A new two-finger pan
also takes over any still-running pan momentum with a zero-distance event,
without injecting reverse movement that could make the map bounce after release.
If the physical pointer moves before two-finger inertia ends, the userscript
releases the synthetic drag at zero velocity before Maps receives that pointer
event, then discards the remaining inertial wheel tail. This prevents the two
coordinate and velocity streams from being combined. The takeover guard only
blocks small, continuous trackpad inertia; a real mouse-wheel step bypasses the
guard immediately and continues to Google Maps for zooming even while the
pointer is moving. Pinch zoom itself also continues to Google Maps.

## Compatibility

- Primarily designed for macOS and MacBook trackpads.
- Verified against the Google Maps website in Chromium-based browsers.
- Firefox and other precision trackpads may vary depending on the wheel-event
  values reported by the browser.

## Troubleshooting

### The mouse wheel pans instead of zooming

Set `inputDevice` to `'mouse'`, or lower `mouseWheelDeltaThreshold` while using
automatic detection.

### A two-finger trackpad swipe still zooms

Set `inputDevice` to `'trackpad'`, or raise `mouseWheelDeltaThreshold` while
using automatic detection.

### Panning moves in the opposite direction

Set `panSpeed` to a negative value such as `-1`.

## License

This project is licensed under the [MIT License](https://github.com/TW527E/Google-Maps-Drag-with-Trackpad/blob/main/LICENSE).

## Links

- [Greasy Fork](https://greasyfork.org/zh-TW/scripts/588879-google-maps-觸控板雙指拖曳與縮放)
- [Source code](https://github.com/TW527E/Google-Maps-Drag-with-Trackpad)
- [Issue tracker](https://github.com/TW527E/Google-Maps-Drag-with-Trackpad/issues)
- [MIT License](https://github.com/TW527E/Google-Maps-Drag-with-Trackpad/blob/main/LICENSE)
