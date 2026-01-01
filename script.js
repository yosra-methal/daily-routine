const CONFIG = {
    slotHeight: 60, // pixels per hour
    defaultStart: 6, // Morning starts early
    defaultEnd: 23,
    colors: [
        { id: 'blue', bg: '#E1F5FE', border: '#0288D1' },
        { id: 'green', bg: '#E8F5E9', border: '#388E3C' },
        { id: 'rose', bg: '#FCE4EC', border: '#D81B60' },
        { id: 'purple', bg: '#F3E5F5', border: '#7B1FA2' },
        { id: 'orange', bg: '#FFF0EB', border: '#FF8B66' },
        { id: 'grey', bg: '#F5F5F5', border: '#616161' }
    ]
};

// Start times for zones (24h)
const ZONES = [
    { label: 'Morning', start: 5, end: 12, class: 'zone-morning' },
    { label: 'Afternoon', start: 12, end: 18, class: 'zone-afternoon' },
    { label: 'Evening', start: 18, end: 24, class: 'zone-evening' }
];

// State
let state = {
    events: [],
    use24h: true,
    viewStart: 6,
    viewEnd: 23
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
    const data = localStorage.getItem('dailyRoutineData');
    if (data) {
        state.events = JSON.parse(data);
    } else {
        // Try importing from weekly planner if exists
        const oldData = localStorage.getItem('weeklyPlannerData');
        if (oldData) {
            // Migrate: Flatten all events to day 0
            const evs = JSON.parse(oldData);
            state.events = evs.map(e => ({ ...e, day: 0 }));
            // Maybe clear old data? Better keep it safe.
        }
    }

    // Normalize all events to Day 0
    state.events.forEach(e => e.day = 0);

    const pref = localStorage.getItem('dailyRoutinePrefs');
    if (pref) {
        const p = JSON.parse(pref);
        state.use24h = p.use24h;
    }
}

function saveData() {
    localStorage.setItem('dailyRoutineData', JSON.stringify(state.events));
    localStorage.setItem('dailyRoutinePrefs', JSON.stringify({ use24h: state.use24h }));
    calculateViewRange();
    renderGrid();
}

function calculateViewRange() {
    let min = CONFIG.defaultStart;
    let max = CONFIG.defaultEnd;

    // Expand view to fit all events
    if (state.events.length > 0) {
        state.events.forEach(ev => {
            const startH = getDecimalHour(ev.start);
            let endH = getDecimalHour(ev.end);
            if (endH === 0 && startH > 0) endH = 24.0;

            if (!isNaN(startH) && startH < min) min = Math.floor(startH);
            if (!isNaN(endH) && endH > max) max = Math.ceil(endH);
        });
    }

    // Ensure zones are covered
    min = Math.min(min, 5); // Start at least at 5am for Morning zone context
    max = Math.max(max, 22);

    state.viewStart = min;
    state.viewEnd = max;
}

