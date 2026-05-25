// Order Tracker — handles real Meesho/Flipkart files
// Data model:
//   orders[]   - one row per sub-order (from Orders CSV or manual entry)
//   payments[] - one row per sub-order (from Payment XLSX)
// Joined by sub_order_id when computing dashboard metrics.

const ORDERS_KEY = 'order_tracker_orders_v2';
const PAYMENTS_KEY = 'order_tracker_payments_v2';
const CREDS_KEY = 'order_tracker_creds_v2';

let orders = [];
let payments = [];
let trendChart = null;
let statusChart = null;
let activeFilters = { from: '', to: '', platform: '' };

// ---------- Storage ----------
function load() {
  try { orders = JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]'); } catch (e) { orders = []; }
  try { payments = JSON.parse(localStorage.getItem(PAYMENTS_KEY) || '[]'); } catch (e) { payments = []; }
}
function saveOrders() { localStorage.setItem(ORDERS_KEY, JSON.stringify(orders)); }
function savePayments() { localStorage.setItem(PAYMENTS_KEY, JSON.stringify(payments)); }
function loadCreds() { try { return JSON.parse(localStorage.getItem(CREDS_KEY) || '{}'); } catch (e) { return {}; } }
function saveCreds(c) { localStorage.setItem(CREDS_KEY, JSON.stringify(c)); }

// ---------- Helpers ----------
function fmtINR(n) {
  if (n === null || n === undefined || isNaN(n)) return '₹0';
  const v = Math.round(n);
  const sign = v < 0 ? '-' : '';
  return sign + '₹' + Math.abs(v).toLocaleString('en-IN');
}
function fmtNum(n) {
  if (n === null || n === undefined || isNaN(n)) return '0';
  return Math.round(n).toLocaleString('en-IN');
}
function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }

function toast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(() => t.classList.remove('show'), 2800);
}

function normalizeStatus(s) {
  const t = (s || '').toString().toLowerCase().trim();
  if (t.includes('deliver')) return 'Delivered';
  if (t.includes('return')) return 'Returned';
  if (t.includes('cancel')) return 'Cancelled';
  if (t.includes('exchange')) return 'Exchange';
  if (t.includes('ready_to_ship') || t.includes('ready to ship') || t === 'rts') return 'Ready to ship';
  if (t.includes('ship') || t === 'dispatched') return 'Shipped';
  if (t.includes('pend') || t.includes('process') || t.includes('approve')) return 'Pending';
  if (t.includes('upcom')) return 'Upcoming';
  return s ? (s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()) : 'Pending';
}

function statusClass(s) {
  return (s || '').toLowerCase().replace(/\s+/g, '_');
}

// ---------- Filtering ----------
function applyFilters(list) {
  return list.filter(o => {
    const d = o.date || '';
    if (activeFilters.from && d < activeFilters.from) return false;
    if (activeFilters.to && d > activeFilters.to) return false;
    if (activeFilters.platform && o.platform !== activeFilters.platform) return false;
    return true;
  });
}

// Build a payment lookup keyed by sub_order_id
function paymentIndex() {
  const idx = {};
  payments.forEach(p => { if (p.sub_order_id) idx[p.sub_order_id] = p; });
  return idx;
}

