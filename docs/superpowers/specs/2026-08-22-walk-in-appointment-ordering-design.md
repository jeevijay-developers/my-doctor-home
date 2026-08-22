# Walk-in Appointment Ordering Design

## Goal

Allow doctors and staff to create appointments without selecting an exact time, while keeping timed and walk-in appointments in one predictable chronological list.

## Confirmed behavior

- The option is labeled `Walk-in`.
- It is available whenever the Add Appointment modal opens.
- Selecting it stores `time_slot = NULL`, never a placeholder time.
- A walk-in row displays `Walk-in` instead of a blank or `00:00` value.
- Timed appointments sort by their selected `time_slot`.
- Walk-ins sort by their creation time of day in India Standard Time (IST).
- The existing default-to-today filter remains active on fresh page loads.
- Serial numbers continue across pages.

For example, appointments created at approximately 09:00 walk-in, 11:00 timed, and 13:00 walk-in appear as:

`Walk-in 09:00 -> Timed 11:00 -> Walk-in 13:00`

Two walk-ins are ordered by their creation timestamps.

## Data model and server-side ordering

The appointments table currently requires `time_slot`, so the migration will make it nullable and add a persisted `sort_time` column. A database trigger maintains `sort_time`:

- timed row: `sort_time = time_slot`
- walk-in row: `sort_time = created_at` converted to IST

Existing timed rows are backfilled from `time_slot`. The admin query uses server-side ordering by `date ASC`, `sort_time ASC`, and `created_at ASC` as a stable tie-breaker before applying pagination.

The trigger also updates the sort key when a walk-in is rescheduled to a timed slot.

## Validation and compatibility

- Slot-capacity checks skip walk-ins because they have no slot to reserve.
- Overdue appointment checks skip walk-ins because they have no scheduled time.
- Existing timed appointment validation is unchanged.
- Public booking continues to write the existing `date` and `time_slot` fields and therefore creates timed appointments normally.
- Database functions that concatenate or compare `time_slot` are updated to handle null safely.

## UI and tests

The Add Appointment time dropdown includes `Walk-in`; the submit handler maps that sentinel choice to null. The list displays the fallback label and keeps the existing serial index based on page and row position.

Tests cover the dropdown and insert payload, null display behavior, the database-side ordering contract, mixed timed/walk-in ordering, multiple walk-ins, and serial numbering across pagination. Existing date, status, search, and pagination behavior must remain green.

## Validation commands

- `npx tsc --noEmit -p .`
- focused Vitest tests for appointments and ordering
- `npm run build`