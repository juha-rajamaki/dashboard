let currentGeneratedKey = '';

// Load keys on page load
window.addEventListener('DOMContentLoaded', () => {
    console.log('Keys page loaded');
    loadKeys();

    // Set WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}`;
    document.getElementById('wsUrl').textContent = wsUrl;

    // Add event listeners
    const generateBtn = document.getElementById('generateBtn');
    const copyNewKeyBtn = document.getElementById('copyNewKeyBtn');

    if (generateBtn) {
        generateBtn.addEventListener('click', generateKey);
        console.log('Generate button listener added');
    } else {
        console.error('Generate button not found!');
    }

    if (copyNewKeyBtn) {
        copyNewKeyBtn.addEventListener('click', () => copyToClipboard(currentGeneratedKey, 'addAlertContainer'));
    }
});

// Generate API key
async function generateKey() {
    console.log('Generate key function called');
    const deviceName = document.getElementById('deviceName').value.trim();
    console.log('Device name:', deviceName);

    if (!deviceName) {
        showAlert('addAlertContainer', 'error', 'Please enter a device name');
        return;
    }

    try {
        // Generate key using crypto in browser
        const keyArray = new Uint8Array(32);
        window.crypto.getRandomValues(keyArray);
        const apiKey = Array.from(keyArray)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

        console.log('Generated key, sending to server...');

        // Save the key to the server
        const response = await fetch('/api/setup/generate-key', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: deviceName,
                key: apiKey
            })
        });

        const result = await response.json();
        console.log('Server response:', result);

        if (result.success) {
            currentGeneratedKey = apiKey;
            document.getElementById('generatedKeyValue').textContent = apiKey;
            document.getElementById('generatedKeyBox').classList.add('show');
            document.getElementById('deviceName').value = '';
            showAlert('addAlertContainer', 'success', 'API key generated successfully!');

            // Reload the keys list
            loadKeys();
        } else {
            showAlert('addAlertContainer', 'error', result.error || 'Failed to generate key');
        }
    } catch (error) {
        console.error('Error:', error);
        showAlert('addAlertContainer', 'error', 'Error generating key: ' + error.message);
    }
}

// Load all keys
async function loadKeys() {
    try {
        const response = await fetch('/api/keys/list');
        const result = await response.json();

        if (result.success) {
            displayKeys(result.keys);
        } else {
            showAlert('listAlertContainer', 'error', 'Failed to load keys');
        }
    } catch (error) {
        showAlert('listAlertContainer', 'error', 'Error loading keys: ' + error.message);
    }
}

// Display keys in the list
function displayKeys(keys) {
    const keysList = document.getElementById('keysList');

    if (keys.length === 0) {
        keysList.innerHTML = '<div class="no-keys">No API keys found. Add one above!</div>';
        return;
    }

    keysList.innerHTML = keys.map(key => `
        <div class="key-item">
            <div class="key-name">${escapeHtml(key.name)}</div>
            <div class="key-value-row">
                <div class="key-value">${escapeHtml(key.key)}</div>
                <button class="copy-btn" data-key="${escapeHtml(key.key)}">📋 Copy</button>
                <button class="delete-btn" data-key-id="${escapeHtml(key.id)}" data-key-name="${escapeHtml(key.name)}">🗑️ Delete</button>
            </div>
            ${key.createdAt ? `<div class="key-meta">Created: ${new Date(key.createdAt).toLocaleString()}</div>` : ''}
        </div>
    `).join('');

    // Add copy button event listeners
    document.querySelectorAll('.copy-btn[data-key]').forEach(btn => {
        btn.addEventListener('click', function() {
            const key = this.getAttribute('data-key');
            copyToClipboard(key, 'listAlertContainer');
        });
    });

    // Add delete button event listeners
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const keyId = this.getAttribute('data-key-id');
            const keyName = this.getAttribute('data-key-name');
            deleteKey(keyId, keyName);
        });
    });
}

// Delete an API key
async function deleteKey(keyId, keyName) {
    if (!confirm(`Are you sure you want to delete the API key "${keyName}"?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/keys/${keyId}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.success) {
            showAlert('listAlertContainer', 'success', 'API key deleted successfully');
            loadKeys();
        } else {
            showAlert('listAlertContainer', 'error', result.error || 'Failed to delete key');
        }
    } catch (error) {
        console.error('Delete error:', error);
        showAlert('listAlertContainer', 'error', 'Error deleting key: ' + error.message);
    }
}

// Copy key to clipboard
function copyToClipboard(key, alertContainer) {
    navigator.clipboard.writeText(key).then(() => {
        showAlert(alertContainer, 'success', 'API key copied to clipboard!');
    }).catch(err => {
        showAlert(alertContainer, 'error', 'Failed to copy key');
    });
}

// Show alert message
function showAlert(containerId, type, message) {
    const alertContainer = document.getElementById(containerId);
    const alertClass = type === 'success' ? 'alert-success' : 'alert-error';
    alertContainer.innerHTML = `<div class="alert ${alertClass}">${message}</div>`;
    setTimeout(() => {
        alertContainer.innerHTML = '';
    }, 3000);
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
