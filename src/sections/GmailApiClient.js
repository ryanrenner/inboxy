const GMAIL_API_BASE = 'https://www.googleapis.com/gmail/v1/users/me';
const CACHE_TTL_MS = 5 * 60 * 1000;

const cache = new Map();

function getCached(key) {
    const entry = cache.get(key);
    if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
        return entry.data;
    }
    return null;
}

function setCached(key, data) {
    cache.set(key, { data, timestamp: Date.now() });
}

async function getAuthToken() {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'GET_AUTH_TOKEN' }, response => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else if (response?.error) {
                reject(new Error(response.error));
            } else if (!response?.token) {
                reject(new Error('No auth token returned'));
            } else {
                resolve(response.token);
            }
        });
    });
}

async function removeAuthToken(token) {
    return new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'REMOVE_AUTH_TOKEN', token }, () => resolve());
    });
}

async function apiFetch(url, token) {
    const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.status === 401) {
        await removeAuthToken(token);
        throw new Error('Auth token expired — please reload Gmail');
    }
    if (!resp.ok) {
        throw new Error(`Gmail API ${resp.status}`);
    }
    return resp.json();
}

async function fetchThreads(query, maxResults = 10) {
    const cacheKey = `${query}:${maxResults}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    const token = await getAuthToken();

    const listData = await apiFetch(
        `${GMAIL_API_BASE}/threads?q=${encodeURIComponent(query)}&maxResults=${maxResults}`,
        token
    );

    const threadStubs = listData.threads || [];
    const details = await Promise.all(threadStubs.map(t => fetchThreadDetail(t.id, token)));
    const result = details.filter(Boolean);

    setCached(cacheKey, result);
    return result;
}

async function fetchThreadDetail(threadId, token) {
    try {
        const data = await apiFetch(
            `${GMAIL_API_BASE}/threads/${threadId}?format=metadata` +
            `&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
            token
        );

        const messages = data.messages || [];
        if (!messages.length) return null;

        // Newest message holds the most recent metadata
        const latest = messages[messages.length - 1];
        const headers = latest.payload?.headers || [];

        const getHeader = name =>
            (headers.find(h => h.name.toLowerCase() === name.toLowerCase()) || {}).value || '';

        return {
            threadId: data.id,
            subject: getHeader('Subject') || '(no subject)',
            from: parseFrom(getHeader('From')),
            date: formatDate(getHeader('Date')),
            snippet: latest.snippet || '',
            isUnread: (latest.labelIds || []).includes('UNREAD'),
        };
    } catch (_) {
        return null;
    }
}

function parseFrom(fromHeader) {
    if (!fromHeader) return '';
    const match = fromHeader.match(/^"?([^"<]+)"?\s*</);
    if (match) return match[1].trim();
    return fromHeader.split('@')[0];
}

function formatDate(dateHeader) {
    if (!dateHeader) return '';
    try {
        const d = new Date(dateHeader);
        const now = new Date();
        if (d.toDateString() === now.toDateString()) {
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        if (d.getFullYear() === now.getFullYear()) {
            return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }
        return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (_) {
        return '';
    }
}

function invalidateAllCache() {
    cache.clear();
}

export default { fetchThreads, invalidateAllCache };
