/* ============================================================
   booking.js – SmartHarvest Booking Page Logic
   Handles: slot display, crop selection, form submit, cancellation
   ============================================================ */

/* ── Module-level state ── */
let currentUser      = null;
let allSlots         = [];
let myBookings       = [];
let selectedSlotId   = null;
let selectedCrop     = null;
let cancelTargetId   = null; // booking ID pending cancellation confirmation

const TODAY_STR = new Date().toISOString().split('T')[0];

/* ----------------------------------------------------------
   Entry point
   ---------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', async () => {
    currentUser = await requireAuth();
    if (!currentUser) return;

    prefillUserInfo(currentUser);
    setDateMin();
    await Promise.all([loadSlots(), loadMyBookings()]);

    initCropCategoryToggle();
    initCropChipSelection();
    initBookingForm();
    initCancelConfirmModal();
    initDateTimeListeners();
});

/* ----------------------------------------------------------
   Pre-fill user info (readonly fields)
   ---------------------------------------------------------- */
function prefillUserInfo(user) {
    const nameEl  = document.getElementById('booking-name');
    const phoneEl = document.getElementById('booking-phone');
    if (nameEl)  { nameEl.value    = user.name  || ''; nameEl.readOnly  = true; }
    if (phoneEl) { phoneEl.value   = user.phone || ''; phoneEl.readOnly = true; }
}

/* ----------------------------------------------------------
   Set minimum date on date input to today
   ---------------------------------------------------------- */
function setDateMin() {
    const dateInput = document.getElementById('start-date');
    if (dateInput) dateInput.min = TODAY_STR;
}

/* ----------------------------------------------------------
   Load Slots from API
   ---------------------------------------------------------- */
async function loadSlots() {
    try {
        const { status, data } = await apiCall('/api/slots');
        if (status === 200) {
            allSlots = Array.isArray(data) ? data : (data.slots ?? []);
            renderSlotCards(allSlots);
        } else {
            showToast('Failed to load storage slots.', 'error');
        }
    } catch {
        showToast('Network error while loading slots.', 'error');
    }
}

/* ----------------------------------------------------------
   Load My Bookings from API
   ---------------------------------------------------------- */
async function loadMyBookings() {
    try {
        const { status, data } = await apiCall('/api/bookings/my');
        if (status === 200) {
            myBookings = Array.isArray(data) ? data : (data.bookings ?? []);
            renderMyBookings(myBookings);
        } else {
            showToast('Failed to load your bookings.', 'error');
        }
    } catch {
        showToast('Network error while loading bookings.', 'error');
    }
}

/* ----------------------------------------------------------
   Render Slot Cards
   ---------------------------------------------------------- */
function renderSlotCards(slots) {
    const container = document.getElementById('slots-container');
    if (!container) return;

    if (!slots.length) {
        container.innerHTML = `<p class="empty-state">No storage slots available at the moment.</p>`;
        return;
    }

    container.innerHTML = slots.map(slot => buildSlotCard(slot)).join('');

    // Attach select button listeners
    container.querySelectorAll('.btn-select-slot').forEach(btn => {
        btn.addEventListener('click', () => handleSlotSelect(parseInt(btn.dataset.slotId)));
    });
}

