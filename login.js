// login.js

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize the database as soon as the page loads
    try {
        await initDB();
    } catch (e) {
        console.error("Failed to initialize DB:", e);
    }

    const loginForm = document.getElementById('loginForm');
    const loginError = document.getElementById('loginError');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        loginError.classList.add('hidden');
        
        try {
            const result = await callAPI('login', { username, password });
            
            if (result.data) {
                const user = result.data;
                // Store user session in LocalStorage for UI purposes
                localStorage.setItem('currentUser', JSON.stringify(user));
                
                // Redirect based on role
                if (user.role === 'student') {
                    window.location.href = 'student.html';
                } else if (user.role === 'mentor') {
                    window.location.href = 'mentor.html';
                } else if (user.role === 'admin') {
                    window.location.href = 'admin.html';
                }
            } else {
                loginError.textContent = result.error || "Invalid username or password";
                loginError.classList.remove('hidden');
            }
        } catch (err) {
            console.error(err);
            loginError.textContent = "An error occurred during login";
            loginError.classList.remove('hidden');
        }
    });
});
