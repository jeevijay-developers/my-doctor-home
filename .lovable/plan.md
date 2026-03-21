

## Comprehensive Bug Fix & Missing Flow Analysis

### Bugs Found

**1. Auth signup with auto-confirm sends misleading message**
- Auth has `auto_confirm` enabled, but signup still shows "Please check your email to verify, then log in" — should auto-login or say "Account created!" and redirect to onboarding.

**2. BlogPage Dialog ref warning**
- Console error: `Function components cannot be given refs` in BlogPage's `<Dialog>`. The `<Dialog>` component is used without wrapping it as a child of `DialogTrigger`, but the `open`/`onOpenChange` props are managed externally — the real issue is likely the outer `<Dialog>` wrapping the page content instead of being a sibling.

**3. Onboarding slug collision**
- `generateSlug` doesn't check for uniqueness — two "Dr. Rahul Sharma" doctors get the same slug, causing profile lookup conflicts.

**4. Booking widget: patient upsert fails for anonymous users**
- Public booking inserts into `patients` table, but RLS only allows `doctor_id = auth.uid()`. Anonymous/unauthenticated patients can't insert — the `patients` table has no public INSERT policy. Appointments have a public INSERT policy but patients do not.

**5. Auto-save interval closure bug (MyWebsite.tsx)**
- The `useEffect` at line 56-59 references `saveAll` but the dependency array doesn't include `saveAll`. The interval captures a stale closure. Also `saveAll` is not in deps.

**6. `useProfile` doesn't refresh after profile update**
- After saving settings or completing onboarding, `useProfile` hook doesn't re-fetch. Components using it see stale data until page reload.

**7. Booking widget: `payment_status` set to `"pay_at_clinic"` always**
- Even when `settings.require_payment` is true, the booking widget hardcodes `payment_status: "pay_at_clinic"`. No actual payment flow exists.

**8. Missing `gradient-hero` CSS class**
- Used in BookingWidget (line 140, 256) and ServicesSection — this CSS class is referenced but may not be defined in `index.css`.

### Missing Flows

**9. No password reset flow**
- No "Forgot Password" link on the auth page. No `/reset-password` route.

**10. No public review submission**
- Reviews section shows reviews but there's no form for patients to submit reviews on the public page.

**11. Gallery photos not showing on public page**
- `GallerySection` reads from context but needs to check if the component properly renders uploaded photos.

**12. Blog "Open Blog Manager" link uses `<a>` instead of `<Link>`**
- In MyWebsite.tsx line 470: `<a href="/admin/blog">` causes full page reload instead of client-side navigation.

---

### Plan — Fix All Issues

**Migration: Add public INSERT policy for patients table**
```sql
CREATE POLICY "Public can create patients for valid doctors"
ON public.patients FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM profiles WHERE profiles.id = patients.doctor_id AND profiles.onboarding_completed = true
));
```

**File changes:**

| File | Fix |
|------|-----|
| `src/pages/Auth.tsx` | Auto-login after signup (auto_confirm is on), redirect to `/onboarding`. Add "Forgot Password" link. |
| `src/pages/Auth.tsx` | Create a simple forgot-password flow inline |
| `src/pages/Onboarding.tsx` | Check slug uniqueness, append random suffix if collision |
| `src/components/admin/BlogPage.tsx` | Fix Dialog structure to avoid ref warning |
| `src/components/admin/MyWebsite.tsx` | Fix auto-save closure, change `<a>` to `<Link>` for blog manager |
| `src/hooks/useProfile.ts` | Add `refetch` method to re-fetch profile on demand |
| `src/components/doctor/ReviewsSection.tsx` | Add "Write a Review" form for patients |
| `src/index.css` | Add `gradient-hero` utility class if missing |
| `src/App.tsx` | Add `/reset-password` route |
| New: `src/pages/ResetPassword.tsx` | Password reset page |

### Build Order
1. DB migration (patients public INSERT policy)
2. Fix Auth page (auto-login on signup, forgot password link)
3. Create ResetPassword page + route
4. Fix onboarding slug uniqueness
5. Fix BlogPage Dialog ref warning
6. Fix MyWebsite auto-save closure + blog link
7. Add `gradient-hero` CSS class
8. Add review submission form on public page
9. Fix useProfile to support refetch