function buildSlotCard(slot) {
    const status    = (slot.current_status || 'available').toLowerCase();
    const isBooked  = status === 'booked';
    const isSelected = slot.id === selectedSlotId;

    let borderClass, badgeClass, badgeLabel, btnDisabled, btnText;

    if (isSelected) {
        borderClass = 'slot-selected'; badgeClass = 'badge-selected'; badgeLabel = 'Selected';
        btnDisabled = ''; btnText = 'Selected ✓';
    } else if (isBooked) {
        borderClass = 'slot-booked'; badgeClass = 'badge-booked'; badgeLabel = 'Booked';
        btnDisabled = 'disabled'; btnText = 'Unavailable';
    } else {
        borderClass = 'slot-available'; badgeClass = 'badge-available'; badgeLabel = 'Available';
        btnDisabled = ''; btnText = 'Select Slot';
    }

    const capacityLine = slot.capacity
        ? `<p class="slot-detail"><span>Capacity:</span> <strong>${slot.capacity}</strong></p>` : '';
    const locationLine = slot.location
        ? `<p class="slot-detail"><span>Location:</span> <strong>${slot.location}</strong></p>` : '';
    const tempLine = slot.temperature_range
        ? `<p class="slot-detail"><span>Temp Range:</span> <strong>${slot.temperature_range}</strong></p>` : '';

    return `
    <div class="slot-card ${borderClass}" id="slot-card-${slot.id}" data-slot-id="${slot.id}">
        <div class="slot-card-header">
            <h3 class="slot-name">${slot.name || `Slot ${slot.id}`}</h3>
            <span class="badge ${badgeClass}">${badgeLabel}</span>
        </div>
        <div class="slot-card-body">
            ${capacityLine}
            ${locationLine}
            ${tempLine}
        </div>
        <div class="slot-card-footer">
            <button class="btn-select-slot ${isSelected ? 'btn-selected' : ''}"
                    data-slot-id="${slot.id}"
                    ${btnDisabled}>
                ${btnText}
            </button>
        </div>
    </div>`;
}

/* ----------------------------------------------------------
   Handle Slot Selection
   ---------------------------------------------------------- */
function handleSlotSelect(slotId) {
    selectedSlotId = slotId;
    // Re-render to update visual state
    renderSlotCards(allSlots);
}

/* ----------------------------------------------------------
   Refresh slot availability after date/time/duration change
   ---------------------------------------------------------- */
async function refreshSlotAvailability() {
    const startDate    = document.getElementById('start-date')?.value;
    const startTime    = document.getElementById('start-time')?.value;
    const durationDays = document.getElementById('duration-days')?.value;

    let endpoint = '/api/slots';
    const params = new URLSearchParams();
    if (startDate)    params.set('start_date', startDate);
    if (startTime)    params.set('start_time', startTime);
    if (durationDays) params.set('duration_days', durationDays);
    if (params.toString()) endpoint += '?' + params.toString();

    try {
        const { status, data } = await apiCall(endpoint);
        if (status === 200) {
            allSlots = Array.isArray(data) ? data : (data.slots ?? []);
            // Preserve selection if still available
            const selectedStillAvailable = allSlots.some(
                s => s.id === selectedSlotId && s.current_status?.toLowerCase() !== 'booked'
            );
            if (!selectedStillAvailable) selectedSlotId = null;
            renderSlotCards(allSlots);
        }
    } catch { /* silently ignore refresh errors */ }
}

function initDateTimeListeners() {
    ['start-date', 'start-time', 'duration-days'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', refreshSlotAvailability);
    });
}

/* ----------------------------------------------------------
   Crop Category Toggle (Vegetables / Fruits)
   ---------------------------------------------------------- */
function initCropCategoryToggle() {
    const radios = document.querySelectorAll('input[name="crop_category"]');
    radios.forEach(radio => {
        radio.addEventListener('change', () => {
            const category = radio.value.toLowerCase();
            // Hide all crop grids
            document.querySelectorAll('.crop-chips-grid').forEach(grid => {
                grid.style.opacity = '0';
                setTimeout(() => {
                    grid.style.display = 'none';
                }, 200);
            });
            // Show matching grid
            const targetGrid = document.getElementById(`crops-${category}`)
                            || document.querySelector(`.crop-chips-grid[data-category="${category}"]`);
            if (targetGrid) {
                setTimeout(() => {
                    targetGrid.style.display = 'flex';
                    requestAnimationFrame(() => { targetGrid.style.opacity = '1'; });
                }, 210);
            }
            // Clear crop selection when switching category
            selectedCrop = null;
            document.querySelectorAll('.crop-chip.selected').forEach(c => c.classList.remove('selected'));
        });
    });
}

