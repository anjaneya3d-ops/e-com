// Order Tracker — local website version
// Data persists in browser localStorage

const STORAGE_KEY = 'order_tracker_v1';
const CREDS_KEY = 'order_tracker_creds_v1';

let orders = [];
let platChart = null;
let trendChart = null;
let activeFilters = { from: '', to: '', platform: '' };

// ---------- Storage ----------
function loadOrders() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    orders = raw ? JSON.parse(raw) : [];
  } catch (e) {
    orders = [];
  }
}

function saveOrders() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
}

function loadCreds() {
  try {
    return JSON.parse(localStorage.getItem(CREDS_KEY) || '{}');
  } catch (e) {
    return {};
  }
}

function saveCreds(creds) {
  localStorage.setItem(CREDS_KEY, JSON.stringify(creds));
}

// ---------- Helpers ----------
function fmt(n) {
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

function toast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(() => t.classList.remove('show'), 2400);
}

function applyFilters(list) {
  return list.filter(o => {
    if (activeFilters.from && (o.date || '') < activeFilters.from) return false;
    if (activeFilters.to && (o.date || '') > activeFilters.to) return false;
    if (activeFilters.platform && o.platform !== activeFilters.platform) return false;
    return true;
  });
}

// ---------- Stats ----------
function computeStats(list) {
  const stats = {
    total: list.length,
    sales: 0,
    returns: 0,
    profit: 0,
    refund: 0,
    pending: 0,
    delivered: 0,
    meesho: { count: 0, sales: 0, returns: 0, profit: 0 },
    flipkart: { count: 0, sales: 0, returns: 0, profit: 0 }
  };

  list.forEach(o => {
    const lineTotal = (o.price || 0) * (o.quantity || 1);
    const lineProfit = ((o.price || 0) - (o.cost || 0)) * (o.quantity || 1);
    const key = o.platform === 'Flipkart' ? 'flipkart' : 'meesho';
    stats[key].count++;

    if (o.status === 'Returned') {
      stats.returns++;
      stats.refund += lineTotal;
      stats[key].returns++;
    } else if (o.status === 'Delivered') {
      stats.delivered++;
      stats.sales += lineTotal;
      stats.profit += lineProfit;
      stats[key].sales += lineTotal;
      stats[key].profit += lineProfit;
    } else if (o.status === 'Pending' || o.status === 'Upcoming') {
      stats.pending++;
    }
  });

  return stats;
}

function monthlyTrend(list) {
  const months = {};
  list.forEach(o => {
    if (!o.date || o.status !== 'Delivered') return;
    const month = o.date.slice(0, 7);
    if (!months[month]) months[month] = { sales: 0, profit: 0 };
    months[month].sales += (o.price || 0) * (o.quantity || 1);
    months[month].profit += ((o.price || 0) - (o.cost || 0)) * (o.quantity || 1);
  });
  const sorted = Object.keys(months).sort();
  return {
    labels: sorted,
    sales: sorted.map(m => months[m].sales),
    profit: sorted.map(m => months[m].profit)
  };
}

// ---------- Render ----------
function renderDashboard() {
  const filtered = applyFilters(orders);
  const s = computeStats(filtered);

  document.getElementById('m-orders').textContent = s.total;
  document.getElementById('m-sales').textContent = fmt(s.sales);
  document.getElementById('m-returns').textContent = s.returns;
  document.getElementById('m-profit').textContent = fmt(s.profit);
  document.getElementById('m-aov').textContent = s.delivered > 0 ? fmt(s.sales / s.delivered) : '₹0';
  document.getElementById('m-return-rate').textContent = s.total > 0 ? Math.round((s.returns / s.total) * 100) + '%' : '0%';
  document.getElementById('m-refund').textContent = fmt(s.refund);
  document.getElementById('m-pending').textContent = s.pending;

  document.getElementById('platform-split').innerHTML = `
    <div class="platform-card">
      <div class="platform-name"><span class="badge badge-meesho">Meesho</span></div>
      <div class="platform-stat"><span>Orders</span><span>${s.meesho.count}</span></div>
      <div class="platform-stat"><span>Sales</span><span>${fmt(s.meesho.sales)}</span></div>
      <div class="platform-stat"><span>Returns</span><span>${s.meesho.returns}</span></div>
      <div class="platform-stat"><span>Profit</span><span>${fmt(s.meesho.profit)}</span></div>
    </div>
    <div class="platform-card">
      <div class="platform-name"><span class="badge badge-flipkart">Flipkart</span></div>
      <div class="platform-stat"><span>Orders</span><span>${s.flipkart.count}</span></div>
      <div class="platform-stat"><span>Sales</span><span>${fmt(s.flipkart.sales)}</span></div>
      <div class="platform-stat"><span>Returns</span><span>${s.flipkart.returns}</span></div>
      <div class="platform-stat"><span>Profit</span><span>${fmt(s.flipkart.profit)}</span></div>
    </div>
  `;

  renderPlatChart(s);
  renderTrendChart(filtered);
}

