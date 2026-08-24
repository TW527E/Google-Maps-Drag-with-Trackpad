const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const listeners = new Map();
const timers = new Map();
const dispatched = [];
let nextTimerId = 1;
let now = 1000;

function addListener(type, listener) {
  const typeListeners = listeners.get(type) ?? [];
  typeListeners.push(listener);
  listeners.set(type, typeListeners);
}

function notifyWindow(event) {
  for (const listener of listeners.get(event.type) ?? []) listener(event);
}

const scene = { isConnected: true };
const target = {
  isConnected: true,
  closest() {
    return scene;
  },
  dispatchEvent(event) {
    // Model window capture before the event reaches Maps' target listener.
    notifyWindow(event);
    dispatched.push({
      type: event.type,
      x: event.clientX,
      y: event.clientY,
      movementX: event.movementX,
      movementY: event.movementY,
      buttons: event.buttons,
    });
    return true;
  },
};

class MouseEvent {
  constructor(type, init = {}) {
    Object.assign(this, { type, ...init });
  }
}

class WheelEvent {
  static DOM_DELTA_PIXEL = 0;
  static DOM_DELTA_LINE = 1;
  static DOM_DELTA_PAGE = 2;

  constructor(init = {}) {
    Object.assign(this, {
      type: 'wheel',
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      deltaX: 0,
      deltaY: 0,
      clientX: 0,
      clientY: 0,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      defaultPrevented: false,
      immediatePropagationStopped: false,
      ...init,
    });
  }

  preventDefault() {
    this.defaultPrevented = true;
  }

  stopImmediatePropagation() {
    this.immediatePropagationStopped = true;
  }
}

class HTMLCanvasElement {}

const window = {
  screenX: 0,
  screenY: 0,
  innerHeight: 800,
  addEventListener: addListener,
  clearTimeout(id) {
    timers.delete(id);
  },
  setTimeout(callback) {
    const id = nextTimerId++;
    timers.set(id, callback);
    return id;
  },
};

const document = {
  hidden: false,
  elementFromPoint() {
    return target;
  },
  addEventListener: addListener,
};

vm.runInNewContext(
  fs.readFileSync('google-maps-trackpad.user.js', 'utf8'),
  {
    window,
    document,
    MouseEvent,
    WheelEvent,
    HTMLCanvasElement,
    performance: { now: () => now },
    Number,
  },
);

function dispatchWheel(init) {
  const event = new WheelEvent(init);
  notifyWindow(event);
  return event;
}

function dispatchNative(type, init) {
  const event = { type, pointerType: 'mouse', button: 0, buttons: 0, ...init };
  notifyWindow(event);
  dispatched.push({ type, x: event.clientX, y: event.clientY, buttons: event.buttons });
  return event;
}

dispatchWheel({ deltaY: 30, clientX: 500, clientY: 400 });
assert.deepEqual(
  dispatched.map(({ type, x, y, buttons }) => ({ type, x, y, buttons })),
  [
    { type: 'mousedown', x: 500, y: 400, buttons: 1 },
    { type: 'mousemove', x: 500, y: 370, buttons: 1 },
  ],
);

// A real pointer move arrives while inertial wheel input is keeping the
// synthetic left button pressed. The capture listener must clear velocity and
// release at the synthetic endpoint before Maps receives the native move.
dispatchNative('pointermove', { clientX: 501, clientY: 401 });
assert.deepEqual(
  dispatched.slice(2).map(({ type, x, y, movementX, movementY, buttons }) => ({
    type,
    x,
    y,
    movementX,
    movementY,
    buttons,
  })),
  [
    {
      type: 'mousemove',
      x: 500,
      y: 370,
      movementX: 0,
      movementY: 0,
      buttons: 1,
    },
    {
      type: 'mouseup',
      x: 500,
      y: 370,
      movementX: undefined,
      movementY: undefined,
      buttons: 0,
    },
    {
      type: 'pointermove',
      x: 501,
      y: 401,
      movementX: undefined,
      movementY: undefined,
      buttons: 0,
    },
  ],
);

