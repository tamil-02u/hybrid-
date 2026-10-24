/* ============================================================
   dashboard.js – SmartHarvest IoT Monitoring Dashboard
   Handles: sensor charts, fan control, alerts, live polling
   ============================================================ */

/* ── Chart.js instances ── */
let tempChart     = null;
let humidityChart = null;
let gasChart      = null;

/* ── Polling intervals ── */
let sensorPollInterval = null;
let alertPollInterval  = null;
let fanPollInterval    = null;

/* ── App state ── */
let bookingData    = null;
let slotId         = null;
let bookingId      = null;
let fanMode        = 'auto';      // 'auto' | 'manual'
let fanToggleState = false;       // desired state in Manual mode
let fanPending     = false;       // awaiting confirmation from device
let seenAlertIds   = new Set();   // for "new alert" detection

/* ----------------------------------------------------------
   Entry point
   ---------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', async () => {
    const user = await requireAuth();
    if (!user) return;

    // Parse booking ID from query string
    const params = new URLSearchParams(window.location.search);
    bookingId = params.get('booking');

    if (!bookingId) {
        showToast('No booking specified. Redirecting…', 'warning');
        setTimeout(() => window.location.href = 'booking.html', 2000);
        return;
    }

    await loadBookingDetails();
    if (!slotId) return;

    await Promise.all([loadSlotStatus(), loadInitialReadings()]);
    initCharts();
    await loadAlerts();
    startPolling();
    initFanControls();
});

/* ----------------------------------------------------------
   Load Booking Details
   ---------------------------------------------------------- */
async function loadBookingDetails() {
    try {
        const { status, data } = await apiCall(`/api/bookings/${bookingId}`);
        if (status !== 200) {
            showToast('Could not load booking details.', 'error');
            return;
        }
        bookingData = data.booking ?? data;
        slotId      = bookingData.slot_id;
        populateInfoBar(bookingData);
    } catch {
        showToast('Network error loading booking.', 'error');
    }
}

function populateInfoBar(booking) {
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val ?? '—';
    };

    set('info-name',       booking.user_name   ?? 'N/A');
    set('info-booking-id', booking.booking_id  ?? booking.id ?? '—');
    set('info-slot',       booking.slot_name   ?? `Slot ${booking.slot_id}`);
    set('info-crop',       `${booking.crop_type} (${booking.crop_category})`);
    set('info-start-date', formatDate(booking.start_date));

    const remaining = daysRemaining(booking.end_date);
    const remainingEl = document.getElementById('info-days-remaining');
    if (remainingEl) {
        if (remaining === null) {
            remainingEl.textContent = '—';
        } else if (remaining < 0) {
            remainingEl.textContent = 'Expired';
            remainingEl.style.color = '#e74c3c';
        } else {
            remainingEl.textContent = `${remaining} day${remaining !== 1 ? 's' : ''} left`;
            remainingEl.style.color = remaining <= 3 ? '#e67e22' : '#2D7D46';
        }
    }
}

/* ----------------------------------------------------------
   Load Slot Status
   ---------------------------------------------------------- */
async function loadSlotStatus() {
    try {
        const { status, data } = await apiCall(`/api/slots/${slotId}/status`);
        if (status === 200) {
            updateConnectionStatus(data);
            checkDemoMode(data);
        }
    } catch { /* handled in poll loop */ }
}

function updateConnectionStatus(statusData) {
    const dot   = document.getElementById('connection-dot');
    const label = document.getElementById('connection-label');
    const isOnline = statusData.online ?? statusData.is_online ?? true;

    if (dot) {
        dot.className = `status-dot ${isOnline ? 'online' : 'offline'}`;
    }
    if (label) {
        label.textContent = isOnline ? 'Device Online' : 'Device Offline';
        label.style.color = isOnline ? '#2D7D46' : '#e74c3c';
    }
}

