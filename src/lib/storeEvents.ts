/**
 * Lightweight typed event bus for decoupling stores.
 *
 * Avoids circular dynamic imports between projectStore ↔ editorStore
 * by letting projectStore emit events that editorStore subscribes to.
 */

type Listener<T> = (payload: T) => void;

interface StoreEvents {
  /** Fired when assets are deleted — payload is the set of deleted IDs. */
  "assets:deleted": Set<string>;
  /** Fired when the project is fully reset. */
  "project:reset": void;
}

type EventName = keyof StoreEvents;

const listeners = new Map<EventName, Set<Listener<any>>>();

export function on<E extends EventName>(event: E, listener: Listener<StoreEvents[E]>): () => void {
  if (!listeners.has(event)) {
    listeners.set(event, new Set());
  }
  listeners.get(event)!.add(listener);
  return () => {
    listeners.get(event)?.delete(listener);
  };
}

export function emit<E extends EventName>(event: E, ...args: StoreEvents[E] extends void ? [] : [StoreEvents[E]]): void {
  const set = listeners.get(event);
  if (!set) return;
  const payload = args[0];
  for (const fn of set) {
    try {
      fn(payload);
    } catch (err) {
      console.warn(`[storeEvents] listener error for "${event}":`, err);
    }
  }
}