/* ----------------------------------------------------------
   Crop Chip Selection (only one at a time)
   ---------------------------------------------------------- */
function initCropChipSelection() {
    // Use event delegation on the parent container
    const wrapper = document.querySelector('.crop-selection-wrapper, .crop-section, #crop-section');
    if (!wrapper) {
        // Fallback: direct listeners
        document.querySelectorAll('.crop-chip').forEach(chip => {
            chip.addEventListener('click', handleCropChipClick);
        });
        return;
    }

    wrapper.addEventListener('click', e => {
        const chip = e.target.closest('.crop-chip');
        if (chip) handleCropChipClick.call(chip, e);
    });
}

function handleCropChipClick() {
    document.querySelectorAll('.crop-chip.selected').forEach(c => c.classList.remove('selected'));
    this.classList.add('selected');
    selectedCrop = this.dataset.crop || this.textContent.trim();
}

/* ----------------------------------------------------------
   Booking Form Submission
   ---------------------------------------------------------- */
function initBookingForm() {
    const form = document.getElementById('booking-form');
    if (!form) return;

    form.addEventListener('submit', async e => {
        e.preventDefault();
        await handleBookingSubmit(form);
    });
}

async function handleBookingSubmit(form) {
    const btn = form.querySelector('button[type="submit"]');

    // Collect fields
    const startDate    = document.getElementById('start-date')?.value;
    const startTime    = document.getElementById('start-time')?.value || '08:00';
    const durationDays = parseInt(document.getElementById('duration-days')?.value || '0');
    const quantity     = document.getElementById('quantity')?.value;
    const unit         = document.getElementById('unit')?.value;
    const location     = document.getElementById('location')?.value?.trim();
    const cropCategory = document.querySelector('input[name="crop_category"]:checked')?.value;

    // Client-side validation
    if (!selectedSlotId) {
        showToast('Please select a storage slot.', 'warning');
        document.getElementById('slots-container')?.scrollIntoView({ behavior: 'smooth' });
        return;
    }
    if (!cropCategory) {
        showToast('Please select a crop category (Vegetables / Fruits).', 'warning');
        return;
    }
    if (!selectedCrop) {
        showToast('Please select a crop type.', 'warning');
        return;
    }
    if (!startDate) {
        showToast('Please select a start date.', 'warning');
        return;
    }
    if (!durationDays || durationDays < 1) {
        showToast('Please enter a valid duration (minimum 1 day).', 'warning');
        return;
    }
    if (!quantity || isNaN(parseFloat(quantity)) || parseFloat(quantity) <= 0) {
        showToast('Please enter a valid quantity.', 'warning');
        return;
    }
    if (!unit) {
        showToast('Please select a unit.', 'warning');
        return;
    }

    // Calculate end_date = start_date + duration_days
    const startDateObj = new Date(startDate);
    startDateObj.setDate(startDateObj.getDate() + durationDays);
    const endDate = startDateObj.toISOString().split('T')[0];
    const endTime = startTime;

    const payload = {
        slot_id:       selectedSlotId,
        crop_category: cropCategory,
        crop_type:     selectedCrop,
        quantity:      parseFloat(quantity),
        unit,
        location:      location || '',
        start_date:    startDate,
        start_time:    startTime,
        end_date:      endDate,
        end_time:      endTime
    };

    setButtonLoading(btn, true, 'Booking...');

    try {
        const { status, data } = await apiCall('/api/bookings', 'POST', payload);

        if (status === 201 || status === 200) {
            showToast('Booking created successfully!', 'success');
            openConfirmationModal(data.booking ?? data);
            selectedSlotId = null;
            await Promise.all([loadSlots(), loadMyBookings()]);
        } else if (status === 409) {
            showToast('Sorry, the selected slot is not available right now. Please select another slot.', 'error');
            await loadSlots();
        } else {
            showToast(data.message || 'Booking failed. Please try again.', 'error');
        }
    } catch {
        showToast('Network error while creating booking.', 'error');
    } finally {
        setButtonLoading(btn, false, 'Confirm Booking');
    }
}