function renderGrid() {
    elements.timeColumn.innerHTML = '';
    elements.daysGrid.innerHTML = '';

    // Render Time Column
    for (let h = state.viewStart; h <= state.viewEnd; h++) {
        const timeDiv = document.createElement('div');
        timeDiv.className = 'time-slot';
        if (h === state.viewEnd) timeDiv.classList.add('last-slot');
        timeDiv.textContent = formatTimeDisplay(h);
        elements.timeColumn.appendChild(timeDiv);
    }

    // Render Single Day Column
    const col = document.createElement('div');
    col.className = 'day-column';

    const body = document.createElement('div');
    body.className = 'day-body';
    body.dataset.dayIndex = 0;

    // Render Zones
    ZONES.forEach(zone => {
        // Calculate overlap with view
        const zoneStart = Math.max(zone.start, state.viewStart);
        const zoneEnd = Math.min(zone.end, state.viewEnd);

        if (zoneEnd > zoneStart) {
            const zDiv = document.createElement('div');
            zDiv.className = `day-zone ${zone.class}`;
            const top = (zoneStart - state.viewStart) * CONFIG.slotHeight;
            const height = (zoneEnd - zoneStart) * CONFIG.slotHeight;
            zDiv.style.top = `${top}px`;
            zDiv.style.height = `${height}px`;

            const label = document.createElement('span');
            label.className = 'zone-label';
            label.textContent = zone.label;
            zDiv.appendChild(label);

            body.appendChild(zDiv);
        }
    });

    // Render Grid Cells (for lines)
    const totalHours = state.viewEnd - state.viewStart;
    for (let i = 0; i < totalHours; i++) {
        const cell = document.createElement('div');
        cell.className = 'grid-cell';
        body.appendChild(cell);
    }

    body.addEventListener('click', (e) => handleGridClick(e, 0));

    // Render Events with Smart Positioning
    const positionedEvents = calculateEventPositions(state.events);

    positionedEvents.forEach(evObj => {
        const evEl = createEventElement(evObj.event, evObj.style);
        body.appendChild(evEl);
    });

    col.appendChild(body);
    elements.daysGrid.appendChild(col);

    // Scroll to start time (e.g. 8am) if possible
    /* setTimeout(() => {
        const scrollStart = (8 - state.viewStart) * CONFIG.slotHeight;
        if(scrollStart > 0) document.querySelector('.planner-wrapper').scrollTop = scrollStart;
    }, 100); */
}

// Overlap Calculation Algorithm
function calculateEventPositions(events) {
    // 1. Convert times to decimals and sort
    let sorted = events.map(e => {
        const start = getDecimalHour(e.start);
        let end = getDecimalHour(e.end);
        if (end === 0 && start > 0) end = 24;
        return {
            event: e,
            start,
            end,
            duration: end - start
        };
    }).sort((a, b) => {
        if (a.start !== b.start) return a.start - b.start;
        return b.duration - a.duration; // Longest first
    });

    // 2. Pack events into columns
    // Use a simple greedy coloring algorithm for columns
    let columns = [];

    sorted.forEach(item => {
        let placed = false;
        // Try to place in existing columns
        for (let i = 0; i < columns.length; i++) {
            const col = columns[i];
            const lastEvent = col[col.length - 1];
            // If this event starts after the last event in this column ends, put it here
            if (item.start >= lastEvent.end - 0.01) { // Small epsilon
                col.push(item);
                item.colIndex = i;
                placed = true;
                break;
            }
        }
        // If not placed, create new column
        if (!placed) {
            columns.push([item]);
            item.colIndex = columns.length - 1;
        }
    });

    // 3. Expand widths
    // This is a naive "waterfall" layout. A better one is "clusters".
    // Let's group colliding events into clusters.

    // Re-approach:
    // Identify clusters of overlapping events.
    // For each cluster, width = 1/max_concurrency
    // This is complicated. Let's use the "columns" method but visual adjustment.

    // Simpler: Just use the columns approach.
    // Width = 100% / columns.length ? No, that shrinks everything if one overlap exists elsewhere.

    // Grouping Approach:
    // Iterate events. If overlaps with current group, add to group. Else close group.

    let processedEvents = [];
    // Reset sorted for fresh iteration
    // sorted already has decimal start/end

    // We will assume 'columns' approach provided a decent distribution (like Outlook).
    // Now we need to determine the width of each event based on its column and how many columns exist *at that time*.

    sorted.forEach(item => {
        // Find how many columns exist during this event's timespan
        let collisions = 0;
        // Check all other events to see max column index active during this time
        // Actually, just find the max ColIndex of any event that overlaps with 'item'

        let overlappingGroup = sorted.filter(other =>
            !(other.end <= item.start || other.start >= item.end)
        );

        // The width must be shared among the max number of overlapping columns
        // Max ColIndex + 1 tells us how many columns are needed for this specific cluster?
        // Not exactly.

        // Let's simplify: Standard "Calendar" layout logic
        // width = 1 / (max concurrent columns in this cluster)
        // left = colIndex * width

        // Find the "Overlap Group" (connected component)
        // This is complex for a simple widget.

        // Fallback: 
        // 1. Calculate max overlaps for this specific event
        // 2. Adjust width.

        // Even simpler:
        // Use the columns generated earlier.
        // width = 100% / columns.length? No.

        // Let's just divide by the total number of columns detected in step 2?
        // That makes everything thin if there's one complex overlap.

        // Compromise: Overlapping events split width. 
        // If A overlaps B, share width. 
        // Using existing 'item.colIndex' from the Greedy Column Packing.

        // We need to know, for each event, what is the Maximum ColIndex that it overlaps with?

        // Let W = 1 / (MaxColIndex + 1) of the group.

        // Scan for the max colIndex in the local group of overlaps
        let maxCol = 0;
        overlappingGroup.forEach(o => {
            if (o.colIndex > maxCol) maxCol = o.colIndex;
        });

        const widthPercent = 100 / (maxCol + 1);
        const leftPercent = item.colIndex * widthPercent;

        processedEvents.push({
            event: item.event,
            style: {
                top: (item.start - state.viewStart) * CONFIG.slotHeight,
                height: item.duration * CONFIG.slotHeight,
                left: leftPercent + '%',
                width: widthPercent + '%'
            }
        });
    });

    return processedEvents;
}


