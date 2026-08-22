# Remove Service Price Display Design

## Goal

Remove service pricing from the My Website Services editor and public Services cards while preserving stored prices and all booking/payment calculations.

## Confirmed behavior

- The admin Services editor no longer shows or edits `Price ₹`.
- Public service cards and the service-details dialog no longer display a price.
- Existing `services.price` database values are preserved.
- New service rows retain the existing data-model default internally, but the editor does not expose pricing.
- Booking and payment flows continue using service prices.
- Appointment Amount remains unchanged.

## Implementation

In `MyWebsite.tsx`, remove the Price input, price validation, and price from service update/insert payloads. Keep the `price` property in the local/service database type so loaded records and booking consumers remain compatible; new service rows may retain the existing default value without exposing it.

In `ServicesSection.tsx`, remove price formatting and price blocks from service cards and the details dialog. Replace the public section copy about transparent pricing with copy describing care and consultation times, so no pricing claim remains in the Services display.

The `price` field remains available to `BookingWidget` and payment slips; those are separate workflows and are not modified.

## Testing

Add focused tests or static assertions covering:

- no Price input/label in the admin Services editor
- no price text or formatter in public service cards/details
- service type, duration, name, and description remain visible
- booking code still reads `selectedService.price`
- database column is not dropped and existing stored prices are not rewritten

## Validation

- focused Services/My Website tests
- `npx tsc --noEmit -p .`
- `npm run build`