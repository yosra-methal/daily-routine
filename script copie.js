const CONFIG = {
    slotHeight: 60, // pixels per hour
    defaultStart: 8,
    defaultEnd: 18,
    colors: [
        { id: 'blue', bg: '#E1F5FE', border: '#0288D1' },
        { id: 'green', bg: '#E8F5E9', border: '#388E3C' },
        { id: 'rose', bg: '#FCE4EC', border: '#D81B60' },
        { id: 'purple', bg: '#F3E5F5', border: '#7B1FA2' },
        { id: 'orange', bg: '#FFF0EB', border: '#FF8B66' },
        { id: 'grey', bg: '#F5F5F5', border: '#616161' }
    ]
};

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// State
let state = {
    events: [],
    use24h: true,
    viewStart: 8,
    viewEnd: 18
};

// DOM Elements
const elements = {
    timeColumn: document.getElementById('time-column'),
    daysGrid: document.getElementById('days-grid'),
    modal: document.getElementById('event-modal'),
    modalTitle: document.getElementById('modal-title'),
    form: {
        title: document.getElementById('event-title'),
        day: document.getElementById('event-day'),
        // Start/End are now handled via specific H/M inputs, 
        // but we might still use hidden inputs for state transfer
        start: document.getElementById('event-start'),
        end: document.getElementById('event-end'),
        colorContainer: document.getElementById('color-options')
    },
    btns: {
        save: document.getElementById('save-btn'),
        cancel: document.getElementById('cancel-btn'),
        delete: document.getElementById('delete-btn'),
        close: document.getElementById('close-modal'),
        add: document.getElementById('add-event-btn')
    },
    toggle: document.getElementById('time-format-toggle')
};

let currentEditingId = null;
let selectedColor = CONFIG.colors[0].id;

// Initialization
function init() {
    loadData();
    renderColorOptions();
    calculateViewRange();
    renderGrid();
    setupEventListeners();

    // Set toggle state
    elements.toggle.checked = !state.use24h;
}

function loadData() {
    const data = localStorage.getItem('weeklyPlannerData');
    if (data) {
        state.events = JSON.parse(data);
    }
    const pref = localStorage.getItem('weeklyPlannerPrefs');
    if (pref) {
        const p = JSON.parse(pref);
        state.use24h = p.use24h;
    }
}

function saveData() {
    localStorage.setItem('weeklyPlannerData', JSON.stringify(state.events));
    localStorage.setItem('weeklyPlannerPrefs', JSON.stringify({ use24h: state.use24h }));
    calculateViewRange();
    renderGrid();
}

// Logic: Time Range Calculation
function calculateViewRange() {
    let min = CONFIG.defaultStart;
    let max = CONFIG.defaultEnd;

    if (state.events.length > 0) {
        state.events.forEach(ev => {
            if (!ev.start || !ev.end) return;
            const startH = getDecimalHour(ev.start);
            let endH = getDecimalHour(ev.end);

            // Handle midnight end (00:00 -> 24.0)
            if (endH === 0 && startH > 0) endH = 24.0;
            // Handle midnight start (00:00 -> 0.0) - already handled by split

            if (!isNaN(startH) && startH < min) min = Math.floor(startH);
            if (!isNaN(endH) && endH > max) max = Math.ceil(endH);
        });
    }

    state.viewStart = min;
    state.viewEnd = max;
}

