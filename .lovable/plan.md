

## Plan: Update Contact Details & Parent Company Attribution

### Changes

**3 files to update:**

#### 1. `ContactSection.tsx` — Update contact info
- Phone: `+91 98765 43210` → `+91 86194 83010`
- Address: `Mumbai, Maharashtra, India` → `22, Second Floor, Jeevijay Technologies Pvt. Ltd., Aerodrome, Behind Modern Petrol Pump, Kota, Rajasthan`
- Keep email as `support@doctylia.com`

#### 2. `LandingFooter.tsx` — Update footer
- Replace `Made with ❤️ in India 🇮🇳` with `A product by <a href="https://jeevijay.com">Jeevijay Technologies Pvt. Ltd.</a> · Made in India 🇮🇳`
- Add address line below copyright
- Update copyright: `© 2025 Doctylia by Jeevijay Technologies Pvt. Ltd. All Rights Reserved.`

#### 3. `LandingNavbar.tsx` — Add phone in top bar (optional, only if space)
- No change needed unless you want a top contact strip

### Build Order
1. Update ContactSection with real phone + address
2. Update LandingFooter with Jeevijay attribution + address