// ---------- Stats ----------
function computeStats(orderList) {
  const pIdx = paymentIndex();
  const s = {
    total: orderList.length,
    delivered: 0, transit: 0, returns: 0, cancelled: 0,
    gross: 0, returnAmount: 0, settlement: 0,
    commission: 0, shipping: 0, returnShip: 0, tax: 0,
    meesho: { count: 0, gross: 0, returns: 0, settlement: 0 },
    flipkart: { count: 0, gross: 0, returns: 0, settlement: 0 }
  };

  orderList.forEach(o => {
    const status = o.status || 'Pending';
    const platKey = o.platform === 'Flipkart' ? 'flipkart' : 'meesho';
    s[platKey].count++;

    if (status === 'Delivered') s.delivered++;
    else if (status === 'Returned' || status === 'Return') s.returns++;
    else if (status === 'Cancelled') s.cancelled++;
    else if (status === 'Shipped' || status === 'Ready to ship' || status === 'Pending' || status === 'Upcoming') s.transit++;

    // Get payment record if we have one
    const pay = pIdx[o.sub_order_id];

    if (pay) {
      // Real settlement data from payment XLSX
      s.gross += num(pay.sale_amount);
      s.returnAmount += num(pay.return_amount);
      s.settlement += num(pay.settlement);
      s.commission += num(pay.commission);
      s.shipping += num(pay.shipping);
      s.returnShip += num(pay.return_shipping);
      s.tax += num(pay.tcs) + num(pay.tds);
      s[platKey].gross += num(pay.sale_amount);
      s[platKey].returns += Math.abs(num(pay.return_amount));
      s[platKey].settlement += num(pay.settlement);
    } else {
      // Fallback: estimate from order itself
      const lineTotal = num(o.discounted_price) * num(o.quantity || 1);
      if (status === 'Delivered') {
        s.gross += lineTotal;
        s[platKey].gross += lineTotal;
      } else if (status === 'Returned') {
        s.returnAmount -= lineTotal;
        s[platKey].returns += lineTotal;
      }
    }
  });

  // Outstanding = settlements not yet paid (we don't track paid status, so this is total settlement)
  s.outstanding = s.settlement;

  // Derived metrics
  const deliveredOrders = orderList.filter(o => o.status === 'Delivered');
  s.aov = deliveredOrders.length > 0 ? s.gross / deliveredOrders.length : 0;
  s.avgSettlement = orderList.length > 0 ? s.settlement / orderList.length : 0;
  s.returnRate = s.total > 0 ? (s.returns / s.total) * 100 : 0;
  s.margin = s.gross > 0 ? (s.settlement / s.gross) * 100 : 0;

  return s;
}

function topProducts(orderList) {
  const pIdx = paymentIndex();
  const map = {};
  orderList.forEach(o => {
    const name = o.product || 'Unknown';
    if (!map[name]) map[name] = { count: 0, revenue: 0, settlement: 0, returns: 0 };
    map[name].count++;
    const pay = pIdx[o.sub_order_id];
    if (pay) {
      map[name].revenue += num(pay.sale_amount);
      map[name].settlement += num(pay.settlement);
      if (num(pay.return_amount) !== 0) map[name].returns++;
    } else {
      if (o.status === 'Delivered') map[name].revenue += num(o.discounted_price) * num(o.quantity || 1);
      if (o.status === 'Returned') map[name].returns++;
    }
  });
  return Object.entries(map)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);
}

function monthlyTrend(orderList) {
  const pIdx = paymentIndex();
  const months = {};
  orderList.forEach(o => {
    if (!o.date) return;
    const m = o.date.slice(0, 7);
    if (!months[m]) months[m] = { gross: 0, settlement: 0 };
    const pay = pIdx[o.sub_order_id];
    if (pay) {
      months[m].gross += num(pay.sale_amount);
      months[m].settlement += num(pay.settlement);
    } else if (o.status === 'Delivered') {
      months[m].gross += num(o.discounted_price) * num(o.quantity || 1);
    }
  });
  const labels = Object.keys(months).sort();
  return {
    labels,
    gross: labels.map(m => months[m].gross),
    settlement: labels.map(m => months[m].settlement)
  };
}