function renderGrid() {
    // Clear existing
    elements.timeColumn.innerHTML = '';
    elements.daysGrid.innerHTML = '';

    // Corner Spacer
    const cornerSpacer = document.createElement('div');
    cornerSpacer.className = 'time-corner-spacer';
    elements.timeColumn.appendChild(cornerSpacer);

    // Render Time Column Labels
    // Range: viewStart to viewEnd
    for (let h = state.viewStart; h <= state.viewEnd; h++) {
        const timeDiv = document.createElement('div');
        timeDiv.className = 'time-slot';
        // Mark the very last label so it doesn't add height if we want flush bottom
        if (h === state.viewEnd) timeDiv.classList.add('last-slot');
        timeDiv.textContent = formatTimeDisplay(h);
        elements.timeColumn.appendChild(timeDiv);
    }

    // Render Days Columns
    const totalHours = state.viewEnd - state.viewStart;

    DAYS.forEach((dayName, dayIndex) => {
        const col = document.createElement('div');
        col.className = 'day-column';

        // Header
        const header = document.createElement('div');
        header.className = 'day-header';
        header.textContent = dayName;
        col.appendChild(header);

        // Body container
        const body = document.createElement('div');
        body.className = 'day-body';
        body.dataset.dayIndex = dayIndex;
        // Don't fix height, let content define it

        // Render Physical Cells (Rows)
        for (let i = 0; i < totalHours; i++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            body.appendChild(cell);
        }

        // Click handler for creating events
        body.addEventListener('click', (e) => handleGridClick(e, dayIndex));

        // Render Events
        const dayEvents = state.events.filter(e => e.day == dayIndex);
        dayEvents.forEach(ev => {
            const evEl = createEventElement(ev);
            body.appendChild(evEl);
        });

        col.appendChild(body);
        elements.daysGrid.appendChild(col);
    });
}

function createEventElement(ev) {
    const el = document.createElement('div');
    el.className = `event-card ${ev.color}`;

    const startH = getDecimalHour(ev.start);
    let endH = getDecimalHour(ev.end);
    if (endH === 0 && startH > 0) endH = 24;

    const duration = endH - startH;

    // Top relative to viewStart
    const top = (startH - state.viewStart) * CONFIG.slotHeight;
    const height = duration * CONFIG.slotHeight;

    el.style.top = `${top}px`;
    el.style.height = `${height}px`;
    // Stacking: Later events on top
    el.style.zIndex = Math.floor(startH * 60);

    // Content
    el.innerHTML = `
        <strong>${ev.title || 'Untitled'}</strong>
        <span style="font-weight: 400; font-size: 11px; margin-top: 2px;">
            ${formatTimeRange(ev.start, ev.end)}
        </span>
    `;

    el.addEventListener('click', (e) => {
        e.stopPropagation();
        openModal(ev);
    });

    return el;
}

// Helpers
function getDecimalHour(timeStr) {
    // Normalize to 24h if AM/PM is present (unlikely with type=time but safe)
    let str = timeStr.trim().toLowerCase();
    const isPM = str.includes('pm');
    const isAM = str.includes('am');

    // Remove suffixes
    str = str.replace(/(am|pm)/g, '').trim();

    const [hStr, mStr] = str.split(':');
    let h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);

    if (isNaN(h) || isNaN(m)) return 0;

    // 12h conversion if detected
    if (isPM && h < 12) h += 12;
    if (isAM && h === 12) h = 0;
    // Note: If no suffix, assume 24h standard (e.g. "13:00", "00:00")

    return h + m / 60;
}

function formatTimeDisplay(hour) {
    // Check if hour is integer
    const h = Math.floor(hour);
    const m = Math.round((hour - h) * 60);
    const mStr = m < 10 ? '0' + m : m;

    if (state.use24h) {
        // Handle 24 as 00:00 or keep 24:00? 
        // User requested support for 00:00. 
        // But if it's the end of the day, 00:00 is fine.
        const displayH = h === 24 ? '00' : h < 10 ? '0' + h : h;
        return `${displayH}:${mStr}`;
    } else {
        // 12h Format
        // 0 -> 12 AM, 12 -> 12 PM, 24 -> 12 AM
        const effectiveH = h % 24;
        const suffix = effectiveH >= 12 ? 'PM' : 'AM';
        const h12 = effectiveH % 12 || 12;
        return `${h12}:${mStr} ${suffix}`;
    }
}

function formatTimeString(timeStr) {
    if (state.use24h) return timeStr;
    const [h, m] = timeStr.split(':').map(Number);
    const suffix = h >= 12 && h < 24 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    const mStr = m < 10 ? '0' + m : m;
    return `${h12}:${mStr} ${suffix}`;
}

function formatTimeRange(start, end) {
    return `${formatTimeString(start)} - ${formatTimeString(end)}`;
}

