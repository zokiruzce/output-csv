# output.csv requirements — open items

Status of the app against the *output.csv* requirements (Tashkent, 16 Oct 2026) and the
**production corrections** (Nov 2026), which override the requirements where they differ.
Items under "To do" are **not implemented yet** and are to be discussed before work starts.

## Production corrections (override the requirements)

| Field | Requirements said | Production uses |
|---|---|---|
| field_11 | not filled | `trade_price` — GOVT Trade, dirty price % of par |
| field_12 | `fixing_price` | `trade_yield` — GOVT Trade, yield to maturity |
| field_13, field_14 | `trade_yield`, `fixing_yield` | always empty |
| field_15 | `trade_rate` (MMKT only, max 4) | `rate` — MMKT Trade rate **and** FX Fixing rate, max 10 |
| field_16 | `fixing_rate` (max 4) | always empty |

Allowed combinations: **GOVT Bid, GOVT Offer, GOVT Trade, MMKT Trade, FX Fixing**.
GOVT Trade is now allowed; MMKT Bid / Offer / Fixing are not confirmed (never seen in production) and are not accepted.

## Already implemented

| Requirement | Where |
|---|---|
| 18 columns in field_01…field_18 order, no header, UTF-8 without BOM, LF line ending | `toCsvLine` in `src/schema.js` |
| Production field layout (table above), JSON key for field_15 is `rate` | `COLUMNS` in `src/schema.js` |
| Only the 5 allowed combinations; Type dropdown shows only the types of the chosen market | `COMBOS`, `typesFor` in `schema.js`; Type `<select>` in `App.jsx` |
| All value fields of a combination are required (GOVT: price **and** yield); fields of other combinations must be empty | `validate` |
| Maximum field lengths — longer values are an error, never cut | `max` in `COLUMNS`, checked in `validate` |
| GOVT `instrument_code` rule: drop `FS`, `20xxxx` → `2xxxx`, result must be 5 digits + `UM` | `normalizeIssueCode` + `validate` |
| Numbers: dot as decimal separator, no thousands separator, `volume` a whole number | `validate` |
| Records with zero volume or zero price/rate are refused | `validate` |
| Empty fields stay empty; numbers keep the precision they were entered with | `toCsvLine`, `toJsonText` |
| Timestamp ISO 8601 with `+05:00`, to the second | `nowTimestamp` |
| JSON export | `toJsonText`, **Save JSON** button |
| Save CSV / Save JSON refuse a record that breaks the rules (e.g. an imported one) | `download` in `src/App.jsx` |
| Unit tests against real production lines | `src/schema.test.js` (`npm test`) |

## To do

### 1. One `output.csv` (and `output.json`) with all records, in the required order (§1, §6)
- Today each record is saved to its own file.
- Proposal: write every record of a snapshot into one file, sorted by:
  1. `timestamp` ascending,
  2. then `instrument_id` ascending,
  3. then `Bid` before `Offer`.
- Duplicate rows (same timestamp + instrument + side) are an error.
- If any record is invalid, nothing is saved and the errors are listed (§7 "invalid file is not considered formed").

### 2. Final check across records (§7)
Run when writing the full file (item 1):
- For the same instrument in the same snapshot: `offer_price > bid_price` and `offer_yield < bid_yield`.
- Record errors in a log, show them, and do not send the file.

### 3. CSV escaping (§4)
Values containing a comma, double quote or line break must be quoted per the CSV standard. None of the current data needs it, but the writer should handle it.

### 4. Records saved in the browser before the production layout
Records saved with the old layout keep their rate under the old keys `tradeRate` / `fixingRate`, which the app no longer reads — they show without a rate and Save CSV refuses them. Fix by mapping the old keys when records are loaded (`loadStored` in `src/App.jsx`), or delete and re-import them.

### 5. Import JSON drops trailing zeros
`JSON.parse` reads `11.9150` as the number `11.915`, so a record imported from JSON loses trailing zeros. The JSON **file** keeps them, and PostgreSQL (`numeric`/`jsonb`) keeps them. Only matters if Import JSON is used to re-create CSV files.

## Questions for the data owner / team

1. **`instrument_code` rule 2** (`20xxxx` → `2xxxx`) is marked in the spec as still to be confirmed by the data owner.
2. **Code rule outside GOVT.** The spec says every code must be 5 digits + `UM`, but production uses `1D` (MMKT) and `6472` (FX). The app applies the rule to GOVT only. Confirm.
3. **MMKT Bid / Offer / Fixing.** In the requirements (MMKT Bid) or in old test data, but never seen in production. Confirm they will not occur.
4. **Final check item 9** (row count equals the number of active quotes in the source): define where the count comes from once the UZCE feed is connected.
5. **JSON format.** Current choice: keys = field names (field_15 = `rate`; reserved fields `field_13`, `field_14`, `field_16`), in field order, empty fields as `null`, numbers written exactly as entered. To be extended with UZCE `event_id` (see `DATA_REQUIREMENTS.md`). Confirm with whoever receives the JSON.
6. **Source data cut to 7 characters.** Old test data contains `UZA000001257,201003U,GOVT,…` — looks like `201003UMFS` truncated. Make sure the UZCE feed sends the full issue number.
