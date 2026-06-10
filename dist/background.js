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

if (chrome.declarativeContent) {
    chrome.runtime.onInstalled.addListener(function() {
        chrome.declarativeContent.onPageChanged.removeRules(undefined, function() {
            chrome.declarativeContent.onPageChanged.addRules([{
                conditions: [new chrome.declarativeContent.PageStateMatcher({
                    pageUrl: { hostEquals: 'mail.google.com'},
                })],
                actions: [new chrome.declarativeContent.ShowPageAction()]
            }]);
        });
    });
}

// Handle auth token requests from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_AUTH_TOKEN') {
        chrome.identity.getAuthToken({ interactive: true }, token => {
            if (chrome.runtime.lastError) {
                sendResponse({ error: chrome.runtime.lastError.message });
            } else {
                sendResponse({ token });
            }
        });
        return true; // keep message channel open for async response
    }

    if (message.type === 'REMOVE_AUTH_TOKEN') {
        chrome.identity.removeCachedAuthToken({ token: message.token }, () => {
            sendResponse({});
        });
        return true;
    }
});
