

## Plan: Fix Dashboard Routing + UI Polish

### Root Cause: Dashboard is Blank

The dashboard shows blank because of a **routing conflict** in `App.tsx`:

- Line 30: `<Route path="/admin/dashboard" ...>` — matches `/admin/dashboard` but has **no trailing `/*`**, so the nested `<Routes>` inside `AdminDashboard` can't match the child route `dashboard`.
- Line 31: `<Route path="/admin/*" ...>` — this is correct but line 30 takes priority for `/admin/dashboard`.

The console error confirms: *"the parent route path has no trailing `*`"*.

### Fix

**`src/App.tsx`** — Remove the duplicate `/admin/dashboard` route (line 30). The `/admin/*` route on line 31 already handles all admin paths including `/admin/dashboard`.

```
// Remove line 30 entirely. Keep only:
<Route path="/admin/*" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
```

That's the only change needed — the DashboardHome component already has a rich, full-featured UI with stat cards, schedule timeline, growth tips, notes widget, checklist, revenue chart, quick actions, and recent patients. It's just not rendering because of the routing bug.

### File Changes

| File | Change |
|------|--------|
| `src/App.tsx` | Remove line 30 (`/admin/dashboard` route), keep only `/admin/*` |

Single line fix — the dashboard UI is already built and feature-rich.

