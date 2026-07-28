# Google Maps Trackpad Pan & Pinch Zoom

A Tampermonkey userscript that improves trackpad controls on the Google Maps
website:

- **Two-finger swipe:** Pan the map horizontally or vertically.
- **Two-finger pinch:** Zoom around the pointer position.
- **Mouse wheel:** Keep Google Maps' native scroll-wheel zoom.
- A regular two-finger vertical swipe no longer zooms the map.

The script is primarily designed for MacBook trackpads in Chromium-based
browsers and Firefox.

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Create a new userscript in Tampermonkey.
3. Copy the complete contents of
   [`google-maps-trackpad.user.js`](./google-maps-trackpad.user.js) into the
   editor and save it.
4. Reload [Google Maps](https://www.google.com/maps).

## Configuration

You can adjust the trackpad behavior by editing `SETTINGS` near the top of the
userscript:

```js
const SETTINGS = Object.freeze({
  panSpeed: 1,
  gestureEndDelayMs: 90,
  minimumDelta: 0.01,
  inputDevice: 'auto',
  mouseWheelDeltaThreshold: 50,
  inputTransactionTimeoutMs: 180,
});
```

- `panSpeed`: Multiplier applied to the panning distance. Increase it for
  faster movement or decrease it for slower movement.
- `gestureEndDelayMs`: Number of milliseconds without a wheel event before the
  synthetic drag ends. Trackpad inertia automatically keeps the drag active.
- `minimumDelta`: Ignores extremely small input values to prevent sensor noise
  from starting a drag.
- `inputDevice`: Selects input detection. Keep `'auto'` for normal use. Set it
  to `'trackpad'` or `'mouse'` only when your hardware is detected incorrectly.
- `mouseWheelDeltaThreshold`: In automatic mode, a large initial pixel delta is
  treated as a discrete mouse-wheel step.
- `inputTransactionTimeoutMs`: Wheel events close enough together are treated
  as one gesture and use the same detected input device.

## How It Works

On macOS, browsers expose a regular two-finger swipe as a `WheelEvent`. A
trackpad pinch is normally exposed as a `WheelEvent` with `ctrlKey === true`.

The userscript uses wheel-delta units, size, direction, and event grouping to
distinguish continuous trackpad gestures from ordinary mouse-wheel steps.
Trackpad movement is translated into mouse-drag events supported by Google
Maps, while mouse-wheel and pinch events are left unchanged for native zooming.

Browsers do not currently expose a standard property that identifies the
physical device behind a wheel event. If a high-resolution mouse is detected
incorrectly, set `inputDevice` to `'mouse'`. To force the userscript behavior
for every non-pinch wheel event, set it to `'trackpad'`.

Scroll events outside the map surface, such as those over search results or
side panels, are not intercepted.
