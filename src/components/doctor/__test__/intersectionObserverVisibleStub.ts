import { vi } from "vitest";

// Like intersectionObserverStub, but every observed element is reported as already
// intersecting (as if scrolled into view). For tests of behaviour that starts once a
// section is near the screen, e.g. the booking widget preselecting its first date.
class VisibleIntersectionObserverStub {
  private callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
vi.stubGlobal("IntersectionObserver", VisibleIntersectionObserverStub);