// ---------- Render ----------
function renderDashboard() {
  const filtered = applyFilters(orders);
  const s = computeStats(filtered);

  document.getElementById('m-orders').textContent = s.total;
  document.getElementById('m-delivered').textContent = s.delivered;
  document.getElementById('m-transit').textContent = s.transit;
  document.getElementById('m-returns').textContent = s.returns;
  document.getElementById('m-cancelled').textContent = s.cancelled;

  document.getElementById('m-gross').textContent = fmtINR(s.gross);
  document.getElementById('m-return-amount').textContent = fmtINR(s.returnAmount);
  document.getElementById('m-settlement').textContent = fmtINR(s.settlement);
  document.getElementById('m-outstanding').textContent = fmtINR(s.outstanding);

  document.getElementById('m-commission').textContent = fmtINR(s.commission);
  document.getElementById('m-shipping').textContent = fmtINR(s.shipping);
  document.getElementById('m-return-ship').textContent = fmtINR(s.returnShip);
  document.getElementById('m-tax').textContent = fmtINR(s.tax);

  document.getElementById('m-aov').textContent = fmtINR(s.aov);
  document.getElementById('m-avg-settlement').textContent = fmtINR(s.avgSettlement);
  document.getElementById('m-return-rate').textContent = s.returnRate.toFixed(1) + '%';
  document.getElementById('m-margin').textContent = s.margin.toFixed(1) + '%';

  document.getElementById('platform-split').innerHTML = `
    <div class="platform-card">
      <div class="platform-name"><span class="badge badge-meesho">Meesho</span></div>
      <div class="platform-stat"><span>Orders</span><span>${s.meesho.count}</span></div>
      <div class="platform-stat"><span>Gross sales</span><span>${fmtINR(s.meesho.gross)}</span></div>
      <div class="platform-stat"><span>Returns</span><span>${fmtINR(s.meesho.returns)}</span></div>
      <div class="platform-stat"><span>Net settlement</span><span>${fmtINR(s.meesho.settlement)}</span></div>
    </div>
    <div class="platform-card">
      <div class="platform-name"><span class="badge badge-flipkart">Flipkart</span></div>
      <div class="platform-stat"><span>Orders</span><span>${s.flipkart.count}</span></div>
      <div class="platform-stat"><span>Gross sales</span><span>${fmtINR(s.flipkart.gross)}</span></div>
      <div class="platform-stat"><span>Returns</span><span>${fmtINR(s.flipkart.returns)}</span></div>
      <div class="platform-stat"><span>Net settlement</span><span>${fmtINR(s.flipkart.settlement)}</span></div>
    </div>
  `;

  const tops = topProducts(filtered);
  const tpEl = document.getElementById('top-products');
  if (tops.length === 0) {
    tpEl.innerHTML = '<div class="empty-state">No products yet. Upload your Meesho files to see top performers.</div>';
  } else {
    tpEl.innerHTML = tops.map(p => `
      <div class="product-row">
        <div class="pname">${p.name}</div>
        <div class="pstats">
          <span>Orders: <strong>${p.count}</strong></span>
          <span>Revenue: <strong>${fmtINR(p.revenue)}</strong></span>
          <span>Settled: <strong>${fmtINR(p.settlement)}</strong></span>
          <span>Returns: <strong>${p.returns}</strong></span>
        </div>
      </div>
    `).join('');
  }

  renderTrendChart(filtered);
  renderStatusChart(filtered);
}

function renderTrendChart(list) {
  const ctx = document.getElementById('trendChart');
  if (!ctx || !window.Chart) return;
  if (trendChart) trendChart.destroy();
  const t = monthlyTrend(list);
  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: t.labels,
      datasets: [
        { label: 'Gross sale', data: t.gross, borderColor: '#2d5cf0', backgroundColor: 'rgba(45,92,240,0.1)', tension: 0.3, fill: true },
        { label: 'Net settlement', data: t.settlement, borderColor: '#0f6e56', backgroundColor: 'rgba(15,110,86,0.1)', tension: 0.3, fill: true }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => '₹' + v.toLocaleString('en-IN') } } }
    }
  });
}

function renderStatusChart(list) {
  const ctx = document.getElementById('statusChart');
  if (!ctx || !window.Chart) return;
  if (statusChart) statusChart.destroy();
  const counts = {};
  list.forEach(o => {
    const s = o.status || 'Pending';
    counts[s] = (counts[s] || 0) + 1;
  });
  const labels = Object.keys(counts);
  const data = labels.map(l => counts[l]);
  const colorMap = {
    Delivered: '#0f6e56', Returned: '#a32d2d', Cancelled: '#888780',
    Shipped: '#378add', 'Ready to ship': '#bA7517', Pending: '#bA7517',
    Exchange: '#854f0b', Upcoming: '#378add'
  };
  const colors = labels.map(l => colorMap[l] || '#888780');
  statusChart = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
  });
}

