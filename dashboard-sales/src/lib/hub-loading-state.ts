export type LoadingSnapshot = { visible: boolean; complete: boolean; revealed: boolean; message: string };
type Task = { source: object; message: string; active: boolean };
type Timer = ReturnType<typeof setTimeout>;
type Clock = { set: (fn: () => void, delay: number) => Timer; clear: (timer: Timer | undefined) => void };
const clock: Clock = { set: (fn, delay) => setTimeout(fn, delay), clear: timer => clearTimeout(timer) };

/** One loader owns overlapping frame/data work; fast operations never flash it. */
export class HubLoadingState {
  private tasks = new Map<string, Task>();
  private boot = true;
  private failed = false;
  private showTimer: Timer | undefined;
  private settleTimer: Timer | undefined;
  private state: LoadingSnapshot = { visible: true, complete: false, revealed: false, message: '' };
  constructor(private changed: (state: LoadingSnapshot) => void, private time = clock) {}
  private emit() { this.changed({ ...this.state }); }
  private pending() { return this.boot || [...this.tasks.values()].some(task => task.active); }
  private reconcile() {
    this.time.clear(this.settleTimer); this.settleTimer = undefined;
    this.state.message = [...this.tasks.values()].filter(task => task.active).at(-1)?.message ?? '';
    if (this.pending()) {
      this.state.complete = false;
      if (!this.state.visible && this.showTimer === undefined) this.showTimer = this.time.set(() => { this.showTimer = undefined; this.state.visible = true; this.emit(); }, 180);
      this.emit();
    } else {
      this.time.clear(this.showTimer); this.showTimer = undefined;
      if (this.state.visible) {
        if (this.failed) { this.state.visible = false; this.state.complete = false; this.state.revealed = true; this.emit(); }
        else this.settleTimer = this.time.set(() => { this.settleTimer = undefined; this.state.complete = true; this.emit(); }, 100);
      } else this.emit();
    }
  }
  setBoot(pending: boolean) { this.boot = pending; this.reconcile(); }
  start(id: string, source: object, message: string, active = true) {
    if (!this.pending() && !this.state.visible) this.failed = false;
    this.tasks.set(id, { source, message, active }); this.reconcile();
  }
  update(id: string, source: object, message: string) {
    const task = this.tasks.get(id); if (!task || task.source !== source) return;
    task.message = message; this.state.message = [...this.tasks.values()].filter(task => task.active).at(-1)?.message ?? ''; this.emit();
  }
  end(id: string, source: object, success?: boolean) {
    if (this.tasks.get(id)?.source !== source) return;
    const task = this.tasks.get(id)!; this.tasks.delete(id);
    if (success === false && task.active) this.failed = true;
    this.reconcile();
  }
  activate(active: (source: object) => boolean) {
    this.failed = false;
    for (const task of this.tasks.values()) task.active = active(task.source);
    if (!this.pending()) {
      this.time.clear(this.showTimer); this.showTimer = undefined;
      this.time.clear(this.settleTimer); this.settleTimer = undefined;
      this.state = { visible: false, complete: false, revealed: true, message: '' }; this.emit();
    } else this.reconcile();
  }
  finished() {
    if (this.pending() || !this.state.complete) return;
    this.state = { visible: false, complete: false, revealed: true, message: '' };
    this.emit();
  }
  dispose() { this.time.clear(this.showTimer); this.time.clear(this.settleTimer); this.tasks.clear(); }
}
