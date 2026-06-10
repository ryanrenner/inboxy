// inboxy: Chrome extension for Google Inbox-style bundles in Gmail.
// Copyright (C) 2020  Teresa Ou

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

const PLACEHOLDER = 'Add the name of each bundle on a new line, for example:\n\nBank\nSchool\nAppointments';

function saveOptions() {
    const exclude = document.getElementById('exclude-radio').checked;
    const labelList = document.getElementById('label-list');
    const labels = labelList.value.split(/[\n]+/).map(s => s.trim()).filter(s => !!s);
    const groupMessagesByDate = document.getElementById('group-by-date-checkbox').checked;

    chrome.storage.sync.set({
        exclude: !!exclude,
        labels: labels,
        groupMessagesByDate: !!groupMessagesByDate,
    }, function() {
        labelList.value = labels.join('\n');

        const saveButton = document.getElementById('save-button');
        saveButton.classList.add('saved');
        setTimeout(() => {
            saveButton.classList.remove('saved');
        }, 3000);
    });
}

function restoreOptions() {
    chrome.storage.sync.get({
        exclude: true,
        labels: [],
        groupMessagesByDate: true,
    }, function(items) {
        const id = items.exclude ? 'exclude-radio' : 'include-radio';
        document.getElementById(id).checked = true;

        const labelList = document.getElementById('label-list');
        labelList.value = items.labels.join('\n');
        if (!items.labels.length) {
          labelList.placeholder = PLACEHOLDER;
        }

        document.getElementById('group-by-date-checkbox').checked = items.groupMessagesByDate;

    });
}
document.getElementById('save-button').addEventListener('click', saveOptions);


//
// Tabs for options page
//

function selectTab(tabIndex, subtitle) {
    const tabs = [...document.querySelectorAll('main .tab')];
    for (let i = 0; i < tabs.length; i++) {
        tabs[i].style.display = i === tabIndex ? 'block' : 'none';
    }

    const tabLinks = [...document.querySelectorAll('.nav-links li')];
    for (let i = 0; i < tabLinks.length; i++) {
        tabLinks[i].style.fontWeight = i === tabIndex ? '700' : '';
    }

    document.querySelector('title').innerText = `inboxy - ${subtitle}`;
}

document.querySelectorAll('.nav-links li').forEach((e, i) => {
    e.addEventListener('click', () => selectTab(i, e.innerText));
});

function initializeTab() {
    // Set the initial tab, based on the hash
    const parts = window.location.href.split('#');
    if (parts.length < 2 || parts[1].length === 0) {
        selectTab(1, 'Options');
        restoreOptions();
    }
    else if (parts[1] === 'sections') {
        selectTab(2, 'Sections');
        restoreSections();
    }
    else if (parts[1] === 'help') {
        selectTab(3, 'Help');
    }
    else {
        selectTab(0, 'Get started');
    }
}

initializeTab();
window.addEventListener('hashchange', initializeTab);

// ──────────────────────────────────────────────
// Custom sections
// ──────────────────────────────────────────────

const DEFAULT_SECTIONS = [
    { id: '1', name: 'Review', query: 'label:review', maxResults: 10, enabled: true },
];

let nextSectionId = Date.now();

function uid() {
    return String(nextSectionId++);
}

function restoreSections() {
    chrome.storage.sync.get({ customSections: DEFAULT_SECTIONS }, ({ customSections }) => {
        renderSectionsList(customSections);
    });
}

function renderSectionsList(sections) {
    const list = document.getElementById('sections-list');
    list.innerHTML = '';
    sections.forEach(s => list.appendChild(buildSectionItem(s)));
}

function buildSectionItem(section) {
    const item = document.createElement('div');
    item.className = 'section-item';
    item.dataset.id = section.id;

    item.innerHTML = `
        <div>
            <label>Name</label>
            <input type="text" class="section-name-input" value="${escOpt(section.name)}" placeholder="Review">
        </div>
        <div>
            <label>Gmail query</label>
            <input type="text" class="section-query-input" value="${escOpt(section.query)}" placeholder="label:review">
        </div>
        <div>
            <label>Max</label>
            <input type="number" class="section-max-input" value="${section.maxResults || 10}" min="1" max="50">
        </div>
        <label class="section-enabled-label">
            <input type="checkbox" class="section-enabled-checkbox" ${section.enabled ? 'checked' : ''}>
            Enabled
        </label>
        <button class="section-remove-btn" title="Remove section">&times;</button>
    `;

    item.querySelector('.section-remove-btn').addEventListener('click', () => item.remove());

    return item;
}

function collectSections() {
    return [...document.querySelectorAll('#sections-list .section-item')].map(item => ({
        id: item.dataset.id || uid(),
        name: item.querySelector('.section-name-input').value.trim(),
        query: item.querySelector('.section-query-input').value.trim(),
        maxResults: parseInt(item.querySelector('.section-max-input').value) || 10,
        enabled: item.querySelector('.section-enabled-checkbox').checked,
    })).filter(s => s.name && s.query);
}

function saveSections() {
    const sections = collectSections();
    chrome.storage.sync.set({ customSections: sections }, () => {
        const btn = document.getElementById('save-sections-btn');
        btn.classList.add('saved');
        setTimeout(() => btn.classList.remove('saved'), 3000);
    });
}

document.getElementById('add-section-btn').addEventListener('click', () => {
    const list = document.getElementById('sections-list');
    list.appendChild(buildSectionItem({
        id: uid(),
        name: '',
        query: '',
        maxResults: 10,
        enabled: true,
    }));
});

document.getElementById('save-sections-btn').addEventListener('click', saveSections);

function escOpt(str) {
    return String(str || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