function createEventElement(ev, styles) {
    const el = document.createElement('div');
    el.className = `event-card ${ev.color}`;

    el.style.top = `${styles.top}px`;
    el.style.height = `${styles.height}px`;
    el.style.left = styles.left;
    el.style.width = `calc(${styles.width} - 8px)`; // Gap
    el.style.zIndex = 10 + Math.floor(styles.top); // Base Z + time

    // Compact mode if height is small (< 40px)
    if (parseFloat(styles.height) < 40) el.classList.add('compact');

    el.innerHTML = `
        <strong>${ev.title || 'Untitled'}</strong>
        <span>${formatTimeRange(ev.start, ev.end)}</span>
    `;

    el.addEventListener('click', (e) => {
        e.stopPropagation();
        openModal(ev);
    });

    return el;
}


function getDecimalHour(timeStr) {
    if (!timeStr) return 0;
    let str = timeStr.trim().toLowerCase();
    const isPM = str.includes('pm');
    const isAM = str.includes('am');
    str = str.replace(/(am|pm)/g, '').trim();
    const [hStr, mStr] = str.split(':');
    let h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    if (isNaN(h) || isNaN(m)) return 0;
    if (isPM && h < 12) h += 12;
    if (isAM && h === 12) h = 0;
    return h + m / 60;
}

function formatTimeDisplay(hour) {
    const h = Math.floor(hour);
    const m = Math.round((hour - h) * 60);
    const mStr = m < 10 ? '0' + m : m;

    if (state.use24h) {
        const displayH = h === 24 || h === 0 ? '00' : h < 10 ? '0' + h : h;
        return `${displayH}:${mStr}`;
    } else {
        const effectiveH = h % 24;
        const suffix = effectiveH >= 12 ? 'PM' : 'AM';
        const h12 = effectiveH % 12 || 12; // 0 -> 12
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


// UI Interaction
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

function updateInputMode() {
    const is24 = state.use24h;
    document.getElementById('start-ampm').classList.toggle('hidden', is24);
    document.getElementById('end-ampm').classList.toggle('hidden', is24);

    // Update constraints for Hour inputs
    const maxHour = is24 ? 23 : 12;
    const minHour = is24 ? 0 : 1;

    ['start-h', 'end-h'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.setAttribute('min', minHour);
            el.setAttribute('max', maxHour);
            // Also enforce on input to prevent manual typing of invalid numbers
            el.oninput = function () {
                let v = parseInt(this.value);
                if (!isNaN(v)) {
                    if (v > maxHour) this.value = maxHour;
                    // Note: don't enforce min strictly on typing as user might type '1' then '2' or backspace
                }
            };
        }
    });
}

function setTimeInputs(startStr, endStr) {
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
        if (isNaN(h)) h = 0;
        if (isNaN(m)) m = 0;

        if (!state.use24h) {
            const suffix = document.getElementById(`${prefix}-ampm`).value;
            if (suffix === 'PM' && h < 12) h += 12;
            if (suffix === 'AM' && h === 12) h = 0;
        }
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    };
    return { start: get24('start'), end: get24('end') };
}