function renderPlatChart(s) {
  const ctx = document.getElementById('platChart');
  if (!ctx || !window.Chart) return;
  if (platChart) platChart.destroy();
  platChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Sales', 'Profit'],
      datasets: [
        { label: 'Meesho', data: [s.meesho.sales, s.meesho.profit], backgroundColor: '#d4537e' },
        { label: 'Flipkart', data: [s.flipkart.sales, s.flipkart.profit], backgroundColor: '#378add' }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => '₹' + v.toLocaleString('en-IN') } } }
    }
  });
}

function renderTrendChart(list) {
  const ctx = document.getElementById('trendChart');
  if (!ctx || !window.Chart) return;
  if (trendChart) trendChart.destroy();
  const trend = monthlyTrend(list);
  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: trend.labels,
      datasets: [
        { label: 'Sales', data: trend.sales, borderColor: '#2d5cf0', backgroundColor: 'rgba(45, 92, 240, 0.1)', tension: 0.3, fill: true },
        { label: 'Profit', data: trend.profit, borderColor: '#0f6e56', backgroundColor: 'rgba(15, 110, 86, 0.1)', tension: 0.3, fill: true }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => '₹' + v.toLocaleString('en-IN') } } }
    }
  });
}

function renderOrders() {
  const container = document.getElementById('orders-list');
  const search = (document.getElementById('search-orders').value || '').toLowerCase();
  let list = applyFilters(orders);
  if (search) {
    list = list.filter(o =>
      (o.product || '').toLowerCase().includes(search) ||
      (o.id || '').toLowerCase().includes(search) ||
      (o.platform || '').toLowerCase().includes(search)
    );
  }

  if (list.length === 0) {
    container.innerHTML = '<div class="empty-state">No orders found. Add one or import a CSV.</div>';
    return;
  }

  const sorted = [...list].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  container.innerHTML = `
    <table class="order-table">
      <thead>
        <tr><th>Date</th><th>Order ID</th><th>Platform</th><th>Product</th><th>Qty</th><th>Price</th><th>Profit</th><th>Status</th><th></th></tr>
      </thead>
      <tbody>
        ${sorted.map(o => {
          const total = (o.price || 0) * (o.quantity || 1);
          const profit = ((o.price || 0) - (o.cost || 0)) * (o.quantity || 1);
          return `
            <tr>
              <td>${o.date || '-'}</td>
              <td>${o.id || '-'}</td>
              <td><span class="badge badge-${(o.platform || '').toLowerCase()}">${o.platform || '-'}</span></td>
              <td>${o.product || '-'}</td>
              <td>${o.quantity || 1}</td>
              <td>${fmt(total)}</td>
              <td>${fmt(profit)}</td>
              <td><span class="badge badge-${(o.status || '').toLowerCase()}">${o.status || '-'}</span></td>
              <td><button class="btn-danger" data-delete="${o._idx}" style="padding: 4px 10px; font-size: 12px;">Delete</button></td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;

  container.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', e => {
      const idx = parseInt(e.target.dataset.delete);
      orders = orders.filter(o => o._idx !== idx);
      saveOrders();
      renderAll();
      toast('Order deleted');
    });
  });
}

function renderAll() {
  orders.forEach((o, i) => { if (o._idx === undefined) o._idx = Date.now() + i; });
  renderDashboard();
  renderOrders();
}