function renderOrders() {
  const container = document.getElementById('orders-list');
  const search = (document.getElementById('search-orders').value || '').toLowerCase();
  const statusF = document.getElementById('orders-status-filter').value;
  const pIdx = paymentIndex();
  let list = orders;
  if (search) {
    list = list.filter(o =>
      (o.product || '').toLowerCase().includes(search) ||
      (o.sub_order_id || '').toLowerCase().includes(search) ||
      (o.sku || '').toLowerCase().includes(search) ||
      (o.platform || '').toLowerCase().includes(search)
    );
  }
  if (statusF) list = list.filter(o => o.status === statusF);

  if (list.length === 0) {
    container.innerHTML = '<div class="empty-state">No orders found. Upload Meesho files or add manually.</div>';
    return;
  }

  const sorted = [...list].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  container.innerHTML = `
    <div class="table-wrap">
    <table class="order-table">
      <thead>
        <tr>
          <th>Date</th><th>Sub Order ID</th><th>Platform</th><th>Product</th><th>SKU</th>
          <th>State</th><th>Qty</th>
          <th class="num">Price</th><th class="num">Settlement</th>
          <th>Status</th><th></th>
        </tr>
      </thead>
      <tbody>
        ${sorted.map(o => {
          const pay = pIdx[o.sub_order_id];
          const price = num(o.discounted_price) * num(o.quantity || 1);
          const settlement = pay ? num(pay.settlement) : null;
          const sCls = settlement === null ? '' : (settlement < 0 ? 'neg' : 'pos');
          return `
            <tr>
              <td>${o.date || '-'}</td>
              <td><code>${o.sub_order_id || '-'}</code></td>
              <td><span class="badge badge-${(o.platform || '').toLowerCase()}">${o.platform || '-'}</span></td>
              <td>${o.product || '-'}</td>
              <td>${o.sku || '-'}</td>
              <td>${o.customer_state || '-'}</td>
              <td>${o.quantity || 1}</td>
              <td class="num">${fmtINR(price)}</td>
              <td class="num ${sCls}">${settlement === null ? '—' : fmtINR(settlement)}</td>
              <td><span class="badge badge-${statusClass(o.status)}">${o.status || '-'}</span></td>
              <td><button class="btn-danger" data-delete="${o._idx}" style="padding: 4px 10px; font-size: 12px;">×</button></td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
    </div>
  `;

  container.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', e => {
      const idx = e.target.dataset.delete;
      orders = orders.filter(o => String(o._idx) !== String(idx));
      saveOrders();
      renderAll();
      toast('Order deleted');
    });
  });
}

function renderPayments() {
  const container = document.getElementById('payments-list');
  const search = (document.getElementById('search-payments').value || '').toLowerCase();
  let list = payments;
  if (search) {
    list = list.filter(p =>
      (p.product || '').toLowerCase().includes(search) ||
      (p.sub_order_id || '').toLowerCase().includes(search)
    );
  }

  if (list.length === 0) {
    container.innerHTML = '<div class="empty-state">No payment records yet. Upload your Meesho payment XLSX file.</div>';
    return;
  }

  const sorted = [...list].sort((a, b) => (b.payment_date || '').localeCompare(a.payment_date || ''));
  container.innerHTML = `
    <div class="table-wrap">
    <table class="order-table">
      <thead>
        <tr>
          <th>Payment date</th><th>Sub Order ID</th><th>Product</th><th>Status</th>
          <th class="num">Sale amt</th><th class="num">Return amt</th>
          <th class="num">Commission</th><th class="num">Shipping</th>
          <th class="num">TCS/TDS</th><th class="num">Net settlement</th>
        </tr>
      </thead>
      <tbody>
        ${sorted.map(p => `
          <tr>
            <td>${p.payment_date || '-'}</td>
            <td><code>${p.sub_order_id || '-'}</code></td>
            <td>${p.product || '-'}</td>
            <td><span class="badge badge-${statusClass(p.status)}">${p.status || '-'}</span></td>
            <td class="num">${fmtINR(p.sale_amount)}</td>
            <td class="num ${num(p.return_amount) < 0 ? 'neg' : ''}">${fmtINR(p.return_amount)}</td>
            <td class="num">${fmtINR(p.commission)}</td>
            <td class="num">${fmtINR(num(p.shipping) + num(p.return_shipping))}</td>
            <td class="num">${fmtINR(num(p.tcs) + num(p.tds))}</td>
            <td class="num ${num(p.settlement) < 0 ? 'neg' : 'pos'}">${fmtINR(p.settlement)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    </div>
  `;
}

function renderAll() {
  orders.forEach((o, i) => { if (o._idx === undefined) o._idx = 'o_' + (Date.now() + i); });
  payments.forEach((p, i) => { if (p._idx === undefined) p._idx = 'p_' + (Date.now() + i); });
  renderDashboard();
  renderOrders();
  renderPayments();
}

// ---------- CSV parsing ----------
function parseCSVLine(line) {
  const cells = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      cells.push(cur); cur = '';
    } else cur += c;
  }
  cells.push(cur);
  return cells.map(c => c.trim());
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { header: [], rows: [] };
  const header = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/^"|"$/g, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    const row = {};
    header.forEach((h, j) => row[h] = (cells[j] || '').replace(/^"|"$/g, ''));
    rows.push(row);
  }
  return { header, rows };
}

