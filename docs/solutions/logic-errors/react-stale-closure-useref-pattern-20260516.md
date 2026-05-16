---
name: react-stale-closure-useref-pattern
description: When two useCallbacks have a circular dependency, use a ref to break the cycle — scheduleNext captures load via loadRef.current to avoid permanent stale closure
metadata:
  type: logic-error
  component: useFlights
  framework: react@19
  date: 2026-05-16
---

# React Stale Closure — `useRef` Pattern for Circular `useCallback` Dependencies

## Symptom

Polling behavior is mostly correct but occasionally uses stale state. Timers fire with outdated versions of functions or values captured from earlier renders. The bug is intermittent and hard to reproduce under normal conditions.

In `useFlights.js`: `scheduleNext` would invoke the first render's `load` on every timer tick, permanently, regardless of how many renders had occurred since.

---

## Why It's Hard to Detect

- **ESLint doesn't flag it.** `scheduleNext` has empty deps `[]` and no linting rule catches that a captured value (`load`) is a `const` re-declared on every render.
- **The app mostly works.** Because `load`'s behavior is largely stable across renders, the stale closure rarely causes a visible failure — only state captured inside `load` (e.g. `mountedRef`, any conditional logic that varies per render) is wrong.
- **The dep array looks intentional.** `load` has `[scheduleNext]` as its dep. `scheduleNext` is stable. This reads as correct use of `useCallback`.
- **Circular deps obscure the root cause.** The obvious fix (add `load` to `scheduleNext`'s deps) appears to create an infinite re-creation loop, making developers leave the empty dep array as-is.

---

## The Broken Pattern

```js
// BUG: scheduleNext closes over `load` at first render and never updates
const scheduleNext = useCallback((delayMs) => {
  clearTimeout(timerRef.current)
  timerRef.current = setTimeout(() => {
    load()  // stale — always the first render's `load`
  }, delayMs)
}, [])  // empty deps: scheduleNext is stable, but permanently holds old `load`

const load = useCallback(async () => {
  // ... fetch logic ...
  scheduleNext(BASE_POLL_MS)
}, [scheduleNext])
```

### Why the obvious fix fails

Adding `load` to `scheduleNext`'s deps creates an infinite loop:

1. `load` changes → `scheduleNext` recreates (dep changed)
2. `scheduleNext` changes → `load` recreates (dep changed)
3. Repeat indefinitely

---

## The Fix — `loadRef` Pattern

```js
// 1. Hold a ref to the latest `load`
const loadRef = useRef(null)

// 2. scheduleNext reads through the ref at call time — always current
const scheduleNext = useCallback((delayMs) => {
  clearTimeout(timerRef.current)
  timerRef.current = setTimeout(() => {
    loadRef.current?.()  // reads the latest `load`, not a stale closure
  }, delayMs)
}, [])  // still stable — no deps needed

// 3. load is unchanged
const load = useCallback(async () => {
  // ... fetch logic ...
  scheduleNext(BASE_POLL_MS)
}, [scheduleNext])

// 4. Write the ref synchronously in the render body (NOT inside useEffect)
loadRef.current = load
```

### Why `loadRef.current = load` must be in the render body, not a `useEffect`

`useEffect` runs after paint. A timer could fire in the gap between render and effect execution, reading a stale ref. Writing directly in the render body guarantees the ref is current before any subsequent timer fires.

---

## How the Cycle Is Broken

| Problem | Solution |
|---|---|
| `scheduleNext` needs to call `load` | Reads `loadRef.current` at fire time instead of closing over `load` |
| `load` needs to call `scheduleNext` | `scheduleNext` is stable (empty deps), safe to include in `load`'s deps |
| Both recreating each other | Ref indirection removes `load` from `scheduleNext`'s dependency graph entirely |

Both callbacks remain stable. No infinite loop. No stale closure.

---

## When to Apply This Pattern

Apply the `loadRef` pattern when:

1. **Two `useCallback`s call each other** (circular dependency) and adding one to the other's dep array would cause infinite recreation.
2. **A stable callback needs to invoke a frequently-changing callback** — e.g., a timer, event listener, or animation loop that calls a handler that depends on component state.
3. **A subscription or interval is set up once** but needs to always invoke the latest version of a function.

Do not use this pattern as a default workaround for all `useCallback` dep management — it hides dependencies from React's tracking. Use it specifically when a genuine circular dep would otherwise force an unstable callback.

---

## How the Bug Was Found

Sub-agent code review flagged that `scheduleNext` has an empty dep array but captures `load` by reference in its closure body. Since `load` is a `const` re-declared on every render, `scheduleNext`'s closure permanently holds the first render's binding — every subsequent render's `load` is unreachable from any timer armed by `scheduleNext`.
