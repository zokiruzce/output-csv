# Data required from the UZCE database

Data needed to build the market data files for Bloomberg and our database.
Please fill in the column **UZCE source** with the table and column the data comes from.

## Data items

| # | Data | Description | Example | UZCE source |
|---|---|---|---|---|
| 1 | Event ID | Unique identifier of each event (quote, trade, fixing) | `8812734` | |
| 2 | Event time | Date and time of the event, to the second | `2026-11-09 10:07:34` | |
| 3 | Instrument ID | GOVT: ISIN. MMKT: tenor. FX: currency pair / settlement | `UZA000005449`, `1D`, `USD/UZS_TOM` | |
| 4 | Issue number | Full issue number as stored (GOVT), or instrument code (MMKT, FX) | `28040UMFS`, `1D`, `6472` | |
| 5 | Market | GOVT, MMKT or FX | `GOVT` | |
| 6 | Record type | Bid, Offer, Trade or Fixing | `Bid` | |
| 7 | Price | GOVT bid / offer price (% of nominal); GOVT trade price (dirty, % of par) | `107.5089`, `107.4356` | |
| 8 | Yield | GOVT bid / offer yield (% per year); GOVT trade yield to maturity | `11.9644`, `11.9150` | |
| 9 | Rate | MMKT trade rate (% per year); FX fixing rate (UZS per unit of currency) | `13.76`, `11903.15` | |
| 10 | Volume | GOVT quotes: volume of the quote. GOVT trades: number of securities. MMKT trades: trade amount. FX fixing: total turnover | `1000`, `50000`, `248000000` | |
| 11 | Quote status | Whether the quote is active, changed or cancelled | `active` | |

## Data needed per market

| Market | Record type | Items |
|---|---|---|
| GOVT | Bid, Offer | 1–8, 10, 11 |
| GOVT | Trade | 1–8, 10 |
| MMKT | Trade | 1–6, 9, 10 |
| FX | Fixing | 1–6, 9, 10 |

Other combinations (e.g. MMKT Bid / Offer / Fixing, FX Trade) are not needed.

## Questions

1. What is the unit of **volume** for GOVT quotes and MMKT trades (number of bonds, amount in UZS)?
2. Is the **issue number** stored in full (e.g. `201006UMFS`)? We have seen shortened values such as `201003U`.
3. Does each **trade and fixing** have its own event ID?
