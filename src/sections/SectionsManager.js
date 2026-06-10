import GmailApiClient from './GmailApiClient';

const CONTAINER_ID = 'inboxy-sections-container';

const DEFAULT_SECTIONS = [
    { id: '1', name: 'Review', query: 'label:review', maxResults: 10, enabled: true },
];

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

class SectionsManager {
    constructor() {
        this.sections = [];
        this._refreshSections();
    }

    _refreshSections() {
        chrome.storage.sync.get({ customSections: DEFAULT_SECTIONS }, ({ customSections }) => {
            this.sections = customSections;
        });
    }

    // Called whenever Gmail renders the inbox. Re-injects the container if needed,
    // uses cached thread data so it doesn't hit the API on every navigation.
    async render() {
        this._refreshSections();

        const injectionPoint = this._findInjectionPoint();
        if (!injectionPoint) return;

        // Re-attach container if Gmail removed it
        let container = document.getElementById(CONTAINER_ID);
        const isNew = !container || !document.body.contains(container);

        if (isNew) {
            container = document.createElement('div');
            container.id = CONTAINER_ID;
            injectionPoint.parentNode.insertBefore(container, injectionPoint.nextSibling);
        } else {
            return; // Container already in place; skip re-render to avoid flicker
        }

        const enabled = this.sections.filter(s => s.enabled);
        for (const section of enabled) {
            container.appendChild(this._buildSection(section));
        }
    }

    // Force-refresh all sections, discarding cache
    async forceRefresh() {
        GmailApiClient.invalidateAllCache();
        const container = document.getElementById(CONTAINER_ID);
        if (container) container.remove();
        await this.render();
    }

    _buildSection(section) {
        const sectionEl = document.createElement('div');
        sectionEl.className = 'inboxy-section';
        sectionEl.dataset.sectionId = section.id;

        const header = this._buildHeader(section, sectionEl);
        const content = document.createElement('div');
        content.className = 'inboxy-section-content';

        sectionEl.appendChild(header);
        sectionEl.appendChild(content);

        this._loadThreads(section, content, header);

        return sectionEl;
    }

    _buildHeader(section, sectionEl) {
        const header = document.createElement('div');
        header.className = 'inboxy-section-header';
        header.innerHTML =
            `<span class="inboxy-section-toggle inboxy-expanded">&#9662;</span>` +
            `<span class="inboxy-section-name">${escapeHtml(section.name)}</span>` +
            `<span class="inboxy-section-count" style="display:none"></span>` +
            `<span class="inboxy-section-refresh" title="Refresh">&#8635;</span>`;

        header.addEventListener('click', e => {
            if (e.target.classList.contains('inboxy-section-refresh')) return;
            const content = sectionEl.querySelector('.inboxy-section-content');
            const toggle = header.querySelector('.inboxy-section-toggle');
            const isCollapsed = content.style.display === 'none';
            content.style.display = isCollapsed ? '' : 'none';
            toggle.innerHTML = isCollapsed ? '&#9662;' : '&#9656;';
            toggle.classList.toggle('inboxy-expanded', isCollapsed);
        });

        header.querySelector('.inboxy-section-refresh').addEventListener('click', e => {
            e.stopPropagation();
            GmailApiClient.invalidateAllCache();
            const content = sectionEl.querySelector('.inboxy-section-content');
            content.style.display = '';
            const toggle = header.querySelector('.inboxy-section-toggle');
            toggle.innerHTML = '&#9662;';
            toggle.classList.add('inboxy-expanded');
            this._loadThreads(section, content, header);
        });

        return header;
    }

    async _loadThreads(section, content, header) {
        content.innerHTML = '<div class="inboxy-section-status">Loading&hellip;</div>';

        try {
            const threads = await GmailApiClient.fetchThreads(section.query, section.maxResults || 10);

            const unreadCount = threads.filter(t => t.isUnread).length;
            const countEl = header.querySelector('.inboxy-section-count');
            if (unreadCount > 0) {
                countEl.textContent = unreadCount;
                countEl.style.display = '';
            } else {
                countEl.style.display = 'none';
            }

            content.innerHTML = '';

            if (!threads.length) {
                content.innerHTML = '<div class="inboxy-section-status">No messages</div>';
                return;
            }

            for (const thread of threads) {
                content.appendChild(this._buildThreadRow(thread));
            }
        } catch (err) {
            content.innerHTML =
                `<div class="inboxy-section-status inboxy-section-error">${escapeHtml(err.message)}</div>`;
        }
    }

    _buildThreadRow(thread) {
        const row = document.createElement('div');
        row.className = 'inboxy-thread-row' + (thread.isUnread ? ' inboxy-unread' : '');
        row.dataset.threadId = thread.threadId;

        row.innerHTML =
            `<span class="inboxy-thread-star" title="Star">&#9733;</span>` +
            `<span class="inboxy-thread-sender">${escapeHtml(thread.from)}</span>` +
            `<span class="inboxy-thread-subject">` +
            `<span class="inboxy-subject-text">${escapeHtml(thread.subject)}</span>` +
            (thread.snippet
                ? `<span class="inboxy-snippet"> &ndash; ${escapeHtml(thread.snippet)}</span>`
                : '') +
            `</span>` +
            `<span class="inboxy-thread-date">${escapeHtml(thread.date)}</span>`;

        row.addEventListener('click', e => {
            if (e.target.classList.contains('inboxy-thread-star')) return;
            const base = window.location.href.split('#')[0];
            window.location.href = `${base}#all/${thread.threadId}`;
        });

        return row;
    }

    _findInjectionPoint() {
        // Prefer the currently-visible tabpanel's message list (.Cp)
        return (
            document.querySelector('[role="main"] .ae4:not([style*="none"]) .Cp') ||
            document.querySelector('[role="main"] .Cp')
        );
    }
}

export default SectionsManager;