// ---------- CSV ----------
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map(h => h.trim().toLowerCase());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map(c => c.trim());
    const row = {};
    header.forEach((h, j) => row[h] = cells[j] || '');
    rows.push({
      _idx: Date.now() + i,
      id: row.order_id || row.id || 'ORD' + (Date.now() + i).toString().slice(-6),
      date: row.date || new Date().toISOString().slice(0, 10),
      platform: /flipkart/i.test(row.platform) ? 'Flipkart' : 'Meesho',
      product: row.product || 'Item',
      price: parseFloat(row.price) || 0,
      cost: parseFloat(row.cost) || 0,
      quantity: parseInt(row.quantity) || 1,
      status: normalizeStatus(row.status)
    });
  }
  return rows;
}

function normalizeStatus(s) {
  const t = (s || '').toLowerCase();
  if (t.includes('return')) return 'Returned';
  if (t.includes('upcom')) return 'Upcoming';
  if (t.includes('pend') || t.includes('process')) return 'Pending';
  return 'Delivered';
}

// ---------- Tab switching ----------
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.querySelector(`[data-panel="${tab.dataset.tab}"]`).classList.add('active');
    if (tab.dataset.tab === 'dashboard') renderDashboard();
    if (tab.dataset.tab === 'orders') renderOrders();
  });
});

// ---------- Add order ----------
document.getElementById('add-btn').addEventListener('click', () => {
  const order = {
    _idx: Date.now(),
    id: document.getElementById('f-id').value.trim() || 'ORD' + Date.now().toString().slice(-6),
    date: document.getElementById('f-date').value || new Date().toISOString().slice(0, 10),
    platform: document.getElementById('f-platform').value,
    product: document.getElementById('f-product').value.trim() || 'Item',
    price: parseFloat(document.getElementById('f-price').value) || 0,
    cost: parseFloat(document.getElementById('f-cost').value) || 0,
    quantity: parseInt(document.getElementById('f-qty').value) || 1,
    status: document.getElementById('f-status').value
  };
  orders.push(order);
  saveOrders();
  renderAll();
  ['f-id', 'f-product', 'f-price', 'f-cost'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f-qty').value = '1';
  toast('Order added');
});

// ---------- CSV import ----------
document.getElementById('csv-import-btn').addEventListener('click', () => {
  const text = document.getElementById('csv-input').value;
  const rows = parseCSV(text);
  if (rows.length === 0) { toast('No valid rows found', 'error'); return; }
  orders = orders.concat(rows);
  saveOrders();
  renderAll();
  toast(`Imported ${rows.length} orders`, 'success');
});

document.getElementById('csv-file').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    document.getElementById('csv-input').value = reader.result;
  };
  reader.readAsText(file);
});

// CSV file picker on the API setup tab — imports directly
document.getElementById('api-csv-file').addEventListener('change', e => {
  const file = e.target.files[0];
  const status = document.getElementById('api-csv-status');
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const rows = parseCSV(reader.result);
    if (rows.length === 0) {
      status.textContent = 'No valid rows found in the file. Check the column headers.';
      status.className = 'api-status error';
      return;
    }
    orders = orders.concat(rows);
    saveOrders();
    renderAll();
    status.textContent = `Imported ${rows.length} orders from ${file.name}`;
    status.className = 'api-status success';
    toast(`Imported ${rows.length} orders`, 'success');
  };
  reader.onerror = () => {
    status.textContent = 'Could not read the file.';
    status.className = 'api-status error';
  };
  reader.readAsText(file);
});