// Detect what kind of CSV this is and parse accordingly
function detectAndParse(text) {
  const { header, rows } = parseCSV(text);
  const headerStr = header.join('|');

  // Meesho Orders CSV: has "sub order no", "reason for credit entry"
  if (headerStr.includes('sub order no') && headerStr.includes('reason for credit entry')) {
    return { type: 'meesho_orders', orders: rows.map(parseMeeshoOrderRow) };
  }
  // Flipkart Orders CSV: typically has "order id", "order item id", "fsn"
  if (headerStr.includes('order id') || headerStr.includes('fsn')) {
    return { type: 'flipkart_orders', orders: rows.map(parseFlipkartOrderRow) };
  }
  // Generic
  if (header.includes('order_id') || header.includes('platform')) {
    return { type: 'generic', orders: rows.map(parseGenericRow) };
  }
  return { type: 'unknown', orders: [] };
}

function parseMeeshoOrderRow(r) {
  return {
    _idx: 'o_' + Math.random().toString(36).slice(2, 11),
    sub_order_id: r['sub order no'],
    catalog_id: r['catalog id'],
    date: (r['order date'] || '').slice(0, 10),
    platform: 'Meesho',
    customer_state: r['customer state'],
    product: r['product name'],
    sku: r['sku'],
    size: r['size'],
    quantity: parseInt(r['quantity']) || 1,
    listed_price: num(r['supplier listed price (incl. gst + commission)']),
    discounted_price: num(r['supplier discounted price (incl gst and commision)']),
    status: normalizeStatus(r['reason for credit entry']),
    order_source: r['order source']
  };
}

function parseFlipkartOrderRow(r) {
  return {
    _idx: 'o_' + Math.random().toString(36).slice(2, 11),
    sub_order_id: r['order item id'] || r['order id'],
    date: (r['order date'] || r['ordered on'] || '').slice(0, 10),
    platform: 'Flipkart',
    product: r['product title'] || r['product name'] || r['title'],
    sku: r['sku'] || r['seller sku'],
    quantity: parseInt(r['quantity']) || 1,
    listed_price: num(r['mrp']),
    discounted_price: num(r['selling price']) || num(r['final selling price']) || num(r['price']),
    status: normalizeStatus(r['order state'] || r['status']),
    customer_state: r['delivery state'] || r['ship to state']
  };
}

function parseGenericRow(r) {
  return {
    _idx: 'o_' + Math.random().toString(36).slice(2, 11),
    sub_order_id: r['order_id'] || r['id'] || 'GEN' + Math.random().toString(36).slice(2, 8),
    date: r['date'] || new Date().toISOString().slice(0, 10),
    platform: /flipkart/i.test(r['platform']) ? 'Flipkart' : 'Meesho',
    product: r['product'] || 'Item',
    sku: r['sku'] || '',
    quantity: parseInt(r['quantity']) || 1,
    listed_price: num(r['price']),
    discounted_price: num(r['price']),
    cost: num(r['cost']),
    status: normalizeStatus(r['status'])
  };
}

// Merge new orders into existing list, dedup by sub_order_id
function mergeOrders(newOrders) {
  const existing = new Set(orders.map(o => o.sub_order_id).filter(Boolean));
  let added = 0, updated = 0;
  newOrders.forEach(no => {
    if (!no.sub_order_id) { orders.push(no); added++; return; }
    if (existing.has(no.sub_order_id)) {
      // Update existing record
      const idx = orders.findIndex(o => o.sub_order_id === no.sub_order_id);
      const oldIdx = orders[idx]._idx;
      orders[idx] = { ...orders[idx], ...no, _idx: oldIdx };
      updated++;
    } else {
      orders.push(no);
      existing.add(no.sub_order_id);
      added++;
    }
  });
  saveOrders();
  return { added, updated };
}

