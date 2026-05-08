# Changelog

All notable changes to the Carolina Order Portal are documented in this file.
Versioning follows [Semantic Versioning](https://semver.org/): MAJOR.MINOR.PATCH.

---

## [2.3.1] — 2026-05-08

### Fixed
- **Material Test Reports were appearing in the Certificates of Conformance
  section.** Root cause: the previous COC filter used exclusion logic
  ("everything that isn't a shipping doc lands in COC"), which was a
  defensive choice from v2.1.0 made before the canonical COC documentType
  string was confirmed. Once MTRs were added to the portal-visible wishlist
  on the Carolina API side, they started flowing through the
  `/portal/:drNumber/documents` endpoint, and the exclusion-based filter
  caught them as "not shipping → must be COC".

  Fix: the COC filter is now a strict allowlist matching `documentType ===
  'coc'`. MTRs that come through the portal-docs feed are silently filtered
  out of both COC and Shipping sections — they continue to render correctly
  in the dedicated MTR section above (which is sourced from the separate
  `/api/workorders/:id` endpoint and was never affected by this bug).

### Changed
- `isShippingDoc` simplified to a strict equality check on `'shipping_doc'`.
  Previous belt-and-suspenders aliases (`'shipping'`, `'bol'`) were dropped
  now that the canonical Carolina documentType strings are confirmed:
  `coc`, `mtr`, `shipping_doc`. Any unknown documentType coming through the
  portal-docs feed is intentionally hidden — anything new that should be
  visible to clients can get its own labeled section in a future release.

### Internal
- New helper `docTypeOf(doc)` centralizes the `documentType || type` lookup
  and lowercase normalization. Used by `isShippingDoc` and `isCocDoc`.
- New helper `isCocDoc(doc)` mirrors `isShippingDoc(doc)` for symmetry.

### Files touched
- `frontend/src/pages/Dashboard.js` (only)
- `package.json`, `backend/package.json`, `frontend/package.json` (version bump)
- `CHANGELOG.md`

### Notes
- This client-side fix is independent of the Carolina API wishlist work
  in progress. Once the wishlist is fully restricting which documentTypes
  flow through `/portal/:drNumber/documents`, the leak this fix addresses
  will also be closed at the source — but the strict-allowlist filtering
  here remains valuable as defense-in-depth.

### Follow-ups (carried forward)
- `pickupHistory[i].items` quantity display (from v2.3.0).
- `opTransports` integration if Carolina populates it (from v2.3.0).
- Stale duplicate files cleanup (still pending from v2.1.0).

---

## [2.3.0] — 2026-05-06

### Added
- **Pickup type indicator (Full / Partial)** displayed inline on every pickup
  line. New format:
  ```
  ✅ Picked Up (Full): 5/6/2026 — by Joao Dauz Trucking
  ✅ Picked Up (Partial): 4/28/2026 — by matthew
  ```
  Pulled from the `type` field on each `pickupHistory` entry. If the type
  field is missing or empty, the line falls back to the previous format
  (no parentheses) so older orders still render cleanly.

### Changed
- **Canonical schema lockdown** for `pickupHistory` entries. Now confirmed:
  ```
  { date, type ('full'|'partial'), items, pickedUpBy }
  ```
  All speculative fallback field-name lists removed from the entry helpers.
  `getEntryPickupDate()` reads `entry.date`, `getEntryPickupName()` reads
  `entry.pickedUpBy`. Code is meaningfully shorter and easier to follow.
- `getPickedUpBy(wo)` simplified — only used now for the legacy fallback
  path (work orders with `pickedUpAt` set but no `pickupHistory`). Reads
  `wo.pickedUpBy` filtered through `isMeaningfulName()`.

### Removed
- All `🔍 PICKED-UP WO …` and `🔍 pickupHistory …` debug `console.log`
  statements in `fetchOrders()`. Schema is locked down — debug output is
  no longer needed and was cluttering the browser console.

### Internal
- New helper `getEntryPickupType(entry)` — capitalizes the API value
  (`'full'` → `'Full'`, `'partial'` → `'Partial'`) for display, returns
  `null` for missing/empty values.

### Files touched
- `frontend/src/pages/Dashboard.js` (only)
- `package.json`, `backend/package.json`, `frontend/package.json` (version bump)
- `CHANGELOG.md`

### Follow-ups
- Each `pickupHistory` entry has an `items` array (length 1 in the sample
  we inspected). Could be used to display per-pickup quantity, e.g.
  `(Partial — 10 of 20 parts)`. Not implemented yet because we haven't
  inspected the `items` element shape — left for a future release if
  desired.
- The work order also has an `opTransports` array (was empty in samples
  we've seen). Likely tracks Carolina-delivered shipments as opposed to
  customer pickups. If you want delivered shipments folded into the same
  timeline, we can add that in a future release.
- Stale duplicate files cleanup (still pending from v2.1.0):
  `frontend/App.js`, `frontend/Login.js`, `frontend/vendorApi.js`,
  `backend/vendorRoutes.js`, `backend/vendorRoutes-additions.js`,
  `frontend/src/pages/VendorPODetail.js`.

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
