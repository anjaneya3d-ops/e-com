# Order Tracker — Meesho & Flipkart

A local website to track your e-commerce orders, sales, returns, and profit across Meesho and Flipkart.

## What's inside

```
order-tracker/
├── index.html          ← Main page
├── styles.css          ← Styles
├── app.js              ← All app logic
├── README.md           ← You're here
└── backend-example/    ← Optional Node.js API proxy
    ├── server.js
    ├── package.json
    └── .env.example
```

## Quick start (frontend only)

You just need a way to serve the files. The simplest options:

### Option 1: Python (already installed on most systems)

```bash
cd order-tracker
python3 -m http.server 8000
```

Open http://localhost:8000

### Option 2: Node.js

```bash
cd order-tracker
npx serve .
```

### Option 3: VS Code Live Server extension

Right-click `index.html` → "Open with Live Server"

That's it — the app works fully offline. All data saves to your browser's localStorage.

## Features

- **Dashboard**: Total orders, sales, returns, profit, AOV, return rate
- **Platform breakdown**: Meesho vs Flipkart side-by-side
- **Monthly trend chart**: See sales and profit over time
- **Date range and platform filters**
- **Manual order entry**
- **CSV import**: Paste or upload Meesho/Flipkart order exports
- **CSV export**: Download your full order history
- **Search**: Find orders by product, ID, or platform

## Getting your data out of Meesho & Flipkart

### Meesho Supplier Panel
1. Go to https://supplier.meesho.com → Orders
2. Click "Download" to export as Excel
3. Convert to CSV and paste into the Import tab

### Flipkart Seller Hub
1. Go to https://seller.flipkart.com → Orders → Manage Orders
2. Use "Export to Excel"
3. Convert to CSV and paste into the Import tab

The expected CSV columns are: `order_id, date, platform, product, price, cost, quantity, status`

You may need to rename columns from the platform export. `cost` is your purchase cost (not in their export — you fill this in for profit calculation).

## Auto-fetching upcoming orders (optional)

For this, you need official API credentials and the backend proxy.

### Why a backend?
Browser CORS will block direct calls to seller APIs. The backend keeps your API keys secret and proxies requests.

### Setup
```bash
cd backend-example
npm install
cp .env.example .env
# Edit .env with your real API credentials
npm start
```

The backend runs on http://localhost:3001. Once running, the frontend's "Fetch upcoming orders" buttons (in the API setup tab) will work.

### Getting Flipkart API credentials
1. Log in to https://seller.flipkart.com
2. Settings → API Access → Request credentials
3. Approval usually takes 1–3 business days
4. You'll get a Client ID and Client Secret

### Getting Meesho API credentials
Meesho's Supplier API is granted case-by-case:
1. Log in to https://supplier.meesho.com
2. Email `supplier-api@meesho.com` from your registered email
3. Explain your use case (inventory tracking, dashboard, etc.)
4. They'll provide an API token if approved

### Security notes
- **Never share your seller login password** with any tool, including this one
- API tokens are different from passwords — they can be revoked anytime from the seller panel
- Keep the `.env` file out of version control (add it to `.gitignore`)
- Frontend stores credentials in browser localStorage — this is fine for local use, not for public deployments

## Calculations explained

- **Sales**: sum of `price × quantity` for Delivered orders only
- **Profit**: sum of `(price − cost) × quantity` for Delivered orders only
- **Returns**: count of orders with Returned status
- **Refund amount**: sum of `price × quantity` for Returned orders
- **Return rate**: returns ÷ total orders
- **AOV (Average Order Value)**: total sales ÷ delivered order count
- **Pending**: count of Pending + Upcoming orders

## Browser support

Works in any modern browser (Chrome, Firefox, Safari, Edge from the last 3 years).

## Troubleshooting

**"Imported 0 orders" when pasting CSV**
- Check the first row has the column names exactly as shown above
- Make sure values are comma-separated, not tab- or semicolon-separated

**Backend fetch fails with CORS error**
- Make sure the backend is running on port 3001
- Check that `cors` is installed (`npm install cors`)

**Data disappeared**
- localStorage is per-browser and per-site
- If you cleared browser data, it's gone — use Export CSV regularly to back up