// ---------- Meesho payment XLSX parsing ----------
function parseMeeshoPaymentXLSX(workbook) {
  const sheet = workbook.Sheets['Order Payments'];
  if (!sheet) throw new Error('Sheet "Order Payments" not found');
  // Header is on row 2 (index 1)
  const rows = XLSX.utils.sheet_to_json(sheet, { range: 1, defval: '' });
  const out = [];
  for (const r of rows) {
    const subOrderId = (r['Sub Order No'] || '').toString().trim();
    if (!subOrderId) continue;
    // The first data row sometimes is the "formula description" row — skip it
    if (subOrderId.includes('+') || subOrderId.toLowerCase().includes('formula')) continue;

    out.push({
      _idx: 'p_' + Math.random().toString(36).slice(2, 11),
      sub_order_id: subOrderId,
      order_date: (r['Order Date'] || '').toString().slice(0, 10),
      dispatch_date: (r['Dispatch Date'] || '').toString().slice(0, 10),
      payment_date: (r['Payment Date'] || '').toString().slice(0, 10),
      product: r['Product Name'] || '',
      sku: r['Supplier SKU'] || '',
      catalog_id: r['Catalog ID'] || '',
      status: normalizeStatus(r['Live Order Status']),
      quantity: parseInt(r['Quantity']) || 1,
      listed_price: num(r['Listing Price (Incl. taxes)']),
      settlement: num(r['Final Settlement Amount']),
      price_type: r['Price Type'] || '',
      sale_amount: num(r['Total Sale Amount (Incl. Shipping & GST)']),
      return_amount: num(r['Total Sale Return Amount (Incl. Shipping & GST)']),
      commission: num(r['Meesho Commission (Incl. GST)']),
      gold_fee: num(r['Meesho gold platform fee (Incl. GST)']),
      mall_fee: num(r['Meesho mall platform fee (Incl. GST)']),
      fixed_fee: num(r['Fixed Fee (Incl. GST)']),
      warehousing_fee: num(r['Warehousing fee (Incl. GST)']),
      shipping: num(r['Shipping Charge (Incl. GST)']),
      return_shipping: num(r['Return Shipping Charge (Incl. GST)']),
      tcs: num(r['TCS']),
      tds: num(r['TDS']),
      compensation: num(r['Compensation']),
      claims: num(r['Claims']),
      recovery: num(r['Recovery'])
    });
  }
  return out;
}

function mergePayments(newPayments) {
  const existing = new Set(payments.map(p => p.sub_order_id).filter(Boolean));
  let added = 0, updated = 0;
  newPayments.forEach(np => {
    if (!np.sub_order_id) return;
    if (existing.has(np.sub_order_id)) {
      const idx = payments.findIndex(p => p.sub_order_id === np.sub_order_id);
      const oldIdx = payments[idx]._idx;
      payments[idx] = { ...payments[idx], ...np, _idx: oldIdx };
      updated++;
    } else {
      payments.push(np);
      existing.add(np.sub_order_id);
      added++;
    }
  });
  savePayments();

  // Also create order shells for any payment that doesn't have a matching order yet
  const orderIds = new Set(orders.map(o => o.sub_order_id));
  let synthesized = 0;
  newPayments.forEach(p => {
    if (p.sub_order_id && !orderIds.has(p.sub_order_id)) {
      orders.push({
        _idx: 'o_' + Math.random().toString(36).slice(2, 11),
        sub_order_id: p.sub_order_id,
        date: p.order_date,
        platform: 'Meesho',
        product: p.product,
        sku: p.sku,
        catalog_id: p.catalog_id,
        quantity: p.quantity,
        listed_price: p.listed_price,
        discounted_price: p.listed_price,
        status: p.status
      });
      orderIds.add(p.sub_order_id);
      synthesized++;
    }
  });
  if (synthesized > 0) saveOrders();

  return { added, updated, synthesized };
}