/* ----------------------------------------------------------
   Booking Confirmation Modal
   ---------------------------------------------------------- */
function openConfirmationModal(booking) {
    const modal = document.getElementById('confirmation-modal');
    if (!modal) return;

    // Populate modal fields
    const setField = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val ?? '—';
    };

    setField('confirm-booking-id',  booking.booking_id ?? booking.id ?? '—');
    setField('confirm-slot',        booking.slot_name  ?? `Slot ${booking.slot_id ?? '—'}`);
    setField('confirm-crop',        `${booking.crop_type} (${booking.crop_category})`);
    setField('confirm-quantity',    `${booking.quantity} ${booking.unit}`);
    setField('confirm-start',       formatDate(booking.start_date));
    setField('confirm-end',         formatDate(booking.end_date));
    setField('confirm-duration',    booking.duration_days ? `${booking.duration_days} days` : '—');
    setField('confirm-status',      booking.status ?? 'Active');

    // "View Dashboard" button
    const dashBtn = document.getElementById('go-to-dashboard-btn');
    if (dashBtn) {
        const bookingId = booking.booking_id ?? booking.id;
        dashBtn.onclick = () => {
            window.location.href = `dashboard.html?booking=${bookingId}`;
        };
    }

    // Close button
    const closeBtn = modal.querySelector('[data-close-modal="confirmation-modal"]');
    if (closeBtn) {
        closeBtn.onclick = () => {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        };
    }

    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
}

/* ----------------------------------------------------------
   Render My Bookings Table
   ---------------------------------------------------------- */
function renderMyBookings(bookings) {
    const container = document.getElementById('my-bookings-container');
    if (!container) return;

    if (!bookings.length) {
        container.innerHTML = `
        <div class="empty-state-card">
            <div class="empty-state-icon">📦</div>
            <h3>No Bookings Yet</h3>
            <p>You haven't booked any storage slots yet.<br>Fill in the form above to get started!</p>
        </div>`;
        return;
    }

    const rows = bookings.map(b => buildBookingRow(b)).join('');
    container.innerHTML = `
    <div class="table-responsive">
        <table class="bookings-table">
            <thead>
                <tr>
                    <th>Booking ID</th>
                    <th>Slot</th>
                    <th>Crop</th>
                    <th>Start Date</th>
                    <th>End Date</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    </div>`;

    // Attach cancel listeners
    container.querySelectorAll('.btn-cancel-booking').forEach(btn => {
        btn.addEventListener('click', () => openCancelConfirmModal(parseInt(btn.dataset.bookingId)));
    });

    // Attach dashboard view listeners
    container.querySelectorAll('.btn-view-dashboard').forEach(btn => {
        btn.addEventListener('click', () => {
            window.location.href = `dashboard.html?booking=${btn.dataset.bookingId}`;
        });
    });
}

function buildBookingRow(booking) {
    const status      = (booking.status || 'active').toLowerCase();
    const startDate   = booking.start_date ?? '';
    const isActive    = status === 'active';
    const canCancel   = isActive && startDate >= TODAY_STR;

    const statusBadge = `<span class="badge badge-${status}">${capitalise(status)}</span>`;

    let actions = statusBadge;
    if (isActive) {
        actions += `<button class="btn-view-dashboard btn-sm" data-booking-id="${booking.id ?? booking.booking_id}">📊 Dashboard</button>`;
        if (canCancel) {
            actions += `<button class="btn-cancel-booking btn-sm btn-danger" data-booking-id="${booking.id ?? booking.booking_id}">✕ Cancel</button>`;
        }
    }

    return `
    <tr id="booking-row-${booking.id ?? booking.booking_id}">
        <td><code>${booking.booking_id ?? booking.id}</code></td>
        <td>${booking.slot_name ?? `Slot ${booking.slot_id}`}</td>
        <td>${booking.crop_type} <small>(${booking.crop_category})</small></td>
        <td>${formatDate(booking.start_date)}</td>
        <td>${formatDate(booking.end_date)}</td>
        <td>${statusBadge}</td>
        <td class="actions-cell">${actions}</td>
    </tr>`;
}

