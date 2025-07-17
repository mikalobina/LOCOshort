document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const newLink = urlParams.get('newLink');

    if (newLink) {
        const resultContainer = document.getElementById('short-link-result');
        const linkInput = document.getElementById('new-link-input');
        const copyBtn = document.getElementById('copy-btn');

        if (resultContainer && linkInput && copyBtn) {
            resultContainer.style.display = 'block';
            linkInput.value = newLink;

            copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(newLink).then(() => {
                    copyBtn.textContent = '✅ Copied!';
                    setTimeout(() => {
                        copyBtn.textContent = '📋 Copy';
                    }, 2000);
                });
            });

            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }
    }

    const refreshButton = document.getElementById('refreshBtn');
    if (refreshButton) {
        refreshButton.addEventListener('click', fetchLogs);
    }
    fetchLogs();
});

async function fetchLogs() {
    const logContainer = document.getElementById('log-container');
    if (!logContainer) return;

    logContainer.innerHTML = '<p>Loading data... ⏳</p>';

    try {
        const response = await fetch('/api/logs');
        if (!response.ok) {
            throw new Error('Failed to fetch logs. Are you logged in?');
        }
        const logs = await response.json();

        if (logs.length === 0) {
            logContainer.innerHTML = '<p>No data tracked yet. Share a link to start!</p>';
            return;
        }

        logContainer.innerHTML = logs.map(log => {
            let locationDisplay;
            if (log.location.mapLink) {
                locationDisplay = `<a href="${log.location.mapLink}" target="_blank" rel="noopener noreferrer" class="map-link">Google Maps</a>`;
            } else {
                locationDisplay = 'N/A';
            }

            return `
                <div class="log-entry">
                    <p><strong>🔗 Link ID:</strong> ${log.linkId}</p> <p><strong>🌐 IP Address:</strong> ${log.ip}</p>
                    <p><strong>📍 Location:</strong> ${locationDisplay}</p>
                    <p><strong>📱 Device:</strong> ${log.device}</p>
                    <p><strong>🌐 Browser:</strong> ${log.browser}</p>
                    <p><strong>💻 OS:</strong> ${log.os}</p>
                    <p><strong>🕒 Timestamp:</strong> ${log.timestamp}</p>
                </div>
            `;
        }).join('');
    } catch (error) {
        logContainer.innerHTML = `<p style="color: red;">${error.message}</p>`;
    }
}