function checkDemoMode(statusData) {
    if (statusData.demo_mode) {
        const banner = document.getElementById('demo-banner');
        if (banner) {
            banner.textContent = '⚠️ DEMO MODE ACTIVE — Sensor data shown is computer-generated for demonstration purposes. This does not represent real hardware measurements.';
            banner.style.display = 'block';
        } else {
            // Create and inject banner dynamically if not in HTML
            const b = document.createElement('div');
            b.id = 'demo-banner';
            b.className = 'demo-banner';
            b.style.cssText = [
                'background:#fff3cd', 'color:#856404', 'border:1px solid #ffc107',
                'border-radius:8px', 'padding:0.75rem 1rem', 'margin:1rem 0',
                'font-size:0.88rem', 'font-weight:500'
            ].join(';');
            b.textContent = '⚠️ DEMO MODE ACTIVE — Sensor data shown is computer-generated for demonstration purposes. This does not represent real hardware measurements.';
            document.querySelector('.dashboard-main, main, .container')?.prepend(b);
        }
    }
}

/* ----------------------------------------------------------
   Load Initial Sensor Readings (seed charts)
   ---------------------------------------------------------- */
async function loadInitialReadings() {
    try {
        const { status, data } = await apiCall(`/api/slots/${slotId}/readings`);
        if (status !== 200) return;

        const readings = Array.isArray(data) ? data : (data.readings ?? []);
        readings.forEach(r => applyReadingToCharts(r));
        if (readings.length) updateValueDisplays(readings[readings.length - 1]);
    } catch { /* silently skip */ }
}

/* ----------------------------------------------------------
   Chart Initialisation
   ---------------------------------------------------------- */
function initCharts() {
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        plugins: { legend: { display: false } },
        scales: {
            x: { display: true, ticks: { maxTicksLimit: 8, maxRotation: 0 } },
            y: { beginAtZero: false }
        }
    };

    // Temperature chart
    const tempCanvas = document.getElementById('temp-chart');
    if (tempCanvas) {
        tempChart = new Chart(tempCanvas, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Temperature (°C)',
                    data: [],
                    borderColor: '#2D7D46',
                    backgroundColor: 'rgba(45,125,70,0.1)',
                    tension: 0.4,
                    fill: true,
                    pointRadius: 3,
                    pointHoverRadius: 6
                }]
            },
            options: commonOptions
        });
    }

    // Humidity chart
    const humCanvas = document.getElementById('humidity-chart');
    if (humCanvas) {
        humidityChart = new Chart(humCanvas, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Humidity (%)',
                    data: [],
                    borderColor: '#2980b9',
                    backgroundColor: 'rgba(41,128,185,0.1)',
                    tension: 0.4,
                    fill: true,
                    pointRadius: 3,
                    pointHoverRadius: 6
                }]
            },
            options: commonOptions
        });
    }

    // Gas / Air Quality chart
    const gasCanvas = document.getElementById('gas-chart');
    if (gasCanvas) {
        gasChart = new Chart(gasCanvas, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Gas Level (raw)',
                    data: [],
                    borderColor: '#e67e22',
                    backgroundColor: 'rgba(230,126,34,0.1)',
                    tension: 0.4,
                    fill: true,
                    pointRadius: 3,
                    pointHoverRadius: 6
                }]
            },
            options: { ...commonOptions, scales: { ...commonOptions.scales, y: { beginAtZero: true } } }
        });
    }
}

/* ----------------------------------------------------------
   Chart Update Helper (max 20 data points)
   ---------------------------------------------------------- */
function updateChart(chart, label, value) {
    if (!chart) return;
    chart.data.labels.push(label);
    chart.data.datasets[0].data.push(value);
    if (chart.data.labels.length > 20) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
    }
    chart.update('none'); // no animation for live updates
}

/* ----------------------------------------------------------
   Apply a reading object to all charts
   ---------------------------------------------------------- */
function applyReadingToCharts(reading) {
    const label = reading.timestamp
        ? new Date(reading.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    if (reading.temperature  != null) updateChart(tempChart,     label, reading.temperature);
    if (reading.humidity     != null) updateChart(humidityChart, label, reading.humidity);
    if (reading.gas_level    != null) updateChart(gasChart,      label, reading.gas_level);
}

/* ----------------------------------------------------------
   Sensor value display update
   ---------------------------------------------------------- */
function updateValueDisplays(reading) {
    updateSensorDisplay('temp-value',     reading.temperature,  '°C', getTemperatureStatus);
    updateSensorDisplay('humidity-value', reading.humidity,     '%',  getHumidityStatus);
    updateSensorDisplay('gas-value',      reading.gas_level,    '',   getGasStatus);

    // Fan state (from latest reading or status)
    if (reading.fan_state != null) {
        updateFanDisplay(reading.fan_state);
    }

    // Pulse animation on update
    ['temp-value', 'humidity-value', 'gas-value'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.remove('value-updated');
            void el.offsetWidth; // reflow
            el.classList.add('value-updated');
            setTimeout(() => el.classList.remove('value-updated'), 600);
        }
    });
}