/* ----------------------------------------------------------
   Cancel Booking Flow
   ---------------------------------------------------------- */
function initCancelConfirmModal() {
    const modal = document.getElementById('cancel-confirm-modal');
    if (!modal) return;

    // "Yes, Cancel" button
    const confirmBtn = document.getElementById('confirm-cancel-btn');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
            if (cancelTargetId == null) return;
            modal.classList.remove('active');
            document.body.style.overflow = '';
            await cancelBooking(cancelTargetId);
            cancelTargetId = null;
        });
    }

    // "No, Go Back" button
    const abortBtn = document.getElementById('abort-cancel-btn');
    if (abortBtn) {
        abortBtn.addEventListener('click', () => {
            modal.classList.remove('active');
            document.body.style.overflow = '';
            cancelTargetId = null;
        });
    }

    // Backdrop
    modal.addEventListener('click', e => {
        if (e.target === modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
            cancelTargetId = null;
        }
    });
}

function openCancelConfirmModal(bookingId) {
    cancelTargetId = bookingId;
    const modal = document.getElementById('cancel-confirm-modal');
    if (!modal) {
        // Fallback if modal doesn't exist in HTML
        if (window.confirm('Are you sure you want to cancel this booking?')) {
            cancelBooking(bookingId);
        }
        return;
    }
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

async function cancelBooking(bookingId) {
    try {
        const { status, data } = await apiCall(`/api/bookings/${bookingId}/cancel`, 'DELETE');
        if (status === 200) {
            showToast('Booking cancelled successfully.', 'success');
            await Promise.all([loadSlots(), loadMyBookings()]);
        } else {
            showToast(data.message || 'Failed to cancel booking.', 'error');
        }
    } catch {
        showToast('Network error while cancelling booking.', 'error');
    }
}

/* ----------------------------------------------------------
   Helpers
   ---------------------------------------------------------- */
function capitalise(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

function setButtonLoading(btn, loading, loadingText = 'Loading...') {
    if (!btn) return;
    if (loading) {
        btn.disabled = true;
        btn.dataset.originalText = btn.innerHTML;
        btn.innerHTML = `<span class="spinner"></span> ${loadingText}`;
    } else {
        btn.disabled = false;
        btn.innerHTML = btn.dataset.originalText || 'Submit';
    }
}

/* ============================================================
   PATCH v2 — Fix ID mismatches and expose global functions
   ============================================================ */

// prefillUserInfo: fills BOTH the visible cust-name and the hidden booking-name
const _origPrefill = prefillUserInfo;
function prefillUserInfo(user) {
    // Visible read-only display fields
    const custNameEl  = document.getElementById('cust-name');
    const custPhoneEl = document.getElementById('cust-phone');
    if (custNameEl)  { custNameEl.value  = user.name  || ''; custNameEl.readOnly  = true; }
    if (custPhoneEl) { custPhoneEl.value = user.phone || ''; custPhoneEl.readOnly = true; }
    // Hidden alias inputs (used by old booking.js logic)
    const hidNameEl  = document.getElementById('booking-name');
    const hidPhoneEl = document.getElementById('booking-phone');
    if (hidNameEl)  hidNameEl.value  = user.name  || '';
    if (hidPhoneEl) hidPhoneEl.value = user.phone || '';
    // Nav username display
    const navEl = document.getElementById('nav-username');
    if (navEl) navEl.textContent = user.name || 'User';
}

// renderSlotCards fallback: also try slots-grid and slots-container
const _origRender = renderSlotCards;
function renderSlotCards(slots) {
    const container =
        document.getElementById('slots-container') ||
        document.getElementById('slots-grid');
    if (!container) return;

    if (!slots || !slots.length) {
        container.innerHTML = `
          <div class="empty-state" style="padding:2rem;text-align:center;color:var(--text-muted);">
            <div style="font-size:3rem;margin-bottom:0.5rem;">📦</div>
            <h3>No slots available</h3>
            <p>Could not load slot data from server.</p>
          </div>`;
        return;
    }

    container.innerHTML = slots.map(slot => buildSlotCard(slot)).join('');
    container.querySelectorAll('.btn-select-slot').forEach(btn => {
        btn.addEventListener('click', () => handleSlotSelect(parseInt(btn.dataset.slotId)));
    });
}

// loadSlots falls back to also call renderSlotCards with correct container
async function loadSlots() {
    const container =
        document.getElementById('slots-container') ||
        document.getElementById('slots-grid');
    if (container) {
        container.innerHTML = `
          <div style="text-align:center;padding:2rem;color:var(--text-muted);">
            <div class="spinner spinner-dark" style="margin:0 auto 0.75rem;"></div>
            Loading slots…
          </div>`;
    }
    try {
        const r = await fetch((window.SMARTHARVEST_API_BASE || '') + '/api/slots/', {
            credentials: 'include'
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        allSlots = data.data?.slots ?? data.slots ?? (Array.isArray(data) ? data : []);
        renderSlotCards(allSlots);
    } catch (err) {
        console.error('loadSlots error:', err);
        if (container) {
            container.innerHTML = `
              <div class="empty-state" style="padding:2rem;text-align:center;color:var(--text-muted);">
                <div style="font-size:2.5rem;">⚠️</div>
                <h3>Backend not reachable</h3>
                <p>Deploy the Flask backend on Render and update <code>config.js</code>.</p>
              </div>`;
        }
    }
}

// Expose refreshSlots globally (called by onclick="refreshSlots()" in HTML)
function refreshSlots() {
    const btn = document.getElementById('refresh-slots-btn');
    if (btn) { btn.classList.add('spinning'); setTimeout(() => btn.classList.remove('spinning'), 600); }
    loadSlots();
}

// duration-days field alias (HTML uses id="duration-days")
function initDateTimeListeners() {
    ['start-date', 'start-time', 'duration-days', 'duration'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => {
            // Update end-date hint
            const sd = document.getElementById('start-date')?.value;
            const dur = parseInt(
                document.getElementById('duration-days')?.value ||
                document.getElementById('duration')?.value || '0'
            );
            const hint = document.getElementById('end-date-hint');
            if (sd && dur > 0 && hint) {
                const end = new Date(sd);
                end.setDate(end.getDate() + dur);
                hint.textContent = `Storage ends: ${end.toDateString()}`;
            }
            refreshSlotAvailability();
        });
    });
}

// location field: HTML uses id="location" or id="cust-location"
// Patch the booking form submit to read from either
const _origInit = initBookingForm;
function initBookingForm() {
    const form = document.getElementById('booking-form');
    if (!form) return;

    form.addEventListener('submit', async e => {
        e.preventDefault();

        const slot_id        = selectedSlotId;
        const crop_category  = document.querySelector('input[name="crop-category"]:checked')?.value;
        const crop_type      = selectedCrop;
        const quantity       = parseFloat(
            document.getElementById('quantity')?.value || '0');
        const unit           = document.getElementById('unit')?.value || 'Kg';
        const location       = (
            document.getElementById('location')?.value ||
            document.getElementById('cust-location')?.value || ''
        ).trim();
        const start_date     = document.getElementById('start-date')?.value;
        const start_time     = document.getElementById('start-time')?.value || '09:00';
        const duration       = parseInt(
            document.getElementById('duration-days')?.value ||
            document.getElementById('duration')?.value || '0');

        // Validation
        const errEl = document.getElementById('booking-error');
        const setErr = (msg) => {
            if (errEl) { errEl.querySelector('span') ? errEl.querySelector('span').textContent = msg : errEl.textContent = msg; errEl.style.display = 'flex'; }
            showToast(msg, 'error');
        };

        if (!slot_id)       return setErr('Please select a storage slot.');
        if (!crop_category) return setErr('Please select a crop category (Vegetables or Fruits).');
        if (!crop_type)     return setErr('Please select a specific crop.');
        if (!quantity || quantity <= 0) return setErr('Please enter a valid quantity.');
        if (!location)      return setErr('Please enter your location.');
        if (!start_date)    return setErr('Please select a storage date.');
        if (!duration || duration <= 0) return setErr('Please enter storage duration (days).');

        const end = new Date(start_date);
        end.setDate(end.getDate() + duration);
        const end_date = end.toISOString().split('T')[0];
        const end_time = start_time;

        const btn = form.querySelector('button[type="submit"]');
        if (btn) { btn.disabled = true; btn._html = btn.innerHTML; btn.innerHTML = '<span style="display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,0.35);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;vertical-align:middle;margin-right:6px;"></span>Confirming…'; }

        try {
            const r = await fetch((window.SMARTHARVEST_API_BASE || '') + '/api/bookings/', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slot_id, crop_category, crop_type, quantity, unit, location, start_date, start_time, end_date, end_time })
            });
            const data = await r.json().catch(() => ({}));

            if (r.ok) {
                const booking = data.data?.booking ?? data.booking ?? data;
                showBookingConfirmation(booking);
                showToast('Booking confirmed!', 'success');
                await Promise.all([loadSlots(), loadMyBookings()]);
            } else if (r.status === 409) {
                setErr('Sorry, the selected slot is not available right now. Please select another slot.');
                await loadSlots();
            } else {
                setErr(data.error || data.message || 'Booking failed. Please try again.');
            }
        } catch {
            setErr('Network error — backend is not reachable.');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = btn._html || 'Confirm Booking'; }
        }
    });
}

