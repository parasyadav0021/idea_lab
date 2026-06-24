// db.js
// Handles database communication with the PHP backend action API

function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag])
    );
}

async function initDB() {
    // Ping setup.php once to ensure the DB is initialized
    try {
        await fetch('setup.php');
    } catch(e) {
        console.warn("setup.php could not be reached, DB might not be initialized.");
    }
}

async function callAPI(action, params = {}) {
    try {
        const response = await fetch('api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, params }),
            // Make sure cookies (session ID) are sent and received
            credentials: 'include'
        });
        
        if (response.status === 403) {
            console.error("Access Forbidden. Redirecting to login...");
            alert("Session expired or unauthorized action. Redirecting to login.");
            localStorage.removeItem('currentUser');
            window.location.href = 'index.html';
            return { error: 'Forbidden' };
        }
        
        const result = await response.json();
        if (result.error) {
            console.error("API Error:", result.error, "Action:", action);
        }
        return result;
    } catch(e) {
        console.error("Fetch Error:", e);
        return { error: 'Fetch failed' };
    }
}

function resetDatabase() {
    alert('Reset database logic must be implemented securely on the backend now.');
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('open');
}

// --- Global Toast Notification Utility ---
function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerText = message;
    container.appendChild(toast);
    
    // Trigger reflow for animation
    void toast.offsetWidth;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