// Modal handling
function renderColorOptions() {
    elements.form.colorContainer.innerHTML = '';
    CONFIG.colors.forEach(c => {
        const d = document.createElement('div');
        d.className = 'color-option';
        d.style.backgroundColor = c.bg;
        d.style.setProperty('--glow-color', c.border);
        d.dataset.id = c.id;
        if (c.id === selectedColor) d.classList.add('selected');

        d.addEventListener('click', () => {
            document.querySelectorAll('.color-option').forEach(el => el.classList.remove('selected'));
            d.classList.add('selected');
            selectedColor = c.id;
        });

        elements.form.colorContainer.appendChild(d);
    });
}

// Unified Input Logic
function updateInputMode() {
    const is24 = state.use24h;

    // Toggle AM/PM visibility
    document.getElementById('start-ampm').classList.toggle('hidden', is24);
    document.getElementById('end-ampm').classList.toggle('hidden', is24);

    // Update constraints
    const maxHour = is24 ? 23 : 12;
    const minHour = is24 ? 0 : 1;

    ['start', 'end'].forEach(prefix => {
        const hInput = document.getElementById(`${prefix}-h`);
        if (hInput) {
            hInput.setAttribute('max', maxHour);
            hInput.setAttribute('min', minHour);
        }
    });
}

function setTimeInputs(startStr, endStr) {
    // startStr/endStr are always 24h "HH:mm" from internal data
    const parse = (str) => {
        let [h, m] = str.split(':').map(Number);

        if (state.use24h) {
            return { h, m, suffix: null };
        } else {
            const suffix = h >= 12 ? 'PM' : 'AM';
            h = h % 12 || 12;
            return { h, m, suffix };
        }
    };

    const s = parse(startStr);
    document.getElementById('start-h').value = s.h.toString().padStart(2, '0');
    document.getElementById('start-m').value = s.m.toString().padStart(2, '0');
    if (s.suffix) document.getElementById('start-ampm').value = s.suffix;

    const e = parse(endStr);
    document.getElementById('end-h').value = e.h.toString().padStart(2, '0');
    document.getElementById('end-m').value = e.m.toString().padStart(2, '0');
    if (e.suffix) document.getElementById('end-ampm').value = e.suffix;
}

function getTimeInputValues() {
    const get24 = (prefix) => {
        let h = parseInt(document.getElementById(`${prefix}-h`).value, 10);
        const m = parseInt(document.getElementById(`${prefix}-m`).value, 10);

        if (isNaN(h) || isNaN(m)) return '';

        if (!state.use24h) {
            const suffix = document.getElementById(`${prefix}-ampm`).value;
            if (suffix === 'PM' && h < 12) h += 12;
            if (suffix === 'AM' && h === 12) h = 0;
        }

        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    };

    return {
        start: get24('start'),
        end: get24('end')
    };
}

function openModal(existingEvent = null) {
    elements.modal.classList.remove('hidden');
    setTimeout(() => elements.modal.classList.add('visible'), 10);

    updateInputMode();

    let startVal = '09:00';
    let endVal = '10:00';
    let dayVal = '0';
    let titleVal = '';

    if (existingEvent) {
        currentEditingId = existingEvent.id;
        elements.modalTitle.textContent = 'Edit Entry';
        titleVal = existingEvent.title;
        dayVal = existingEvent.day;
        startVal = existingEvent.start;
        endVal = existingEvent.end;
        selectedColor = existingEvent.color;
        elements.btns.delete.classList.remove('hidden');
    } else {
        currentEditingId = null;
        elements.modalTitle.textContent = 'New Entry';
        selectedColor = CONFIG.colors[0].id;
        elements.btns.delete.classList.add('hidden');

        // Use hidden inputs as transfer state from grid clicks
        const hideStart = document.getElementById('event-start');
        const hideEnd = document.getElementById('event-end');
        if (hideStart && hideStart.value) startVal = hideStart.value;
        if (hideEnd && hideEnd.value) endVal = hideEnd.value;
        if (elements.form.day.value) dayVal = elements.form.day.value;
    }

    elements.form.title.value = titleVal;
    elements.form.day.value = dayVal;

    setTimeInputs(startVal, endVal);

    // Update color selection UI
    document.querySelectorAll('.color-option').forEach(el => {
        el.classList.toggle('selected', el.dataset.id === selectedColor);
    });
}

