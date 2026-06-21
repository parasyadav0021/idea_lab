// db.js
// Handles database communication with the PHP backend

async function initDB() {
    // Ping setup.php once to ensure the DB is initialized
    try {
        await fetch('setup.php');
    } catch(e) {
        console.warn("setup.php could not be reached, DB might not be initialized.");
    }
}

async function runQuery(sql, params = []) {
    try {
        const response = await fetch('api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql, params })
        });
        const result = await response.json();
        if (result.error) {
            console.error("Query Error:", result.error, "SQL:", sql);
        }
        return result;
    } catch(e) {
        console.error("Fetch Error:", e);
    }
}

async function fetchQuery(sql, params = []) {
    try {
        const response = await fetch('api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql, params })
        });
        const result = await response.json();
        if (result.error) {
            console.error("Query Error:", result.error, "SQL:", sql);
            return [];
        }
        return result.data || [];
    } catch(e) {
        console.error("Fetch Error:", e);
        return [];
    }
}

function resetDatabase() {
    alert('Reset database logic must be implemented securely on the backend now.');
}