document.getElementById('csv-sample-btn').addEventListener('click', () => {
  document.getElementById('csv-input').value =
`order_id,date,platform,product,price,cost,quantity,status
ORD001,2026-05-15,Meesho,Cotton kurti,499,280,1,Delivered
ORD002,2026-05-16,Flipkart,Phone case,299,120,2,Delivered
ORD003,2026-05-17,Meesho,Bedsheet,799,450,1,Returned
ORD004,2026-05-18,Flipkart,Wireless earbuds,1499,900,1,Delivered
ORD005,2026-05-19,Meesho,Saree,1299,750,1,Delivered
ORD006,2026-05-20,Flipkart,Smartwatch,2499,1600,1,Pending
ORD007,2026-05-21,Meesho,Leggings,349,180,3,Delivered
ORD008,2026-05-22,Meesho,Handbag,899,500,1,Returned
ORD009,2026-05-25,Flipkart,Bluetooth speaker,1199,650,1,Upcoming
ORD010,2026-05-26,Meesho,Curtains,599,320,2,Upcoming`;
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

// ---------- Export / Clear ----------
document.getElementById('export-btn').addEventListener('click', () => {
  if (orders.length === 0) { toast('No orders to export'); return; }
  const header = 'order_id,date,platform,product,price,cost,quantity,status';
  const rows = orders.map(o => [o.id, o.date, o.platform, `"${(o.product || '').replace(/"/g, '""')}"`, o.price, o.cost, o.quantity, o.status].join(','));
  const csv = [header, ...rows].join('\n');
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
  if (orders.length === 0) return;
  if (confirm('Delete all orders? This cannot be undone.')) {
    orders = [];
    saveOrders();
    renderAll();
    toast('All orders cleared');
  }
});

// ---------- API credentials (stored locally) ----------
const creds = loadCreds();
if (creds.fkClientId) document.getElementById('fk-client-id').value = creds.fkClientId;
if (creds.fkClientSecret) document.getElementById('fk-client-secret').value = creds.fkClientSecret;
if (creds.msToken) document.getElementById('ms-token').value = creds.msToken;

document.getElementById('fk-save').addEventListener('click', () => {
  const c = loadCreds();
  c.fkClientId = document.getElementById('fk-client-id').value.trim();
  c.fkClientSecret = document.getElementById('fk-client-secret').value.trim();
  saveCreds(c);
  toast('Flipkart credentials saved locally', 'success');
});

document.getElementById('ms-save').addEventListener('click', () => {
  const c = loadCreds();
  c.msToken = document.getElementById('ms-token').value.trim();
  saveCreds(c);
  toast('Meesho credentials saved locally', 'success');
});

// Placeholder fetch handlers — real implementation requires the backend proxy
// (browser CORS will block direct calls to seller APIs)
document.getElementById('fk-fetch').addEventListener('click', async () => {
  const status = document.getElementById('fk-status');
  status.textContent = 'Trying to reach local backend at http://localhost:3001/api/flipkart/orders ...';
  status.className = 'api-status';
  try {
    const res = await fetch('http://localhost:3001/api/flipkart/orders');
    if (!res.ok) throw new Error('Backend returned ' + res.status);
    const data = await res.json();
    const newOrders = (data.orders || []).map((o, i) => ({
      _idx: Date.now() + i,
      id: o.orderId || o.order_id,
      date: (o.orderDate || '').slice(0, 10),
      platform: 'Flipkart',
      product: o.title || o.productTitle || 'Item',
      price: parseFloat(o.sellingPrice || o.price) || 0,
      cost: 0,
      quantity: parseInt(o.quantity) || 1,
      status: 'Upcoming'
    }));
    orders = orders.concat(newOrders);
    saveOrders();
    renderAll();
    status.textContent = `Fetched ${newOrders.length} upcoming orders from Flipkart`;
    status.className = 'api-status success';
  } catch (err) {
    status.textContent = 'Failed: ' + err.message + '. Make sure the backend is running (see README).';
    status.className = 'api-status error';
  }
});

document.getElementById('ms-fetch').addEventListener('click', async () => {
  const status = document.getElementById('ms-status');
  status.textContent = 'Trying to reach local backend at http://localhost:3001/api/meesho/orders ...';
  status.className = 'api-status';
  try {
    const res = await fetch('http://localhost:3001/api/meesho/orders');
    if (!res.ok) throw new Error('Backend returned ' + res.status);
    const data = await res.json();
    const newOrders = (data.orders || []).map((o, i) => ({
      _idx: Date.now() + i,
      id: o.order_id || o.suborder_id,
      date: (o.order_date || '').slice(0, 10),
      platform: 'Meesho',
      product: o.product_name || 'Item',
      price: parseFloat(o.transfer_price || o.price) || 0,
      cost: 0,
      quantity: parseInt(o.quantity) || 1,
      status: 'Upcoming'
    }));
    orders = orders.concat(newOrders);
    saveOrders();
    renderAll();
    status.textContent = `Fetched ${newOrders.length} upcoming orders from Meesho`;
    status.className = 'api-status success';
  } catch (err) {
    status.textContent = 'Failed: ' + err.message + '. Make sure the backend is running (see README).';
    status.className = 'api-status error';
  }
});

// ---------- Init ----------
document.getElementById('f-date').value = new Date().toISOString().slice(0, 10);
loadOrders();
renderAll();