function updateSensorDisplay(elementId, value, unit, statusFn) {
    const el = document.getElementById(elementId);
    if (!el || value == null) return;

    const rounded = typeof value === 'number' ? value.toFixed(1) : value;
    el.textContent = `${rounded}${unit}`;

    const statusResult = statusFn ? statusFn(parseFloat(value)) : null;
    if (statusResult) {
        const badgeEl = document.getElementById(`${elementId.replace('-value', '')}-status`);
        if (badgeEl) {
            badgeEl.textContent  = statusResult.label;
            badgeEl.className    = `sensor-badge badge-${statusResult.level}`;
        }
    }
}

/* ----------------------------------------------------------
   Threshold helpers (client-side display)
   ---------------------------------------------------------- */
function getTemperatureStatus(val) {
    if (val > 30)  return { level: 'danger',  label: '🔴 High' };
    if (val < 10)  return { level: 'warning', label: '🔵 Low' };
    return               { level: 'normal',   label: '🟢 Normal' };
}

function getHumidityStatus(val) {
    if (val < 40 || val > 80) return { level: 'warning', label: '⚠️ Warning' };
    return                           { level: 'normal',   label: '🟢 Safe' };
}

function getGasStatus(val) {
    if (val > 700) return { level: 'danger',  label: '🔴 High' };
    if (val > 400) return { level: 'warning', label: '⚠️ Warning' };
    return               { level: 'normal',   label: '🟢 Normal' };
}

/* ----------------------------------------------------------
   Start Live Polling
   ---------------------------------------------------------- */
function startPolling() {
    // Sensor + status poll every 5 seconds
    sensorPollInterval = setInterval(pollSensorData, 5000);
    // Alert panel refresh every 30 seconds
    alertPollInterval  = setInterval(loadAlerts, 30000);
}

async function pollSensorData() {
    try {
        // Status (connection, fan confirmed state)
        const { status: s1, data: statusData } = await apiCall(`/api/slots/${slotId}/status`);
        if (s1 === 200) {
            updateConnectionStatus(statusData);
            checkDeviceOffline(statusData);
            // Fan confirmed state from poll
            if (statusData.fan_commands?.length) {
                const latest = statusData.fan_commands[statusData.fan_commands.length - 1];
                updateFanConfirmedState(latest.confirmed_state);
                renderFanHistory(statusData.fan_commands.slice(-5));
                if (fanPending && latest.confirmed_state != null) {
                    fanPending = false;
                    hideFanLoadingOverlay();
                }
            }
        }

        // Latest sensor reading
        const { status: s2, data: readData } = await apiCall(`/api/slots/${slotId}/readings`);
        if (s2 === 200) {
            const readings = Array.isArray(readData) ? readData : (readData.readings ?? []);
            const latest   = readings[readings.length - 1];
            if (latest) {
                applyReadingToCharts(latest);
                updateValueDisplays(latest);
            }
        }
    } catch (err) {
        console.error('Polling error:', err);
    }
}

function checkDeviceOffline(statusData) {
    const lastSeen = statusData.last_reading_at ?? statusData.last_seen;
    if (!lastSeen) return;
    const secondsAgo = (Date.now() - new Date(lastSeen).getTime()) / 1000;
    if (secondsAgo > 60) {
        showToast('⚠️ Device appears offline — last reading was over 60s ago.', 'warning');
    }
}

/* ----------------------------------------------------------
   Alerts Panel
   ---------------------------------------------------------- */
async function loadAlerts() {
    try {
        const { status, data } = await apiCall(`/api/slots/${slotId}/alerts`);
        if (status === 200) {
            const alerts = Array.isArray(data) ? data : (data.alerts ?? []);
            renderAlerts(alerts);
        }
    } catch { /* silently ignore */ }
}

