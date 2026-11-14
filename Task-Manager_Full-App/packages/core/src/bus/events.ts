export type CoreEvent =
  | { type: 'data' }                                                    // something changed: refresh screens (TM-SRS-147)
  | { type: 'alert'; alarmId: number; taskId: number; title: string; body: string } // in-app alarm alert (TM-SRS-123)
  | { type: 'open-task'; taskId: number };                              // user tapped a notification

export type Listener = (e: CoreEvent) => void;
export class EventBus {
  private listeners = new Set<Listener>();
  on(l: Listener): () => void { this.listeners.add(l); return () => { this.listeners.delete(l); }; }
  emit(e: CoreEvent): void { for (const l of [...this.listeners]) { try { l(e); } catch { /* a broken screen must not stop the others */ } } }
}
