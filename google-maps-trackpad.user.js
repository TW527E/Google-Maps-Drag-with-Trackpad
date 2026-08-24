// ==UserScript==
// @name:en         Google Maps Trackpad Pan & Pinch Zoom
// @name   Google Maps 觸控板雙指拖曳與縮放
// @namespace    https://github.com/TW527E/Google-Maps-Drag-with-Trackpad
// @version      1.2.4
// @description:en  Use two-finger trackpad scrolling to pan Google Maps while keeping pinch-to-zoom.
// @description 將觸控板雙指滑動改成拖曳 Google Maps，並保留雙指捏合縮放。
// @author       TW527E
// @include      /^https:\/\/(?:www\.)?google\.[^/]+\/maps(?:[/?#].*)?$/
// @include      /^https:\/\/maps\.google\.[^/]+\/(?:[?#].*)?$/
// @run-at       document-start
// @grant        none
// @license      MIT
// ==/UserScript==

(() => {
  'use strict';

  /*
   * Chrome/Firefox on macOS report these two trackpad gestures differently:
   *
   *   Two-finger slide  -> WheelEvent with ctrlKey === false
   *   Two-finger pinch  -> WheelEvent with ctrlKey === true
   *
   * We consume only the first kind and turn it into a synthetic mouse drag.
   * Pinch events continue to Google Maps unchanged, so its native smooth zoom
   * remains responsible for scaling around the pointer.
   */

  const SETTINGS = Object.freeze({
    // Increase this if panning feels too slow; decrease it if it feels too fast.
    panSpeed: 1,

    // A wheel gesture has no explicit "end" event. Release the synthetic drag
    // after this many quiet milliseconds. Inertial wheel events keep it alive.
    gestureEndDelayMs: 90,

    // Avoid starting a drag for sensor noise close to zero.
    minimumDelta: 0.01,

    // Browsers do not expose whether a WheelEvent came from a mouse or a
    // trackpad. In auto mode, discrete/large wheel steps keep Maps' native zoom
    // while small, continuous or horizontal input is treated as a trackpad.
    inputDevice: 'auto', // 'auto', 'trackpad', or 'mouse'
    mouseWheelDeltaThreshold: 50,
    inputTransactionTimeoutMs: 180,

    // Keep an interrupted drag stationary until pinch input and any remaining
    // pan inertia have both gone quiet. This prevents Maps from starting its
    // own kinetic animation when a pinch interrupts a fast two-finger pan.
    pinchMomentumGuardMs: 140,

    // A synthetic drag may already have been released while Maps is still
    // animating its momentum. A pinch inside this window starts a zero-net
    // drag to interrupt that animation before zooming.
    recentPanMomentumMs: 700,

    // Ignore wheel inertia briefly after a real mouse/pointer event takes over
    // an active synthetic drag. Otherwise residual wheel events can immediately
    // press the synthetic button again and interleave both pointer streams.
    pointerTakeoverGuardMs: 140,
  });

  const MAP_SURFACE_SELECTORS = [
    '#scene',
    '.widget-scene',
    '[role="application"]',
    '[class*="mapsConsumerUiSceneCoreScene__scene"]',
  ].join(',');

  let drag = null;
  let releaseTimer = 0;
  let pinchGuardActive = false;
  let pinchGuardTimer = 0;
  let lastPanActivityAt = Number.NEGATIVE_INFINITY;
  let pointerTakeoverActive = false;
  let pointerTakeoverTimer = 0;
  let nativePointerButtons = 0;
  const syntheticMouseEvents = new WeakSet();
  let inputTransaction = {
    kind: null,
    lastEventAt: 0,
  };

  function resetInputTransaction() {
    inputTransaction = {
      kind: null,
      lastEventAt: 0,
    };
  }

  function inputKind(event) {
    if (SETTINGS.inputDevice !== 'auto') return SETTINGS.inputDevice;

    const now = performance.now();
    const isSameTransaction =
      inputTransaction.kind !== null &&
      now - inputTransaction.lastEventAt <= SETTINGS.inputTransactionTimeoutMs;

    inputTransaction.lastEventAt = now;
    if (isSameTransaction) return inputTransaction.kind;

    const absX = Math.abs(event.deltaX);
    const absY = Math.abs(event.deltaY);
    const largestDelta = Math.max(absX, absY);

    // Detented mouse wheels commonly use line/page units. Trackpads in modern
    // desktop browsers normally provide continuous pixel deltas.
    if (event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) {
      inputTransaction.kind = 'mouse';
      return inputTransaction.kind;
    }

    // A non-trivial horizontal component is a strong trackpad signal. Locking
    // the result for the rest of the wheel transaction also covers a gesture
    // that later becomes purely vertical or develops large inertial deltas.
    if (absX > SETTINGS.minimumDelta) {
      inputTransaction.kind = 'trackpad';
      return inputTransaction.kind;
    }

    inputTransaction.kind =
      largestDelta >= SETTINGS.mouseWheelDeltaThreshold
        ? 'mouse'
        : 'trackpad';

    return inputTransaction.kind;
  }

  function wheelPixels(event) {
    let factor = 1;

    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
      factor = 16;
    } else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      factor = Math.max(window.innerHeight, 1);
    }

    return {
      x: event.deltaX * factor * SETTINGS.panSpeed,
      y: event.deltaY * factor * SETTINGS.panSpeed,
    };
  }

  function isUsableCanvas(element) {
    if (!(element instanceof HTMLCanvasElement)) return false;

    const rect = element.getBoundingClientRect();
    return rect.width >= 240 && rect.height >= 180;
  }

  function mapSurfaceAt(x, y) {
    const hit = document.elementFromPoint(x, y);
    if (!hit) return null;

    // Prefer Google Maps' known scene containers. The selectors are kept in a
    // single function because Google occasionally changes its internal DOM.
    const scene = hit.closest?.(MAP_SURFACE_SELECTORS);
    if (scene) return { scene, target: hit };

    // Fallback for a renamed scene container: the primary map is rendered to a
    // large canvas. Only inspect the topmost element so a scrollable side panel
    // layered above the map is never mistaken for the map surface underneath.
    if (isUsableCanvas(hit)) {
      return {
        scene: hit.parentElement ?? hit,
        target: hit,
      };
    }

    return null;
  }

  function emitMouse(type, target, x, y, buttons) {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      detail: type === 'mousedown' ? 1 : 0,
      screenX: window.screenX + x,
      screenY: window.screenY + y,
      clientX: x,
      clientY: y,
      button: 0,
      buttons,
    });

    syntheticMouseEvents.add(event);
    target.dispatchEvent(event);
  }

  function beginDrag(surface, event) {
    drag = {
      scene: surface.scene,
      target: surface.target,
      x: event.clientX,
      y: event.clientY,
    };

    emitMouse('mousedown', drag.target, drag.x, drag.y, 1);
  }

  function moveDrag(dx, dy) {
    if (!drag) return;

    const oldX = drag.x;
    const oldY = drag.y;

    // Wheel deltas describe the direction in which scrollable content moves.
    // A map dragged with the pointer should follow that content direction, so
    // mouse coordinates move opposite to the reported wheel deltas.
    drag.x -= dx;
    drag.y -= dy;

    const event = new MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      screenX: window.screenX + drag.x,
      screenY: window.screenY + drag.y,
      clientX: drag.x,
      clientY: drag.y,
      button: 0,
      buttons: 1,
    });

    // movementX/Y are not consistently accepted in MouseEventInit. Supplying
    // them when configurable helps handlers that prefer relative movement.
    try {
      Object.defineProperties(event, {
        movementX: { configurable: true, value: drag.x - oldX },
        movementY: { configurable: true, value: drag.y - oldY },
      });
    } catch {
      // clientX/clientY above remain sufficient for absolute-position handlers.
    }

    syntheticMouseEvents.add(event);
    drag.target.dispatchEvent(event);
  }

  function endDrag() {
    window.clearTimeout(releaseTimer);
    releaseTimer = 0;

    if (!drag) return;

    emitMouse('mouseup', drag.target, drag.x, drag.y, 0);
    drag = null;
  }

  function scheduleDragEnd() {
    window.clearTimeout(releaseTimer);
    releaseTimer = window.setTimeout(endDrag, SETTINGS.gestureEndDelayMs);
  }

  function finishPinchGuard() {
    window.clearTimeout(pinchGuardTimer);
    pinchGuardTimer = 0;
    pinchGuardActive = false;
    lastPanActivityAt = Number.NEGATIVE_INFINITY;
    resetInputTransaction();

    if (drag) {
      // The pause plus a final zero-distance move clears Maps' drag velocity
      // before mouseup, so releasing cannot start a second kinetic animation.
      moveDrag(0, 0);
      endDrag();
    }
  }

  function schedulePinchGuardEnd() {
    window.clearTimeout(pinchGuardTimer);
    pinchGuardTimer = window.setTimeout(
      finishPinchGuard,
      SETTINGS.pinchMomentumGuardMs,
    );
  }

  function beginOrContinuePinchGuard() {
    pinchGuardActive = true;
    window.clearTimeout(releaseTimer);
    releaseTimer = 0;

    // Keep the existing synthetic drag pressed but motionless while Maps
    // receives native pinch events. Releasing immediately would make Maps use
    // the last fast mousemove as momentum and pan underneath the pinch zoom.
    if (drag) moveDrag(0, 0);
    schedulePinchGuardEnd();
  }

  function interruptRecentMapMomentum(event) {
    if (
      drag ||
      performance.now() - lastPanActivityAt > SETTINGS.recentPanMomentumMs
    ) {
      return;
    }

    const surface = mapSurfaceAt(event.clientX, event.clientY);
    if (!surface) return;

    // A new drag immediately stops Google Maps' kinetic pan. Keep the pointer
    // stationary: an out-and-back probe leaves a non-zero final movement that
    // Maps can interpret as reverse release velocity, which makes the map
    // bounce in the opposite direction.
    beginDrag(surface, event);
    moveDrag(0, 0);
  }

  function cancelPinchGuard() {
    window.clearTimeout(pinchGuardTimer);
    pinchGuardTimer = 0;
    pinchGuardActive = false;
  }

  function finishPointerTakeover() {
    window.clearTimeout(pointerTakeoverTimer);
    pointerTakeoverTimer = 0;

    if (nativePointerButtons !== 0) return;

    pointerTakeoverActive = false;
    resetInputTransaction();
  }

  function schedulePointerTakeoverEnd() {
    window.clearTimeout(pointerTakeoverTimer);
    pointerTakeoverTimer = window.setTimeout(
      finishPointerTakeover,
      SETTINGS.pointerTakeoverGuardMs,
    );
  }

  function beginOrContinuePointerTakeover() {
    const isNewTakeover = !pointerTakeoverActive;
    pointerTakeoverActive = true;
    lastPanActivityAt = Number.NEGATIVE_INFINITY;

    // The next wheel event must be classified independently from the old
    // trackpad transaction. This lets a real mouse-wheel step pass through to
    // Maps while a small/continuous inertial tail is still discarded below.
    if (isNewTakeover) resetInputTransaction();

    if (drag) {
      // Clear the last synthetic velocity sample before releasing. The native
      // event that triggered this function is still in capture phase, so Maps
      // sees the synthetic mouseup before it sees the real pointer movement.
      moveDrag(0, 0);
      endDrag();
    }

    schedulePointerTakeoverEnd();
  }

  function cancelPointerTakeover() {
    window.clearTimeout(pointerTakeoverTimer);
    pointerTakeoverTimer = 0;
    pointerTakeoverActive = false;
    nativePointerButtons = 0;
  }

  function onWheel(event) {
    // macOS trackpad pinch is exposed as ctrl+wheel. Let Google Maps handle the
    // zoom, but keep an active synthetic drag stationary until both the pinch
    // and any wheel events left over from the previous pan have gone quiet.
    if (event.ctrlKey) {
      resetInputTransaction();
      interruptRecentMapMomentum(event);
      beginOrContinuePinchGuard();
      return;
    }

    // Do not hijack browser shortcuts such as Command + wheel, and do not pan
    // while the user is holding other modifiers intentionally.
    if (event.metaKey || event.altKey || event.shiftKey) {
      cancelPinchGuard();
      resetInputTransaction();
      endDrag();
      return;
    }

    const surface = mapSurfaceAt(event.clientX, event.clientY);
    if (!surface) {
      cancelPinchGuard();
      resetInputTransaction();
      endDrag();
      return;
    }

    // A trusted mouse/pointer event has taken ownership of the map. Discard
    // only the old wheel tail until it becomes quiet; never re-press the
    // synthetic left button while native movement is in progress.
    if (pointerTakeoverActive) {
      // Do not let the takeover guard disable Google Maps' normal mouse-wheel
      // zoom. A fresh, discrete wheel transaction is unrelated to the old
      // two-finger inertia and should bypass the guard without losing native
      // pointer-button ownership.
      if (inputKind(event) === 'mouse') {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      resetInputTransaction();
      beginOrContinuePointerTakeover();
      return;
    }

    // A fast pan can continue emitting decreasing non-ctrl wheel events after
    // the fingers have already started pinching. Consume that residual stream
    // and extend the quiet-period timer instead of beginning another drag or
    // allowing Maps to reinterpret it as wheel zoom.
    if (pinchGuardActive) {
      event.preventDefault();
      event.stopImmediatePropagation();
      resetInputTransaction();
      if (drag) moveDrag(0, 0);
      schedulePinchGuardEnd();
      return;
    }

    // Leave ordinary mouse-wheel events untouched so Google Maps can retain
    // its native wheel-to-zoom behavior.
    if (inputKind(event) === 'mouse') {
      endDrag();
      return;
    }

    const delta = wheelPixels(event);
    if (
      Math.abs(delta.x) < SETTINGS.minimumDelta &&
      Math.abs(delta.y) < SETTINGS.minimumDelta
    ) {
      return;
    }

    // Capture phase plus stopImmediatePropagation prevents Maps' original wheel
    // listener from interpreting a vertical two-finger slide as zoom.
    event.preventDefault();
    event.stopImmediatePropagation();

    if (!drag) interruptRecentMapMomentum(event);

    if (!drag || drag.scene !== surface.scene || !drag.target.isConnected) {
      endDrag();
      beginDrag(surface, event);
    }

    moveDrag(delta.x, delta.y);
    lastPanActivityAt = performance.now();
    scheduleDragEnd();
  }

  // document-start is intentional: registering early in capture phase gives the
  // userscript priority over listeners added later by the Google Maps bundle.
  window.addEventListener('wheel', onWheel, {
    capture: true,
    passive: false,
  });

  function isMousePointerEvent(event) {
    return (
      !('pointerType' in event) ||
      event.pointerType === '' ||
      event.pointerType === 'mouse'
    );
  }

  function onNativePointerMove(event) {
    if (syntheticMouseEvents.has(event) || !isMousePointerEvent(event)) return;

    // A real mouse move must not arrive while Maps still sees the synthetic
    // left button held down. Release it during capture so Maps cannot combine
    // the physical cursor jump with the wheel-derived drag velocity.
    nativePointerButtons = event.buttons;
    if (drag || nativePointerButtons !== 0) {
      beginOrContinuePointerTakeover();
    } else if (pointerTakeoverActive && pointerTakeoverTimer === 0) {
      // Recover if pointerup happened outside the window and the previous timer
      // found the button still pressed. Ordinary button-free mouse movement
      // must not keep extending the guard and disable wheel zoom indefinitely.
      schedulePointerTakeoverEnd();
    }
  }

  function onNativePointerDown(event) {
    if (
      syntheticMouseEvents.has(event) ||
      !isMousePointerEvent(event) ||
      event.button !== 0
    ) {
      return;
    }

    nativePointerButtons = event.buttons || 1;
    cancelPinchGuard();
    if (drag || pointerTakeoverActive) beginOrContinuePointerTakeover();
  }

  function onNativePointerUp(event) {
    if (
      syntheticMouseEvents.has(event) ||
      !isMousePointerEvent(event) ||
      (event.type !== 'pointercancel' && event.button !== 0)
    ) {
      return;
    }

    nativePointerButtons = event.buttons;
    cancelPinchGuard();
    if (drag || pointerTakeoverActive) beginOrContinuePointerTakeover();
  }

  // Real pointer input takes ownership immediately. This prevents a native
  // mouse drag or release from interleaving with the synthetic wheel drag.
  window.addEventListener('mousemove', onNativePointerMove, true);
  window.addEventListener('pointermove', onNativePointerMove, true);
  window.addEventListener('mousedown', onNativePointerDown, true);
  window.addEventListener('pointerdown', onNativePointerDown, true);
  window.addEventListener('mouseup', onNativePointerUp, true);
  window.addEventListener('pointerup', onNativePointerUp, true);
  window.addEventListener('pointercancel', onNativePointerUp, true);

  // Do not use capture here: focusing the map blurs the previously focused DOM
  // element, and a captured element-level blur would release our drag at once.
  window.addEventListener('blur', () => {
    cancelPinchGuard();
    cancelPointerTakeover();
    endDrag();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelPinchGuard();
      cancelPointerTakeover();
      endDrag();
    }
  });
})();