function renderAlerts(alerts) {
    const container = document.getElementById('alerts-container');
    if (!container) return;

    if (!alerts.length) {
        container.innerHTML = `<p class="no-alerts">✅ No active alerts. Everything looks good!</p>`;
        return;
    }

    const severityIcons = { critical: '🔴', high: '🟠', warning: '🟡', info: 'ℹ️' };
    const severityOrder = ['critical', 'high', 'warning', 'info'];

    const sorted = [...alerts].sort((a, b) => {
        const ai = severityOrder.indexOf((a.severity || 'info').toLowerCase());
        const bi = severityOrder.indexOf((b.severity || 'info').toLowerCase());
        return ai - bi;
    });

    container.innerHTML = sorted.map(alert => {
        const sev   = (alert.severity || 'info').toLowerCase();
        const icon  = severityIcons[sev] ?? severityIcons.info;
        const isNew = !seenAlertIds.has(alert.id);
        if (alert.id) seenAlertIds.add(alert.id);

        return `
        <div class="alert-item alert-${sev} ${isNew ? 'alert-flash' : ''}"
             data-alert-id="${alert.id ?? ''}">
            <span class="alert-icon">${icon}</span>
            <div class="alert-content">
                <p class="alert-message">${alert.message ?? alert.description ?? 'Alert'}</p>
                <small class="alert-time">${alert.created_at ? formatDatetime(alert.created_at) : ''}</small>
            </div>
            <span class="badge badge-${sev}">${capitaliseFirst(sev)}</span>
        </div>`;
    }).join('');
}

/* ----------------------------------------------------------
   Fan Controls
   ---------------------------------------------------------- */
function initFanControls() {
    // Mode toggle buttons (Auto / Manual)
    const autoBtn   = document.getElementById('fan-mode-auto');
    const manualBtn = document.getElementById('fan-mode-manual');

    if (autoBtn) {
        autoBtn.addEventListener('click', () => setFanMode('auto'));
    }
    if (manualBtn) {
        manualBtn.addEventListener('click', () => setFanMode('manual'));
    }

    // Fan on/off toggle switch
    const fanToggle = document.getElementById('fan-toggle');
    if (fanToggle) {
        fanToggle.addEventListener('change', handleFanToggle);
    }

    // Initialise UI in auto mode
    setFanMode('auto');
}

function setFanMode(mode) {
    fanMode = mode;
    const autoBtn   = document.getElementById('fan-mode-auto');
    const manualBtn = document.getElementById('fan-mode-manual');
    const fanToggle = document.getElementById('fan-toggle');
    const modeLabel = document.getElementById('fan-mode-label');

    if (autoBtn)   autoBtn.classList.toggle('active',   mode === 'auto');
    if (manualBtn) manualBtn.classList.toggle('active', mode === 'manual');
    if (modeLabel) modeLabel.textContent = mode === 'auto' ? 'Auto Mode' : 'Manual Mode';

    if (fanToggle) {
        fanToggle.disabled = (mode === 'auto');
        const wrapper = fanToggle.closest('.toggle-wrapper, .fan-toggle-row');
        if (wrapper) wrapper.style.opacity = mode === 'auto' ? '0.5' : '1';
    }
}

async function handleFanToggle() {
    if (fanMode !== 'manual') return;
    if (fanPending) {
        showToast('Please wait — previous fan command is pending.', 'warning');
        return;
    }

    const fanToggle = document.getElementById('fan-toggle');
    const requested = fanToggle?.checked ? 'ON' : 'OFF';

    fanPending = true;
    showFanLoadingOverlay();

    try {
        const { status, data } = await apiCall(`/api/slots/${slotId}/fan-command`, 'POST', {
            requested_state: requested
        });

        if (status === 200 || status === 201) {
            const reqEl = document.getElementById('fan-requested-state');
            if (reqEl) reqEl.textContent = `Requested: ${requested}`;
            showToast(`Fan ${requested} command sent. Awaiting device confirmation…`, 'info');

            // Poll fan status every 3 s until confirmed
            if (fanPollInterval) clearInterval(fanPollInterval);
            fanPollInterval = setInterval(pollFanStatus, 3000);
        } else {
            showToast(data.message || 'Fan command failed.', 'error');
            fanPending = false;
            hideFanLoadingOverlay();
        }
    } catch {
        showToast('Network error sending fan command.', 'error');
        fanPending = false;
        hideFanLoadingOverlay();
    }
}