function closeModal() {
    elements.modal.classList.remove('visible');
    setTimeout(() => elements.modal.classList.add('hidden'), 200);
    // Clear transfer state
    const hideStart = document.getElementById('event-start');
    const hideEnd = document.getElementById('event-end');
    if (hideStart) hideStart.value = '';
    if (hideEnd) hideEnd.value = '';

    // Clear validation errors
    document.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
}

function handleGridClick(e, dayIndex) {
    if (e.target.classList.contains('event-card')) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const clickedH = state.viewStart + (offsetY / CONFIG.slotHeight);

    const h = Math.floor(clickedH);
    const m = Math.floor((clickedH - h) * 60);
    const mRounded = m < 30 ? 0 : 30;

    const startStr = `${h.toString().padStart(2, '0')}:${mRounded.toString().padStart(2, '0')}`;
    const endH = h + 1;
    const endStr = `${endH.toString().padStart(2, '0')}:${mRounded.toString().padStart(2, '0')}`;

    // Set transfer state
    const hideStart = document.getElementById('event-start');
    const hideEnd = document.getElementById('event-end');
    if (hideStart) hideStart.value = startStr;
    if (hideEnd) hideEnd.value = endStr;

    elements.form.day.value = dayIndex;

    openModal();
}

function setupEventListeners() {
    // Clear errors on interaction
    const timeInputs = [
        'start-h', 'start-m', 'start-ampm',
        'end-h', 'end-m', 'end-ampm'
    ];
    timeInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => {
                el.classList.remove('input-error');
                const errMsg = document.getElementById('time-error-msg');
                if (errMsg) errMsg.classList.add('hidden');
            });
            el.addEventListener('focus', () => {
                el.classList.remove('input-error');
                const errMsg = document.getElementById('time-error-msg');
                if (errMsg) errMsg.classList.add('hidden');
            });
        }
    });

    elements.btns.cancel.addEventListener('click', closeModal);
    elements.btns.close.addEventListener('click', closeModal);
    elements.btns.add.addEventListener('click', () => {
        elements.form.day.value = '0';
        openModal();
    });

    elements.btns.save.addEventListener('click', () => {
        const title = elements.form.title.value;
        const day = parseInt(elements.form.day.value);

        const times = getTimeInputValues();
        const start = times.start;
        const end = times.end;
        const color = selectedColor;

        if (!start || !end) return;

        // Validation: End > Start
        const startH = getDecimalHour(start);
        let endH = getDecimalHour(end);

        // Handle midnight end
        if (endH === 0 && startH > 0) {
            endH = 24;
        }

        // Silent Validation (Red Borders) - Only on Save
        if (endH <= startH) {
            // Highlight End Time Inputs
            ['end-h', 'end-m', 'end-ampm'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.add('input-error');
            });

            // Show error message
            const errMsg = document.getElementById('time-error-msg');
            if (errMsg) errMsg.classList.remove('hidden');

            return; // Stop save
        }

        // Clear any residual errors
        document.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));

        if (currentEditingId) {
            // Update
            const idx = state.events.findIndex(e => e.id === currentEditingId);
            if (idx !== -1) {
                state.events[idx] = { ...state.events[idx], title, day, start, end, color };
            }
        } else {
            // Create
            const newEvent = {
                id: Date.now().toString(),
                title, day, start, end, color
            };
            state.events.push(newEvent);
        }

        saveData();
        closeModal();
    });

    elements.btns.delete.addEventListener('click', () => {
        if (!currentEditingId) return;
        // Direct delete for Notion compatibility
        state.events = state.events.filter(e => e.id !== currentEditingId);
        saveData();
        closeModal();
    });

    elements.toggle.addEventListener('change', (e) => {
        // Capture current values before switching
        let currentStart = '09:00';
        let currentEnd = '10:00';

        if (elements.modal.classList.contains('visible')) {
            const t = getTimeInputValues();
            if (t.start && t.end) {
                currentStart = t.start;
                currentEnd = t.end;
            }
        }

        state.use24h = !e.target.checked;
        saveData();

        if (elements.modal.classList.contains('visible')) {
            updateInputMode();
            setTimeInputs(currentStart, currentEnd);
        }
    });
}

// Run
init();
