import { vi } from "vitest";

// jsdom has no IntersectionObserver; `motion`'s whileInView and the doctor site's
// section observers need one. Imported only by doctor-site tests (other components
// branch on whether IntersectionObserver exists, so this is not in the shared setup).
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);