function openModal(existingEvent = null) {
    elements.modal.classList.remove('hidden');
    setTimeout(() => elements.modal.classList.add('visible'), 10);
    updateInputMode();

    let startVal = '09:00';
    let endVal = '10:00';
    let titleVal = '';

    if (existingEvent) {
        currentEditingId = existingEvent.id;
        elements.modalTitle.textContent = 'Edit Entry';
        titleVal = existingEvent.title;
        startVal = existingEvent.start;
        endVal = existingEvent.end;
        selectedColor = existingEvent.color;
        elements.btns.delete.classList.remove('hidden');
    } else {
        currentEditingId = null;
        elements.modalTitle.textContent = 'New Entry';
        selectedColor = CONFIG.colors[0].id;
        elements.btns.delete.classList.add('hidden');
        if (elements.form.start.value) startVal = elements.form.start.value;
        if (elements.form.end.value) endVal = elements.form.end.value;
    }

    elements.form.title.value = titleVal;
    setTimeInputs(startVal, endVal);
    renderColorOptions(); // Refresh selected state
}

function closeModal() {
    elements.modal.classList.remove('visible');
    setTimeout(() => elements.modal.classList.add('hidden'), 200);
    elements.form.start.value = '';
    elements.form.end.value = '';
    document.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
    document.getElementById('time-error-msg')?.classList.add('hidden');
}

function handleGridClick(e, dayIndex) {
    if (e.target.closest('.event-card')) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;

    // Correctly map click to hour in View Range
    const clickedH = state.viewStart + (offsetY / CONFIG.slotHeight);

    const h = Math.floor(clickedH);
    const m = Math.floor((clickedH - h) * 60);
    const mRounded = m < 30 ? 0 : 30;

    const startStr = `${h.toString().padStart(2, '0')}:${mRounded.toString().padStart(2, '0')}`;
    let endH = h + 1;
    let endM = mRounded;
    // Simple 1hr default
    const endStr = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;

    elements.form.start.value = startStr;
    elements.form.end.value = endStr;
    elements.form.day.value = dayIndex; // Always 0

    openModal();
}

function setupEventListeners() {
    elements.btns.cancel.addEventListener('click', closeModal);
    elements.btns.close.addEventListener('click', closeModal);
    elements.btns.add.addEventListener('click', () => {
        elements.form.start.value = ''; // Reset preferred times
        openModal();
    });

    elements.btns.save.addEventListener('click', () => {
        const title = elements.form.title.value;
        const times = getTimeInputValues();
        const start = times.start;
        const end = times.end;

        const startH = getDecimalHour(start);
        let endH = getDecimalHour(end) || 24;
        if (endH === 0 && startH > 0) endH = 24;

        if (endH <= startH) {
            document.querySelectorAll('#end-h, #end-m, #end-ampm').forEach(el => el.classList.add('input-error'));
            document.getElementById('time-error-msg').classList.remove('hidden');
            return;
        }

        if (currentEditingId) {
            const idx = state.events.findIndex(e => e.id === currentEditingId);
            if (idx !== -1) {
                state.events[idx] = { ...state.events[idx], title, start, end, color: selectedColor, day: 0 };
            }
        } else {
            state.events.push({
                id: Date.now().toString(),
                title, start, end, color: selectedColor, day: 0
            });
        }

        saveData();
        closeModal();
    });

    elements.btns.delete.addEventListener('click', () => {
        if (currentEditingId) {
            state.events = state.events.filter(e => e.id !== currentEditingId);
            saveData();
            closeModal();
        }
    });

    elements.toggle.addEventListener('change', (e) => {
        state.use24h = !e.target.checked;
        saveData();
        if (elements.modal.classList.contains('visible')) {
            const vals = getTimeInputValues();
            updateInputMode();
            setTimeInputs(vals.start, vals.end);
        }
    });

    // Clear errors
    ['end-h', 'end-m', 'start-h'].forEach(id => {
        document.getElementById(id).addEventListener('input', () => {
            document.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
            document.getElementById('time-error-msg').classList.add('hidden');
        });
    });
}

init();
