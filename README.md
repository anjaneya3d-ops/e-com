# Order Tracker — Meesho & Flipkart

Track your e-commerce orders, payments, returns, and settlements across Meesho and Flipkart. Works with the **native files** from your seller panel — no column renaming needed.

## Quick start

```bash
cd order-tracker
python3 -m http.server 8000
```

Open http://localhost:8000

## Features

- **Direct upload** of Meesho Orders CSV, Meesho Payment XLSX, Flipkart Orders CSV
- **Real payment data**: settlement amounts, commission, shipping fees, TCS/TDS, returns
- **Auto-join** between Orders and Payments via Sub Order No
- **Dashboard** with 17 metrics: order counts by status, gross sales, net settlement, return rates, margins
- **Top products** by revenue
- **Monthly trend** chart (gross vs net settlement)
- **Status distribution** doughnut chart
- **Platform breakdown** Meesho vs Flipkart
- **Date range + platform filters**
- **Search and sort orders and payments**
- **CSV export** of the joined data
- **Persistent localStorage** — data survives page reload

## How to get your data out of Meesho

### Orders CSV
1. Log in to https://supplier.meesho.com
2. Go to **Orders**
3. Set date range
4. Click **Download** — saves as `Orders_<dates>_<supplierid>.csv`
5. Upload via "Meesho Orders CSV" box

### Payment XLSX (for settlements & fees)
1. Go to **Payments → Outstanding Payments** in supplier panel
2. Click **Download** — saves as `<id>_SP_ORDER_ADS_REFERRAL_PAYMENT_FILE_OUTSTANDING_PAYMENT_<date>.xlsx`
3. Upload via "Meesho Payment XLSX" box

The app reads the "Order Payments" sheet and pulls: settlement amount, sale amount, return amount, commission, shipping charges, TCS, TDS, and order status.

## How to get your data out of Flipkart

1. Log in to https://seller.flipkart.com
2. Orders → Manage Orders
3. **Export to Excel** → save as CSV
4. Upload via "Flipkart Orders CSV" box

## What gets calculated

When you upload both Orders + Payment files, the app joins them on `Sub Order No` and computes:

| Metric | Calculation |
|---|---|
| Gross sale value | Sum of `Total Sale Amount (Incl. Shipping & GST)` |
| Total returns | Sum of `Total Sale Return Amount` (negative) |
| Net settlement | Sum of `Final Settlement Amount` |
| Outstanding | Same as net settlement (Meesho calls this "outstanding payment") |
| Commission | Sum of `Meesho Commission (Incl. GST)` |
| Shipping | Sum of `Shipping Charge (Incl. GST)` |
| Return shipping | Sum of `Return Shipping Charge (Incl. GST)` |
| TCS + TDS | Sum of `TCS` + `TDS` columns |
| Return rate | Returned orders ÷ total orders |
| Net margin | Net settlement ÷ gross sales × 100% |
| AOV | Gross sales ÷ delivered order count |

Orders that don't have a matching payment record yet still appear (with settlement as "—"), so you can see your in-transit pipeline.

## API setup (optional)

For auto-fetching new orders. Most users skip this and upload files daily.

```bash
cd backend-example
npm install
cp .env.example .env
# Edit .env with your real API credentials
npm start
```

See the API setup tab in the app for credentials instructions.

## Troubleshooting

**"Could not detect Meesho format"**
You uploaded the wrong type of file in the wrong box. Meesho Orders CSV goes in the orders box; Meesho Payment XLSX goes in the payment box.

**Settlement shows "—" for some orders**
The order is in the Orders CSV but not yet in your Payment file. Meesho usually pays out 7-15 days after delivery. Once it appears in the next payment file, settlement will show.

**Data disappeared**
localStorage is per-browser. If you cleared browser data, it's gone. Use Export CSV to back up regularly.

## Files

```
order-tracker/
├── index.html          ← UI
├── styles.css          ← Styles
├── app.js              ← All logic + Meesho/Flipkart parsers
├── README.md
└── backend-example/    ← Optional Node.js API proxy
    ├── server.js
    ├── package.json
    └── .env.example
```
