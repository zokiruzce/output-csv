# Market data feed — data requirements

**From:** Market Builder project
**To:** UZCE (data source, Oracle database `uzce`)
**Status:** draft for discussion

## 1. Purpose

We produce two files from UZCE market data:

| File | Format | Goes to |
|---|---|---|
| `output.csv` | 18 fields, no header — as defined in *"Инструкция: обязательные требования к формированию файла output.csv"* (16 Oct 2026) | Bloomberg (SFTP) |
| `output.json` | Same records + UZCE event IDs and file metadata (section 5) | Bloomberg (SFTP) and our PostgreSQL database |

This document lists **what data we need from UZCE** to build both files, and the format we will produce.
It does not prescribe how UZCE stores the data — please map each item to your Oracle tables/columns (column "UZCE source" below).

## 2. Delivery of events

- **Channel:** a push connection, e.g. WebSocket. Another push channel (SSE, message queue) is also fine.
- **Message format:** JSON, UTF-8, one event per message.
- **Order:** events delivered in the order they happened in the source.
- **Recovery:** after a disconnect we must be able to resume from the last `event_id` we received, without losing or duplicating events.
- **Heartbeat:** a periodic message (e.g. every 30 s) so we can detect a dead connection.
- **Access:** authentication method (token / key / certificate) and a test environment, if available.

## 3. Event fields we need

### 3.1 Event envelope (every message)

| Field | Required | Description | Example | UZCE source |
|---|---|---|---|---|
| `event_id` | yes | Unique ID of the event, never reused. Carried into the JSON output and used to avoid duplicates. | `"8812734"` | |
| `sequence` | yes | Increasing number without gaps, so we can detect missed events (can be the same as `event_id` if that is sequential). | `120455` | |
| `event_time` | yes | When the event happened in the trading system — ISO 8601, to the second, with `+05:00`. Becomes `timestamp` (field_18). | `"2024-12-10T10:12:06+05:00"` | |
| `event_type` | yes | `QUOTE`, `TRADE`, `FIXING` (or your own codes + a list of their meaning). | `"QUOTE"` | |
| `action` | for quotes | `NEW`, `UPDATE`, `CANCEL` — so we know which quotes are still active. | `"NEW"` | |
| `quote_id` | for quotes | ID of the quote that stays the same across its updates and cancellation. | `"Q-55120"` | |

### 3.2 Market data (per event)

| # | Output field | What we need from UZCE | Required for | Example | UZCE source |
|---|---|---|---|---|---|
| 01 | `instrument_id` | GOVT: ISIN. MMKT: tenor code. FX: currency pair / settlement code. | all | `UZA000002255`, `1D`, `USD/UZS_TOM` | |
| 02 | `instrument_code` | GOVT: **full** issue number exactly as in the source, e.g. `201006UMFS` — we convert it to 7 characters ourselves. Please do **not** shorten it (we have seen `201003U`, which cannot be converted). MMKT/FX: the instrument code. | all | `24094UMFS`, `1D`, `3688` | |
| 03 | `market_type` | Market: GOVT, MMKT or FX (or your market/board code + a mapping table). | all | `GOVT` | |
| 04 | `record_type` | Side or kind: Bid, Offer, Trade, Fixing. | all | `Bid` | |
| 05–08 | `offer_price`, `bid_price`, `offer_yield`, `bid_yield` | GOVT quote price (% of nominal) and yield (% per year). | GOVT Bid / Offer | `94.9065`, `15.3039` | |
| 10 | `bid_rate` | MMKT bid rate (% per year). | MMKT Bid | `13.5` | |
| 15 | `trade_rate` | MMKT trade rate (% per year). | MMKT Trade | `13.5` | |
| 16 | `fixing_rate` | FX fixing rate (UZS per 1 unit of currency). | FX Fixing | `12874.02` | |
| 17 | `volume` | Volume of the quote / trade, as a whole number. Please state the unit per market (number of bonds? amount in UZS? in USD?). | all | `1000`, `50000000000` | |
| 18 | `timestamp` | Taken from `event_time` (3.1). | all | `2024-12-10T10:12:06+05:00` | |

Fields `field_09` (`offer_rate`) and `field_11`–`field_14` are not filled for now (per the instruction), so we do not need data for them yet.

### 3.3 Format of values

- **Numbers keep their original precision.** Please send prices, yields, rates and volumes **as strings** (`"94.9065"`) or as exact decimals — not as floating point values that may arrive as `94.90649999`.
- Decimal separator `.`; no thousands separator.
- Text values as stored, with original case (`Bid`, not `BID`), no leading/trailing spaces.
- Times in Tashkent time with the `+05:00` offset, to the second.
- A quote with zero volume and zero price is treated as "no quote" and is not written.

### 3.4 Snapshots

The output file is built per **snapshot** — all active quotes of the order book at one moment (instruction §6). We need **one** of the following:

- **A. Full snapshots (preferred):** UZCE sends the whole book at a moment, with a `snapshot_id`, the snapshot time and an end-of-snapshot marker (or the number of records in it).
- **B. Changes only:** UZCE sends every new / updated / cancelled quote (`action` + `quote_id`, section 3.1), and we rebuild the book ourselves. In this case we also need an initial full snapshot when we connect.

