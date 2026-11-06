# output.csv requirements — open items

Status of the app against the *output.csv* requirements (Tashkent, 16 Oct 2026).
Items listed here are **not implemented yet** and are to be discussed before work starts.

## Already implemented

| Requirement | Where |
|---|---|
| 18 columns in field_01…field_18 order, no header, UTF-8 without BOM, LF line ending | `toCsvLine` in `src/schema.js` |
| Maximum field lengths (§2) — longer values are an error, never cut | `max` in `COLUMNS`, checked in `validate` |
| GOVT `instrument_code` rule (§2): drop `FS`, `20xxxx` → `2xxxx`, result must be 5 digits + `UM` | `normalizeIssueCode` + `validate` |
| Numbers: dot as decimal separator, no thousands separator, `volume` a whole number (§4) | `validate` |
| Records with zero volume or zero price/rate are refused (§6) | `validate` |
| Empty fields stay empty; numbers keep the precision they were entered with (§4) | `toCsvLine`, `toJsonText` |
| Timestamp ISO 8601 with `+05:00`, to the second (§5) | `nowTimestamp` |
| JSON export using the official field names | `toJsonText`, **Save JSON** button |
| Save CSV / Save JSON refuse a record that breaks the rules (e.g. an imported one) | `download` in `src/App.jsx` |

## To do

### 1. Allow only the 5 permitted market/type combinations (§3)
Permitted: **GOVT Bid, GOVT Offer, MMKT Bid, MMKT Trade, FX Fixing**. Anything else (GOVT Trade, FX Trade, MMKT Offer, …) must not be written.

- Today the Type dropdown offers all 4 types for every market.
- Proposal: the Type dropdown shows only the types allowed for the chosen market (FX → only Fixing), and `validate` rejects other combinations (for imported records).
- Affects: `TYPES` / `valueKeysFor` in `schema.js`, Type `<select>` in `App.jsx`.

### 2. One `output.csv` (and `output.json`) with all records, in the required order (§1, §6)
- Today each record is saved to its own file.
- Proposal: a toolbar button **Save output.csv / output.json** that writes every record into one file, sorted by:
  1. `timestamp` ascending,
  2. then `instrument_id` ascending,
  3. then `Bid` before `Offer`.
- Duplicate rows (same timestamp + instrument + side) are an error.
- If any record is invalid, nothing is saved and the errors are listed (§7 "invalid file is not considered formed").

### 3. All matrix fields mandatory (§3)
- GOVT Bid needs **both** `bid_price` and `bid_yield`; GOVT Offer needs both `offer_price` and `offer_yield`.
- Today one of the two is enough.
- Note: the old source sample has GOVT rows without a yield (e.g. `UZA000001950`), so making this strict will reject such rows.

### 4. Final check across records (§7)
Run when saving the full file (item 2):
- For the same instrument in the same snapshot: `offer_price > bid_price` and `offer_yield < bid_yield`.
- Record errors in a log, show them to the user, and do not save the file.

### 5. CSV escaping (§4)
Values containing a comma, double quote or line break must be quoted per the CSV standard. None of the current data needs it, but the writer should handle it.

## Questions for the data owner / team

1. **`fixing_rate` length.** The table in §2 says 4 characters, but the spec's own FX example has `12874.02` (8 characters). The app currently allows **8** for `fixing_rate` so FX fixings can be entered at all. Which is correct?
2. **`instrument_code` rule 2** (`20xxxx` → `2xxxx`) is marked in the spec as still to be confirmed by the data owner.
3. **Code rule outside GOVT.** The spec says every code must be 5 digits + `UM`, but its own examples use `1D` (MMKT) and `3688` (FX). The app applies the rule to GOVT only. Confirm.
4. **Snapshots vs manual entry (§6).** Rows with the same timestamp form one snapshot of the quote book. The app stamps each record with the moment it is added, so each record becomes its own snapshot. Should the user add a whole snapshot at once with one shared timestamp?
5. **Final check item 9** (row count equals the number of active quotes in the source) cannot be done in a manual-entry app, since there is no source to compare against. Drop it for this app, or define where the count comes from?
6. **Fields not yet defined:** `field_09` (`offer_rate`) and `field_11`–`field_14` are "not filled for now". The old source sample used them (MMKT Offer in field_09, GOVT Trade/Fixing in 11–14). Confirm they stay empty.
7. **JSON format.** The requirements cover only CSV. Current JSON choice: an array of objects keyed by the official field names, in field order, empty fields as `null`, numbers written exactly as entered. Confirm with whoever receives the JSON.
8. **Source data already cut to 7 characters.** The old sample contains `UZA000001257,201003U,GOVT,…` — the code looks like `201003UMFS` truncated to 7 characters before reaching us. The app now rejects it; the source should send the full code so the rule can convert it to `21003UM`.
