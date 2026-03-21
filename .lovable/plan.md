

## Plan: Replace Feature Card Images with Brand-Colored SVG Vector Illustrations

### What Changes

Replace the 8 Unsplash stock photos in `FeaturesGrid.tsx` with inline SVG vector illustrations that:
- Use Doctylia brand colors (Navy #0D1B6E, Royal #1565C0, Teal #00ACC1, Spark #C6E234, Cloud Blue #F0F7FF)
- Show doctor/medical scenes relevant to each feature
- Have a consistent flat vector style with gradient backgrounds

### Approach

Replace the `img` property in each feature with an inline SVG React component rendered directly in the card. Each SVG will be a simple flat-style illustration (~120px tall) with:

1. **Your Own Website** — Doctor silhouette next to a browser/monitor with a website, blue gradient bg
2. **Smart Appointments** — Calendar with checkmarks + clock icon + doctor, teal gradient bg
3. **Billing & Invoices** — Receipt/invoice document with rupee symbol + doctor, royal blue bg
4. **Patient Records** — Clipboard with medical cross + patient silhouettes, purple gradient bg
5. **AI Blog Writer** — Brain/neural network connected to a document + pen, spark/yellow-green bg
6. **Online Consultation** — Doctor on laptop screen with video call UI, teal bg
7. **WhatsApp Integration** — Phone with chat bubbles + notification bell, green gradient bg
8. **Analytics Dashboard** — Bar chart + pie chart with upward trend arrow, royal blue bg

Each illustration uses the same visual language: rounded shapes, flat style, brand palette, subtle gradients, doctor/medical silhouettes.

### File Changes

| File | Change |
|------|--------|
| `src/components/landing/FeaturesGrid.tsx` | Replace `img` URLs with inline SVG illustrations rendered as React components. Each card's header area becomes an SVG with brand-colored gradient background + vector scene. Remove `img` tag, render SVG div instead. |

Single file edit — self-contained change.