// ---------- File upload handlers ----------
function handleFileUpload(inputId, statusId, handler) {
  document.getElementById(inputId).addEventListener('change', async e => {
    const file = e.target.files[0];
    const status = document.getElementById(statusId);
    if (!file) return;
    status.className = 'api-status';
    status.textContent = `Reading ${file.name}...`;
    try {
      await handler(file, status);
    } catch (err) {
      status.className = 'api-status error';
      status.textContent = 'Error: ' + err.message;
    }
    e.target.value = '';
  });
}

handleFileUpload('meesho-orders-file', 'meesho-orders-status', async (file, status) => {
  const text = await file.text();
  const result = detectAndParse(text);
  if (result.type !== 'meesho_orders') {
    if (result.type === 'generic' || result.type === 'flipkart_orders') {
      throw new Error('This doesn\'t look like a Meesho Orders CSV. Detected: ' + result.type + '. Try the matching upload box.');
    }
    throw new Error('Could not detect Meesho format. Check the file is the Orders export.');
  }
  const { added, updated } = mergeOrders(result.orders);
  status.className = 'api-status success';
  status.textContent = `✓ ${added} new orders, ${updated} updated`;
  toast(`Imported ${added + updated} Meesho orders`, 'success');
  renderAll();
});

handleFileUpload('meesho-payment-file', 'meesho-payment-status', async (file, status) => {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const parsed = parseMeeshoPaymentXLSX(wb);
  const { added, updated, synthesized } = mergePayments(parsed);
  status.className = 'api-status success';
  status.textContent = `✓ ${added} payments added, ${updated} updated${synthesized > 0 ? `, ${synthesized} orders auto-created from payment records` : ''}`;
  toast(`Imported ${added + updated} payment records`, 'success');
  renderAll();
});

handleFileUpload('flipkart-orders-file', 'flipkart-orders-status', async (file, status) => {
  const text = await file.text();
  const result = detectAndParse(text);
  if (result.type !== 'flipkart_orders') {
    throw new Error('Could not detect Flipkart format. Headers found: ' + result.type);
  }
  const { added, updated } = mergeOrders(result.orders);
  status.className = 'api-status success';
  status.textContent = `✓ ${added} new orders, ${updated} updated`;
  toast(`Imported ${added + updated} Flipkart orders`, 'success');
  renderAll();
});

handleFileUpload('generic-csv-file', 'generic-csv-status', async (file, status) => {
  const text = await file.text();
  const result = detectAndParse(text);
  if (result.orders.length === 0) throw new Error('No rows found');
  const { added, updated } = mergeOrders(result.orders);
  status.className = 'api-status success';
  status.textContent = `✓ ${added} new orders, ${updated} updated (detected: ${result.type})`;
  toast(`Imported ${added + updated} orders`, 'success');
  renderAll();
});

// ---------- Tabs ----------
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.querySelector(`[data-panel="${tab.dataset.tab}"]`).classList.add('active');
    if (tab.dataset.tab === 'dashboard') renderDashboard();
    if (tab.dataset.tab === 'orders') renderOrders();
    if (tab.dataset.tab === 'payments') renderPayments();
  });
});

// ---------- Manual entry ----------
document.getElementById('add-btn').addEventListener('click', () => {
  const o = {
    _idx: 'o_' + Math.random().toString(36).slice(2, 11),
    sub_order_id: document.getElementById('f-id').value.trim() || 'ORD' + Date.now().toString().slice(-6),
    date: document.getElementById('f-date').value || new Date().toISOString().slice(0, 10),
    platform: document.getElementById('f-platform').value,
    product: document.getElementById('f-product').value.trim() || 'Item',
    sku: document.getElementById('f-sku').value.trim(),
    listed_price: num(document.getElementById('f-price').value),
    discounted_price: num(document.getElementById('f-disc').value) || num(document.getElementById('f-price').value),
    cost: num(document.getElementById('f-cost').value),
    quantity: parseInt(document.getElementById('f-qty').value) || 1,
    status: document.getElementById('f-status').value
  };
  orders.push(o);
  saveOrders();
  renderAll();
  ['f-id', 'f-product', 'f-sku', 'f-price', 'f-disc', 'f-cost'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f-qty').value = '1';
  toast('Order added');
});

// ---------- Filters ----------
['filter-from', 'filter-to', 'filter-platform'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => {
    activeFilters.from = document.getElementById('filter-from').value;
    activeFilters.to = document.getElementById('filter-to').value;
    activeFilters.platform = document.getElementById('filter-platform').value;
    renderDashboard();
  });
});