// Continuing to move the mouse with no button held must not perpetually
// restart the takeover timer; otherwise wheel zoom stays disabled for as long
// as the physical pointer is moving.
const [takeoverTimerId] = timers.keys();
dispatchNative('pointermove', { clientX: 510, clientY: 410 });
assert.equal(timers.has(takeoverTimerId), true);
assert.equal(timers.size, 1);

// The old inertial wheel tail is consumed instead of starting another drag.
const eventCountBeforeResidualWheel = dispatched.length;
const residualWheel = dispatchWheel({
  deltaY: 12,
  clientX: 501,
  clientY: 401,
});
assert.equal(residualWheel.defaultPrevented, true);
assert.equal(residualWheel.immediatePropagationStopped, true);
assert.equal(dispatched.length, eventCountBeforeResidualWheel);

// A real detented mouse-wheel step can occur while physical pointer movement
// is still extending the takeover guard. Unlike the small pixel-delta inertia
// above, this event must remain untouched so Google Maps can use it for zoom.
const mouseWheel = dispatchWheel({
  deltaY: 100,
  deltaMode: WheelEvent.DOM_DELTA_PIXEL,
  clientX: 501,
  clientY: 401,
});
assert.equal(mouseWheel.defaultPrevented, false);
assert.equal(mouseWheel.immediatePropagationStopped, false);
assert.equal(dispatched.length, eventCountBeforeResidualWheel);

// Once the guard becomes quiet, a genuinely new two-finger gesture may pan.
for (const callback of [...timers.values()]) callback();
now += 181;
const freshWheel = dispatchWheel({ deltaY: 5, clientX: 501, clientY: 401 });
assert.equal(freshWheel.defaultPrevented, true);
assert.deepEqual(
  dispatched.slice(-2).map(({ type, buttons }) => ({ type, buttons })),
  [
    { type: 'mousedown', buttons: 1 },
    { type: 'mousemove', buttons: 1 },
  ],
);

// Releasing a real left-button drag must use the same capture-phase handoff.
// In particular, the synthetic mouseup stays at its own endpoint rather than
// jumping to the physical cursor coordinate and creating reverse velocity.
const eventCountBeforePointerUp = dispatched.length;
dispatchNative('pointerup', { clientX: 560, clientY: 460, buttons: 0 });
assert.deepEqual(
  dispatched
    .slice(eventCountBeforePointerUp)
    .map(({ type, x, y, movementX, movementY, buttons }) => ({
      type,
      x,
      y,
      movementX,
      movementY,
      buttons,
    })),
  [
    {
      type: 'mousemove',
      x: 501,
      y: 396,
      movementX: 0,
      movementY: 0,
      buttons: 1,
    },
    {
      type: 'mouseup',
      x: 501,
      y: 396,
      movementX: undefined,
      movementY: undefined,
      buttons: 0,
    },
    {
      type: 'pointerup',
      x: 560,
      y: 460,
      movementX: undefined,
      movementY: undefined,
      buttons: 0,
    },
  ],
);

// An ordinary click while no synthetic drag exists must not create a takeover
// guard of its own. A small trackpad wheel event immediately after that click
// should therefore start a normal synthetic pan instead of being swallowed.
for (const callback of [...timers.values()]) callback();
now += 181;
dispatchNative('mousedown', { clientX: 560, clientY: 460, buttons: 1 });
dispatchNative('mouseup', { clientX: 560, clientY: 460, buttons: 0 });
assert.equal(timers.size, 0);
const wheelAfterIdleClick = dispatchWheel({
  deltaY: 5,
  clientX: 560,
  clientY: 460,
});
assert.equal(wheelAfterIdleClick.defaultPrevented, true);
assert.deepEqual(
  dispatched.slice(-2).map(({ type, buttons }) => ({ type, buttons })),
  [
    { type: 'mousedown', buttons: 1 },
    { type: 'mousemove', buttons: 1 },
  ],
);

console.log('Pointer takeover isolates trackpad inertia without blocking mouse-wheel zoom.');
