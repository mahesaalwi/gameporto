/**
 * EventEmitter - Pub/Sub Pattern for Loose Coupling
 * Enables communication between game systems without direct references.
 */

type EventCallback = (...args: unknown[]) => void;

export class EventEmitter {
  private events: Map<string, Set<EventCallback>> = new Map();

  /**
   * Subscribe to an event.
   */
  on(event: string, callback: EventCallback): void {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event)!.add(callback);
  }

  /**
   * Unsubscribe from an event.
   */
  off(event: string, callback: EventCallback): void {
    const listeners = this.events.get(event);
    if (listeners) {
      listeners.delete(callback);
      if (listeners.size === 0) {
        this.events.delete(event);
      }
    }
  }

  /**
   * Emit an event, calling all subscribed listeners.
   */
  emit(event: string, ...args: unknown[]): void {
    const listeners = this.events.get(event);
    if (listeners) {
      listeners.forEach((callback) => callback(...args));
    }
  }

  /**
   * Subscribe to an event, auto-unsubscribe after first call.
   */
  once(event: string, callback: EventCallback): void {
    const wrapper: EventCallback = (...args: unknown[]) => {
      callback(...args);
      this.off(event, wrapper);
    };
    this.on(event, wrapper);
  }

  /**
   * Remove all listeners. Used for cleanup.
   */
  removeAllListeners(): void {
    this.events.clear();
  }
}

// Singleton global event bus
export const globalEvents = new EventEmitter();
