

## Plan: Fix Form & Input Field Alignment Across All Admin Pages

### Issues Found

The forms across admin pages have inconsistent spacing between labels and inputs — labels sit directly on top of inputs with no gap, fields have inconsistent heights, and dialog forms lack uniform structure. Specific problems:

1. **Missing label-to-input gap**: All pages use `<Label>` immediately followed by `<Input>` with no spacing (`space-y-1.5` or `mb-1.5` missing)
2. **Inconsistent field heights**: Some inputs are `h-10`, others have no height set (Blog editor, some Settings fields)
3. **Cramped grid fields**: `grid-cols-2 gap-4` fields have labels squeezed against inputs
4. **Blog editor dialog**: Inputs have no height normalization, label spacing is tight
5. **Prescription form**: Native `<select>` element doesn't match shadcn styling
6. **Settings page**: The 5-field grid has an orphan field (Phone) that doesn't align

### Fix Strategy

Apply a consistent form field pattern across all admin pages:

```text
<div className="space-y-1.5">
  <Label>Field Name</Label>
  <Input className="h-10" />
</div>
```

Every label-input pair gets wrapped in `space-y-1.5`. Every input/select/textarea gets consistent height (`h-10` for single-line, explicit `rows` for textarea). Grid layouts use `gap-4` with proper field wrappers.

### File Changes

| File | Fix |
|------|-----|
| `AppointmentsPage.tsx` | Wrap each label+input in `space-y-1.5` divs inside the dialog form |
| `PrescriptionsPage.tsx` | Same wrapping, replace native `<select>` with shadcn `Select` component |
| `PatientsPage.tsx` | Wrap dialog form fields in `space-y-1.5` |
| `BillingPage.tsx` | No forms — no changes needed |
| `BlogPage.tsx` | Add `h-10` to all inputs, wrap label+input in `space-y-1.5`, add `h-10` to SelectTrigger |
| `SettingsPage.tsx` | Wrap all label+input pairs in `space-y-1.5`, make Phone field span full width or pair it, ensure consistent grid |
| `ReviewsManagePage.tsx` | No forms — no changes needed |
| `DashboardHome.tsx` | No form fields to fix |

### Build Order
1. Fix AppointmentsPage dialog form alignment
2. Fix PrescriptionsPage dialog form + replace native select
3. Fix PatientsPage dialog form
4. Fix BlogPage editor dialog
5. Fix SettingsPage form grids

