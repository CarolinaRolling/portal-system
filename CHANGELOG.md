# Changelog

All notable changes to the Carolina Order Portal are documented in this file.
Versioning follows [Semantic Versioning](https://semver.org/): MAJOR.MINOR.PATCH.

---

## [2.2.0] — 2026-05-04

### Added
- **Multi-pickup display for partial shipments.** Work orders with multiple
  pickup events (different people picking up parts on different dates) now
  render one line per pickup, e.g.:
  ```
  ✅ Picked Up: 4/28/2026 — by matthew
  ✅ Picked Up: 5/1/2026 — by sarah
  ```
  Single-pickup orders look identical to before — same one-liner display.
- Lines are read from the work order's `pickupHistory` array (the same source
  cradmin reads from). If `pickupHistory` is missing or empty, the renderer
  falls back to the top-level `pickedUpAt` / `pickedUpBy` fields so older
  work orders without history still display correctly.

### Internal
- Added `renderPickupLines(wo)` helper that returns the pickup-line JSX. Used
  in all three work-order card sections (Active, Recently Shipped, Order
  History) so the rendering logic lives in one place.
- Added `getEntryPickupDate(entry)` and `getEntryPickupName(entry)` helpers
  that extract date and name from a single `pickupHistory` entry, trying the
  most likely field-name candidates. The existing debug log was expanded to
  dump the full `pickupHistory` array so we can confirm canonical field names
  for the entry-level lockdown in v2.2.1.

### Files touched
- `frontend/src/pages/Dashboard.js` (only)
- `package.json`, `backend/package.json`, `frontend/package.json` (version bump)
- `CHANGELOG.md`

### Follow-ups (carried forward)
- Confirm canonical name + date field names inside `pickupHistory` entries
  from the v2.2.0 console logs, then in v2.2.1 lock `getEntryPickupName()` /
  `getEntryPickupDate()` to those exact fields and remove the debug logs.
- Consider adding per-pickup quantity info (e.g., "matthew — 10 parts")
  if pickupHistory entries include a quantity field. Skipped for now until
  we see whether the data is there.
- Stale duplicate files cleanup (still pending from v2.1.0).

---

## [2.1.1] — 2026-05-04

### Fixed
- **Picked-up-by name not displaying** even though cradmin showed a real name.
  Two root causes, both addressed:
  1. The Carolina API's top-level `pickedUpBy` field was returning the literal
     string `"unknown"` as a placeholder default. The previous code treated any
     non-null value as a name and rendered it (or, in the speculative-fallback
     version, treated `"unknown"` as falsy by accident on some paths). Now
     `"unknown"`, `"n/a"`, `"none"`, `"null"`, and empty strings are explicitly
     filtered as non-meaningful values via a new `isMeaningfulName()` helper.
  2. The actual pickup details (the data cradmin reads from) live in the
     work order's `pickupHistory` array, not on the top-level `pickedUpBy`
     field. `getPickedUpBy()` now reads `pickupHistory` first, falling back
     to the top-level field only if no meaningful name is found there.
- The exact name field *inside* a `pickupHistory` entry isn't yet confirmed,
  so the resolver tries the most likely candidates (`pickedUpBy`, `name`,
  `pickedBy`, `personName`, `recipientName`, `signedBy`, `signedByName`,
  `driverName`, `carrierName`, `signature.name`, `signature.signedBy`).

### Internal
- Added `isMeaningfulName()` helper. Used by `getPickedUpBy()` and easy to
  reuse for any other field that suffers from placeholder values.
- Expanded the one-time debug log in `fetchOrders()` so it now dumps:
  - All work-order keys (as before)
  - The top-level `pickedUpBy` value
  - `pickupHistory` entry count + latest-entry keys + full latest entry
  
  Once we confirm the canonical field name from this log, v2.1.2 will lock
  `getPickedUpBy()` to that one field and remove the debug logs.

### Files touched
- `frontend/src/pages/Dashboard.js` (only)
- `package.json`, `backend/package.json`, `frontend/package.json` (version bump)
- `CHANGELOG.md`

### Follow-ups (carried forward)
- Confirm the canonical name field inside `pickupHistory` entries from the
  next browser-console log dump, then lock `getPickedUpBy()` to that one field
  and remove the speculative fallbacks + debug logs.
- Stale duplicate files cleanup (still pending from v2.1.0).

---

## [2.1.0] — 2026-04-29

### Added
- **Shipping Documents section** on each work order card. Documents tagged with
  `documentType === 'shipping_doc'` from the Carolina portal-docs endpoint now
  appear in their own collapsible "🚚 Shipping Documents" section with the same
  View / Download buttons as MTRs and COCs.
- **Three-tier document layout** under each work order card, in this order:
  1. 📄 Material Test Reports
  2. 📜 Certificates of Conformance (COC)
  3. 🚚 Shipping Documents
  
  Each section is independently collapsible and only renders if it has documents.
- **"Picked up by" display** on the pickup date line. Now renders as
  `✅ Picked Up: 4/15/2026 — by John Smith` when the work order has a
  pickup-by field populated. Falls back gracefully to date-only if no name field
  is found.
- **One-time debug log** (`🔍 PICKED-UP WO ALL KEYS`) that fires in the browser
  console when a picked-up work order is loaded. Used to identify the exact
  Carolina API field name for "picked up by" so we can lock it in.
  *Remove this log once the field name is confirmed.*

### Changed
- The previous unified "📋 Documents" section is gone. Its contents (everything
  that *isn't* a shipping doc) now display under the "📜 Certificates of
  Conformance (COC)" header. No data is hidden — anything that was visible
  before is still visible, just in a more specific section.

### Internal
- Added `renderPortalDocSection()` helper inside `Dashboard` to avoid duplicating
  ~30 lines of doc-section JSX across the three work-order card variants.
- Added `getCocDocs()`, `getShippingDocs()`, and `isShippingDoc()` helpers.
- Added `getPickedUpBy()` resolver that checks common field names
  (`pickedUpBy`, `pickupName`, `pickedUpByName`, `pickupSignedBy`,
  `pickupCarrier`, `signedBy`).
- Added `expandedShippingDocs` state and `toggleShippingDocs()` handler so the
  shipping-docs section has an independent show/hide toggle from COCs.

### Files touched
- `frontend/src/pages/Dashboard.js` (only)
- `package.json`, `backend/package.json`, `frontend/package.json` (version bump)

### Backend
- No changes. The existing `/api/portal/workorders/:drNumber/documents`
  endpoint already returns all documents with their `documentType` field;
  splitting happens client-side.

### Follow-ups
- Confirm the actual "picked up by" field name from the browser console log
  output, then update `getPickedUpBy()` to use only the canonical name and
  remove the debug `console.log` lines (currently in `fetchOrders()` around
  the comment "DEBUG: Log all keys on a picked-up work order").
- Stale duplicate files still present in the project (not in build path, but
  worth removing in a future cleanup):
  - `frontend/App.js`, `frontend/Login.js`, `frontend/vendorApi.js`
  - `backend/vendorRoutes.js`, `backend/vendorRoutes-additions.js`
  - `frontend/src/pages/VendorPODetail.js` (the singular one — only `VendorPODetails.js` is imported)

---

## [2.0.0] — Baseline

Initial version supplied by user. Carolina-integrated client and vendor portal
with JWT auth, admin panel, MTR / portal-document viewing, 3D STEP and 2D DXF
file viewers, and vendor purchase-order management.