async function pollFanStatus() {
    try {
        const { status, data } = await apiCall(`/api/slots/${slotId}/status`);
        if (status !== 200) return;

        const commands = data.fan_commands ?? [];
        if (commands.length) {
            const latest = commands[commands.length - 1];
            updateFanConfirmedState(latest.confirmed_state);
            renderFanHistory(commands.slice(-5));

            if (latest.confirmed_state != null) {
                fanPending = false;
                hideFanLoadingOverlay();
                clearInterval(fanPollInterval);
                fanPollInterval = null;
                showToast(`Fan confirmed: ${latest.confirmed_state}`, 'success');
            }
        }
    } catch { /* ignore */ }
}

function updateFanDisplay(state) {
    const stateEl = document.getElementById('fan-state');
    if (stateEl) {
        stateEl.textContent = state ? 'ON' : 'OFF';
        stateEl.className   = `fan-state ${state ? 'fan-on' : 'fan-off'}`;
    }
}

function updateFanConfirmedState(confirmedState) {
    const el = document.getElementById('fan-confirmed-state');
    if (el && confirmedState != null) {
        el.textContent = `Confirmed: ${confirmedState}`;
        el.style.color = confirmedState === 'ON' ? '#2D7D46' : '#7f8c8d';
    }
}

function showFanLoadingOverlay() {
    const card = document.getElementById('fan-card');
    if (!card) return;
    let overlay = card.querySelector('.fan-loading-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'fan-loading-overlay';
        overlay.style.cssText = [
            'position:absolute', 'inset:0', 'background:rgba(255,255,255,0.75)',
            'display:flex', 'align-items:center', 'justify-content:center',
            'border-radius:inherit', 'z-index:10', 'font-size:0.9rem', 'color:#555'
        ].join(';');
        overlay.innerHTML = '<span class="spinner"></span> &nbsp; Sending command…';
        card.style.position = 'relative';
        card.appendChild(overlay);
    }
    overlay.style.display = 'flex';

    // Disable toggle while pending
    const fanToggle = document.getElementById('fan-toggle');
    if (fanToggle) fanToggle.disabled = true;
}

function hideFanLoadingOverlay() {
    const overlay = document.querySelector('#fan-card .fan-loading-overlay');
    if (overlay) overlay.style.display = 'none';
    if (fanMode === 'manual') {
        const fanToggle = document.getElementById('fan-toggle');
        if (fanToggle) fanToggle.disabled = false;
    }
}

function renderFanHistory(commands) {
    const container = document.getElementById('fan-history-timeline');
    if (!container) return;

    if (!commands.length) {
        container.innerHTML = '<p class="empty-timeline">No fan commands yet.</p>';
        return;
    }

    container.innerHTML = [...commands].reverse().map(cmd => {
        const state    = cmd.confirmed_state ?? cmd.requested_state ?? '—';
        const icon     = state === 'ON' ? '🌀' : '⏹';
        const time     = cmd.created_at ? formatDatetime(cmd.created_at) : '—';
        const pending  = cmd.confirmed_state == null ? ' <em>(pending)</em>' : '';
        return `
        <div class="timeline-item">
            <span class="timeline-icon">${icon}</span>
            <div class="timeline-content">
                <strong>Fan ${state}</strong>${pending}
                <small>${time}</small>
            </div>
        </div>`;
    }).join('');
}

/* ----------------------------------------------------------
   Helpers
   ---------------------------------------------------------- */
function capitaliseFirst(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

/* ----------------------------------------------------------
   Cleanup on page unload
   ---------------------------------------------------------- */
window.addEventListener('beforeunload', () => {
    if (sensorPollInterval) clearInterval(sensorPollInterval);
    if (alertPollInterval)  clearInterval(alertPollInterval);
    if (fanPollInterval)    clearInterval(fanPollInterval);
});
