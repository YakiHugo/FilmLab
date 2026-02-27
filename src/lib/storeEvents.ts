type Listener<T> = (payload: T) => void;

export interface ChatToolDispatchPayload {
  toolName: string;
  args: Record<string, unknown>;
  conversationId?: string;
}

interface StoreEvents {
  "assets:imported": string[];
  "assets:deleted": Set<string>;
  "project:reset": void;
  "chat:tool-dispatch": ChatToolDispatchPayload;
}

type EventName = keyof StoreEvents;

const listeners = new Map<EventName, Set<Listener<unknown>>>();

export function on<E extends EventName>(event: E, listener: Listener<StoreEvents[E]>): () => void {
  if (!listeners.has(event)) {
    listeners.set(event, new Set());
  }
  const eventListeners = listeners.get(event);
  if (!eventListeners) {
    return () => {};
  }
  eventListeners.add(listener as Listener<unknown>);
  return () => {
    eventListeners.delete(listener as Listener<unknown>);
  };
}

export function emit<E extends EventName>(
  event: E,
  ...args: StoreEvents[E] extends void ? [] : [StoreEvents[E]]
): void {
  const eventListeners = listeners.get(event);
  if (!eventListeners) {
    return;
  }
  const payload = args[0] as StoreEvents[E];
  for (const listener of eventListeners) {
    try {
      (listener as Listener<StoreEvents[E]>)(payload);
    } catch (error) {
      console.warn(`[storeEvents] listener error for "${event}":`, error);
    }
  }
}