function showBookingConfirmation(booking) {
    // Populate confirmation modal
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '—'; };
    set('confirm-booking-id', `BK-${booking.id || '???'}`);
    set('confirm-slot',       booking.slot_name || `Slot ${booking.slot_id}`);
    set('confirm-crop',       `${booking.crop_type} (${booking.crop_category})`);
    set('confirm-qty',        `${booking.quantity} ${booking.unit || ''}`);
    set('confirm-start',      booking.start_date);
    set('confirm-end',        booking.end_date);
    set('confirm-duration',   booking.duration_days ? `${booking.duration_days} days` : '—');
    set('confirm-location',   booking.location);

    // Dashboard button
    const dashBtn = document.getElementById('view-dashboard-btn') ||
                    document.getElementById('go-to-dashboard-btn');
    if (dashBtn) {
        dashBtn.onclick = () => { window.location.href = `dashboard.html?booking=${booking.id}`; };
        dashBtn.style.display = '';
    }

    // Open the modal
    const modal = document.getElementById('confirm-modal') ||
                  document.getElementById('confirmation-modal');
    if (modal) {
        // Handle both modal systems
        if (typeof openModal === 'function') openModal(modal.id);
        else { modal.classList.add('open', 'active'); }
    }
}

// logout exposed globally for navbar button
async function logout() {
    try {
        await fetch((window.SMARTHARVEST_API_BASE || '') + '/auth/logout', {
            method: 'POST', credentials: 'include'
        });
    } catch {}
    window.location.href = 'index.html';
}