Please tell us which one UZCE can provide, and how often a snapshot is taken (every change, every N seconds, on request).

### 3.5 Data we do **not** need

Participant / trader names, account numbers, order IDs of counterparties, or any personal data. Please leave them out of the feed.

## 4. `output.csv` (to Bloomberg)

Exactly as defined in the instruction of 16 Oct 2026: 18 fields `field_01`…`field_18`, no header, UTF-8 without BOM, LF line endings, sorted by timestamp → `instrument_id` → Bid before Offer.

Example:

```csv
UZA000002255,24094UM,GOVT,Bid,,94.9065,,15.3039,,,,,,,,,1000,2024-12-10T10:12:06+05:00
UZA000002255,24094UM,GOVT,Offer,95.1526,,14.5268,,,,,,,,,,1000,2024-12-10T10:12:06+05:00
1D,1D,MMKT,Bid,,,,,,13.5,,,,,,,50000000000,2024-12-10T16:27:31+05:00
1D,1D,MMKT,Trade,,,,,,,,,,,13.5,,185000000000,2024-12-10T16:17:33+05:00
USD/UZS_TOM,6544,FX,Fixing,,,,,,,,,,,11994.1,,291000000,2026-11-09T17:34:13+05:00
```

## 5. `output.json` (to Bloomberg and PostgreSQL)

The same records as `output.csv`, in the same order, plus the UZCE `event_id` of each record and information about the file.

```json
{
  "file_id": "20241210-101206",
  "generated_at": "2024-12-10T10:12:07+05:00",
  "snapshot_id": "S-2024-12-10-101206",
  "snapshot_timestamp": "2024-12-10T10:12:06+05:00",
  "record_count": 2,
  "records": [
    {
      "event_id": "8812734",
      "instrument_id": "UZA000002255",
      "instrument_code": "24094UM",
      "market_type": "GOVT",
      "record_type": "Bid",
      "offer_price": null,
      "bid_price": 94.9065,
      "offer_yield": null,
      "bid_yield": 15.3039,
      "offer_rate": null,
      "bid_rate": null,
      "trade_price": null,
      "fixing_price": null,
      "trade_yield": null,
      "fixing_yield": null,
      "trade_rate": null,
      "fixing_rate": null,
      "volume": 1000,
      "timestamp": "2024-12-10T10:12:06+05:00"
    },
    {
      "event_id": "8812735",
      "instrument_id": "UZA000002255",
      "instrument_code": "24094UM",
      "market_type": "GOVT",
      "record_type": "Offer",
      "offer_price": 95.1526,
      "bid_price": null,
      "offer_yield": 14.5268,
      "bid_yield": null,
      "offer_rate": null,
      "bid_rate": null,
      "trade_price": null,
      "fixing_price": null,
      "trade_yield": null,
      "fixing_yield": null,
      "trade_rate": null,
      "fixing_rate": null,
      "volume": 1000,
      "timestamp": "2024-12-10T10:12:06+05:00"
    }
  ]
}
```

Rules:

- **Keys:** the official field names from the instruction, in `field_01`…`field_18` order, with `event_id` first.
- **`event_id`:** the UZCE event that produced the record (for a quote that was updated: the latest update). It is unique per record and is the key we use in PostgreSQL to avoid inserting the same record twice.
- **Empty fields** are `null`; numbers are written with their original precision (`12.300` stays `12.300`).
- **`record_count`** must equal the number of `records` and the number of lines in the matching `output.csv`.
- A CSV and its JSON are always produced together from the same snapshot; if either fails the final check (instruction §7), neither is sent.

## 6. Delivery to Bloomberg (SFTP)

Both files are uploaded over SFTP. We need from the Bloomberg side:

| Item | Value |
|---|---|
| Host and port | |
| User name | |
| Authentication | private key (+ passphrase) or password |
| Server host key fingerprint (to verify the server) | |
| Target directory | |
| File naming | fixed `output.csv` / `output.json`, or with date/time (see question 3) |
| How often files are expected | |

Files are uploaded under a temporary name and renamed when complete, so Bloomberg never picks up a half-written file.

## 7. Open questions

1. **Snapshots:** can UZCE send full snapshots (3.4 A), or only changes (3.4 B)? How often?
2. **Volume units** per market (GOVT / MMKT / FX).
3. **File naming on SFTP:** the instruction requires the name `output.csv`. If several snapshots are sent per day, should each upload replace the previous file, or should names include the time (e.g. `output_20241210_101206.csv`)?
4. **`fixing_rate` length:** the instruction's table says 4 characters, but its FX example `12874.02` has 8. Which is correct?
5. **Issue-number rule 2** (`201006UMFS` → `21006UM`) is still marked "to be confirmed" in the instruction.
6. **Event ID for trades and fixings:** is there one event per trade / fixing (so its `event_id` can go into the JSON directly)?
7. **Other markets / types in the source** (e.g. GOVT Trade, MMKT Offer, FX Trade): the instruction says they are not written. Should UZCE leave them out of the feed, or will we filter them?
8. **Test data:** can UZCE provide a test connection or a recorded sample of one trading day?