document.getElementById('filter-reset').addEventListener('click', () => {
  ['filter-from', 'filter-to'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('filter-platform').value = '';
  activeFilters = { from: '', to: '', platform: '' };
  renderDashboard();
});

document.getElementById('search-orders').addEventListener('input', renderOrders);
document.getElementById('orders-status-filter').addEventListener('change', renderOrders);
document.getElementById('search-payments').addEventListener('input', renderPayments);

// ---------- Export / Clear ----------
document.getElementById('export-btn').addEventListener('click', () => {
  if (orders.length === 0) { toast('Nothing to export'); return; }
  const pIdx = paymentIndex();
  const header = ['sub_order_id', 'date', 'platform', 'product', 'sku', 'quantity', 'listed_price', 'discounted_price', 'status', 'settlement', 'commission', 'shipping', 'return_amount'];
  const rows = orders.map(o => {
    const p = pIdx[o.sub_order_id] || {};
    return [
      o.sub_order_id, o.date, o.platform, `"${(o.product || '').replace(/"/g, '""')}"`,
      o.sku, o.quantity, o.listed_price, o.discounted_price, o.status,
      p.settlement || '', p.commission || '', p.shipping || '', p.return_amount || ''
    ].join(',');
  });
  const csv = [header.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `orders_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('CSV downloaded');
});

document.getElementById('clear-btn').addEventListener('click', () => {
  if (orders.length === 0 && payments.length === 0) return;
  if (confirm('Delete all orders AND payments? This cannot be undone.')) {
    orders = []; payments = [];
    saveOrders(); savePayments();
    renderAll();
    toast('All data cleared');
  }
});

// ---------- API ----------
const creds = loadCreds();
if (creds.fkClientId) document.getElementById('fk-client-id').value = creds.fkClientId;
if (creds.fkClientSecret) document.getElementById('fk-client-secret').value = creds.fkClientSecret;
if (creds.msToken) document.getElementById('ms-token').value = creds.msToken;

document.getElementById('fk-save').addEventListener('click', () => {
  const c = loadCreds();
  c.fkClientId = document.getElementById('fk-client-id').value.trim();
  c.fkClientSecret = document.getElementById('fk-client-secret').value.trim();
  saveCreds(c);
  toast('Flipkart credentials saved', 'success');
});

document.getElementById('ms-save').addEventListener('click', () => {
  const c = loadCreds();
  c.msToken = document.getElementById('ms-token').value.trim();
  saveCreds(c);
  toast('Meesho credentials saved', 'success');
});

document.getElementById('fk-fetch').addEventListener('click', async () => {
  const status = document.getElementById('fk-status');
  status.textContent = 'Calling backend at localhost:3001...';
  status.className = 'api-status';
  try {
    const r = await fetch('http://localhost:3001/api/flipkart/orders');
    if (!r.ok) throw new Error('Backend ' + r.status);
    const data = await r.json();
    status.className = 'api-status success';
    status.textContent = `Fetched ${(data.orders || []).length} orders`;
  } catch (err) {
    status.className = 'api-status error';
    status.textContent = 'Failed: ' + err.message + '. Make sure backend is running.';
  }
});

document.getElementById('ms-fetch').addEventListener('click', async () => {
  const status = document.getElementById('ms-status');
  status.textContent = 'Calling backend at localhost:3001...';
  status.className = 'api-status';
  try {
    const r = await fetch('http://localhost:3001/api/meesho/orders');
    if (!r.ok) throw new Error('Backend ' + r.status);
    const data = await r.json();
    status.className = 'api-status success';
    status.textContent = `Fetched ${(data.orders || []).length} orders`;
  } catch (err) {
    status.className = 'api-status error';
    status.textContent = 'Failed: ' + err.message + '. Make sure backend is running.';
  }
});

// ---------- Init ----------
document.getElementById('f-date').value = new Date().toISOString().slice(0, 10);
load();
renderAll();
