// admin.js

let currentUser = null;
let currentTab = 'Active';

document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication
    const userStr = localStorage.getItem('currentUser');
    if (!userStr) {
        window.location.href = 'index.html';
        return;
    }
    currentUser = JSON.parse(userStr);
    
    if (currentUser.role !== 'admin') {
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('welcomeUser').textContent = `Welcome, ${currentUser.username}`;

    await initDB();
    await loadGroups();
    await loadAdminComponents();
});

function logout() {
    localStorage.removeItem('currentUser');
    window.location.href = 'index.html';
}

function showAdminSection(sectionId) {
    // Hide all sections
    document.getElementById('students-directory-section').classList.add('hidden');
    document.getElementById('components-section').classList.add('hidden');
    document.getElementById('edit-section').classList.add('hidden');
    
    // Remove active class from nav items
    document.getElementById('nav-students').classList.remove('active');
    document.getElementById('nav-components').classList.remove('active');
    document.getElementById('nav-edit').classList.remove('active');

    const pageTitle = document.getElementById('pageTitle');

    if (sectionId === 'students-directory') {
        document.getElementById('students-directory-section').classList.remove('hidden');
        document.getElementById('nav-students').classList.add('active');
        if (pageTitle) pageTitle.textContent = 'Students Directory';
        loadGroups();
    } else if (sectionId === 'components') {
        document.getElementById('components-section').classList.remove('hidden');
        document.getElementById('nav-components').classList.add('active');
        if (pageTitle) pageTitle.textContent = 'Components';
        loadAdminComponents();
    } else if (sectionId === 'edit') {
        document.getElementById('edit-section').classList.remove('hidden');
        document.getElementById('nav-edit').classList.add('active');
        if (pageTitle) pageTitle.textContent = 'Manage Users & Groups';
        loadUsersList();
        loadEditGroupsList();
        loadAssigneeSection();
    }
}

function setTab(tabName) {
    currentTab = tabName;
    document.getElementById('tabActive').classList.toggle('active', tabName === 'Active');
    document.getElementById('tabReturn').classList.toggle('active', tabName === 'Return');
    loadGroups();
}

function toggleGroupDetails(groupId) {
    const detailsDiv = document.getElementById(`group-details-${groupId}`);
    if (detailsDiv.classList.contains('open')) {
        detailsDiv.classList.remove('open');
    } else {
        // Close others
        document.querySelectorAll('.group-details.open').forEach(el => el.classList.remove('open'));
        detailsDiv.classList.add('open');
    }
}

async function loadGroups() {
    const yearSelect = document.getElementById('filterAcademicYear').value;
    const yearLvlSelect = document.getElementById('filterYear').value;
    const semSelect = document.getElementById('filterSem').value;
    const divInput = document.getElementById('filterDiv').value.trim().toLowerCase();
    
    const container = document.getElementById('groupsContainer');
    container.innerHTML = '<p class="text-muted text-center">Loading...</p>';

    // We fetch groups that are either 'Approved' (for Active tab) or 'Given' (for Return tab)
    let dbStatus = currentTab === 'Active' ? 'Approved' : 'Given';
    
    let sql = "SELECT * FROM project_groups WHERE status = ?";
    let params = [dbStatus];

    if (yearSelect !== 'All') {
        sql += " AND academic_year = ?";
        params.push(yearSelect);
    }
    if (yearLvlSelect !== 'All') {
        sql += " AND year = ?";
        params.push(yearLvlSelect);
    }
    if (semSelect !== 'All') {
        sql += " AND sem = ?";
        params.push(semSelect);
    }
    if (divInput) {
        sql += " AND LOWER(division) = ?";
        params.push(divInput);
    }

    sql += " ORDER BY id DESC";

    const allGroups = await fetchQuery(sql, params);
    
    if (allGroups.length === 0) {
        container.innerHTML = `<p class="text-muted text-center mt-4">No ${currentTab.toLowerCase()} groups found matching the criteria.</p>`;
        return;
    }

    let validGroups = [];

    // Filter Active Groups based on component status
    if (currentTab === 'Active') {
        for (let group of allGroups) {
            const requests = await fetchQuery("SELECT status FROM component_requests WHERE group_id = ?", [group.id]);
            // Exclude groups with no components
            if (requests.length === 0) continue;
            
            // Exclude groups that still have 'Pending' components
            const hasPending = requests.some(r => r.status === 'Pending');
            if (hasPending) continue;

            // Optional: Exclude groups that only have Rejected components
            const hasApproved = requests.some(r => r.status === 'Approved');
            if (!hasApproved) continue;

            validGroups.push(group);
        }
    } else {
        // Return tab: display all completed groups
        validGroups = allGroups;
    }

    if (validGroups.length === 0) {
        container.innerHTML = `<p class="text-muted text-center mt-4">No groups ready for administration matching the criteria.</p>`;
        return;
    }

    container.innerHTML = '';

    for (let i = 0; i < validGroups.length; i++) {
        let group = validGroups[i];
        
        // Fetch students
        const students = await fetchQuery("SELECT * FROM students WHERE group_id = ?", [group.id]);
        let studentsHtml = '';
        if (students.length > 0) {
            studentsHtml += `
                <div class="student-list student-list-header">
                    <div>Name</div>
                    <div>Roll No</div>
                    <div>Email</div>
                    <div>Phone</div>
                </div>
            `;
            students.forEach(s => {
                studentsHtml += `
                    <div class="student-list">
                        <div>${s.name}</div>
                        <div>${s.roll_no}</div>
                        <div>${s.email}</div>
                        <div>${s.phone}</div>
                    </div>
                `;
            });
        } else {
            studentsHtml = '<p class="text-muted text-sm mb-4">No students added yet.</p>';
        }

        // Fetch component requests
        const requests = await fetchQuery(`
            SELECT r.*, c.name as component_name, c.total_qty, c.available_qty
            FROM component_requests r
            JOIN components c ON r.component_id = c.id
            WHERE r.group_id = ?
            ORDER BY r.status ASC, r.id ASC
        `, [group.id]); 
        // Note: Ordering by status ASC will put 'Approved' before 'Rejected'.

        let componentsHtml = '';
        if (requests.length > 0) {
            componentsHtml += `
                <h4 class="mt-6 mb-2">Requested Components</h4>
                <div class="component-grid comp-header" style="grid-template-columns: ${currentTab === 'Active' ? '0.5fr 2fr 1fr 1fr 1fr 1fr' : '2fr 1fr 1fr 1.5fr'};">
                    ${currentTab === 'Active' ? '<div></div>' : ''}
                    <div>Component Name</div>
                    <div>Requested Qty</div>
                    <div>Time</div>
                    ${currentTab === 'Active' ? '<div>Status</div><div>Action</div>' : '<div>Admin Action</div>'}
                </div>
                <form id="form-group-${group.id}" onsubmit="saveAdminComponents(event, ${group.id})">
            `;
            
            requests.forEach(req => {
                if (currentTab === 'Active') {
                    // Active Tab rendering
                    let checkboxHtml = '';
                    let statusColor = req.status === 'Approved' ? 'var(--secondary)' : 'var(--danger)';
                    let displayStatus = req.status;

                    let actionHtml = '';
                    if (req.status === 'Approved') {
                        let isChecked = req.admin_status === 'Given' ? 'checked' : '';
                        checkboxHtml = `<input type="checkbox" name="comp_given_${req.id}" value="${req.id}" ${isChecked} style="width:16px;height:16px;">`;
                        actionHtml = `
                            <button type="button" class="btn btn-outline" style="padding: 0.25rem 0.75rem; font-size: 0.8rem; border-color: var(--danger); color: var(--danger);" onclick="rejectAdminRequest(${req.id}, ${req.component_id}, ${req.requested_qty})">Reject</button>
                        `;
                    } else if (req.status === 'Rejected') {
                        actionHtml = `<span>-</span>`;
                    }
                    
                    componentsHtml += `
                        <div class="component-grid" style="grid-template-columns: 0.5fr 2fr 1fr 1fr 1fr 1fr;">
                            <div style="display:flex; justify-content:center; align-items:center;">${checkboxHtml}</div>
                            <div><strong>${req.component_name}</strong></div>
                            <div>${req.requested_qty}</div>
                            <div>${req.request_time ? req.request_time : 'N/A'}</div>
                            <div><span style="color: ${statusColor}; font-weight: 600;">${displayStatus}</span></div>
                            <div>${actionHtml}</div>
                        </div>
                    `;
                } else {
                    // Return Tab rendering
                    // Only show components that were 'Approved' (or 'Given')
                    if (req.status !== 'Approved') return;

                    let actionHtml = '';
                    if (req.admin_status === 'Returned') {
                        actionHtml = `<span style="color: var(--secondary); font-weight: 600;">Returned</span>`;
                    } else if (req.admin_status === 'Given') {
                        actionHtml = `
                            <button type="button" class="btn btn-outline" style="padding: 0.25rem 0.75rem; font-size: 0.8rem; border-color: var(--primary); color: var(--primary);" 
                            onclick="returnComponent(${req.id}, ${req.component_id}, ${req.requested_qty})">Return</button>
                        `;
                    } else {
                        actionHtml = `<span class="text-muted">Not Given</span>`;
                    }

                    componentsHtml += `
                        <div class="component-grid" style="grid-template-columns: 2fr 1fr 1fr 1.5fr;">
                            <div><strong>${req.component_name}</strong></div>
                            <div>${req.requested_qty}</div>
                            <div>${req.request_time ? req.request_time : 'N/A'}</div>
                            <div>${actionHtml}</div>
                        </div>
                    `;
                }
            });

            if (currentTab === 'Active') {
                componentsHtml += `
                    <div class="mt-4 text-right">
                        <button type="submit" class="btn btn-primary">Save Given Components</button>
                    </div>
                `;
            }
            componentsHtml += `</form>`;
        }

        container.innerHTML += `
            <div class="group-card">
                <div class="group-header" onclick="toggleGroupDetails(${group.id})">
                    <h4 style="margin: 0;">${i + 1}- ${group.group_name || 'Unnamed Group'}</h4>
                    <span class="badge" style="background: rgba(79, 70, 229, 0.1); color: var(--primary); padding: 0.25rem 0.75rem; border-radius: 999px; font-size: 0.8rem;">
                        ${group.academic_year || 'Year N/A'} | Year ${group.year || '-'}, Sem ${group.sem || '-'} | Div: ${group.division || '-'}
                    </span>
                </div>
                <div class="group-details" id="group-details-${group.id}">
                    <h4 class="mb-2">Students</h4>
                    ${studentsHtml}
                    
                    <h4 class="mt-6 mb-2">Problem Statement</h4>
                    <div style="background: rgba(255,255,255,0.02); padding: 1rem; border-radius: 8px; border: 1px solid var(--border);">
                        <strong>${group.problem_statement || 'N/A'}</strong><br>
                        <span class="text-muted text-sm mt-2 block">${group.description || 'No description provided.'}</span>
                    </div>

                    ${componentsHtml}
                </div>
            </div>
        `;
    }
}

async function saveAdminComponents(event, groupId) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    
    // First, fetch all requests for this group to reset checkboxes that were unchecked
    const requests = await fetchQuery("SELECT id FROM component_requests WHERE group_id = ? AND status = 'Approved'", [groupId]);
    
    const checkedIds = [];
    for (let [key, value] of formData.entries()) {
        if (key.startsWith('comp_given_')) {
            checkedIds.push(parseInt(value));
        }
    }

    let allGiven = true;
    // Update database
    for (let req of requests) {
        if (checkedIds.includes(req.id)) {
            await runQuery("UPDATE component_requests SET admin_status = 'Given' WHERE id = ?", [req.id]);
        } else {
            allGiven = false;
            // Only unset if it hasn't been 'Returned' already
            await runQuery("UPDATE component_requests SET admin_status = NULL WHERE id = ? AND admin_status != 'Returned'", [req.id]);
        }
    }

    if (allGiven && requests.length > 0) {
        await runQuery("UPDATE project_groups SET status = 'Given' WHERE id = ?", [groupId]);
        alert("All components given! Group moved to Return section.");
    } else {
        alert("Saved successfully!");
    }
    
    loadGroups();
}

async function returnComponent(reqId, compId, qty) {
    if (!confirm("Confirm component returned?")) return;
    
    // Mark as Returned
    await runQuery("UPDATE component_requests SET admin_status = 'Returned' WHERE id = ?", [reqId]);
    
    // Add quantity back to inventory
    await runQuery("UPDATE components SET available_qty = available_qty + ? WHERE id = ?", [qty, compId]);
    
    loadGroups(); // Refresh
}

async function rejectAdminRequest(reqId, compId, requestedQty) {
    if (!confirm('Reject this component request?')) return;
    // Update status to Rejected
    await runQuery("UPDATE component_requests SET status = 'Rejected' WHERE id = ?", [reqId]);
    // Restock component
    await runQuery("UPDATE components SET available_qty = available_qty + ? WHERE id = ?", [requestedQty, compId]);
    loadGroups(); // Refresh
}



// --- Components Section Logic ---

async function loadAdminComponents() {
    const searchStr = document.getElementById('adminComponentSearch').value.trim().toLowerCase();
    const tbody = document.getElementById('componentsBody');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center">Loading...</td></tr>';

    let sql = "SELECT * FROM components";
    let params = [];
    if (searchStr) {
        sql += " WHERE LOWER(name) LIKE ?";
        params.push('%' + searchStr + '%');
    }
    sql += " ORDER BY name ASC";

    const comps = await fetchQuery(sql, params);
    
    tbody.innerHTML = '';
    if (comps.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No components found.</td></tr>';
        return;
    }

    comps.forEach(c => {
        tbody.innerHTML += `
            <tr>
                <td><strong>${c.name}</strong></td>
                <td>
                    <span id="qty-text-${c.id}">${c.total_qty}</span>
                    <input type="number" id="qty-input-${c.id}" class="form-control hidden" style="max-width:80px; padding: 0.25rem;" value="${c.total_qty}">
                </td>
                <td>${c.available_qty}</td>
                <td>
                    <button id="edit-btn-${c.id}" class="btn btn-outline" style="padding: 0.25rem 0.75rem; font-size: 0.8rem;" onclick="enableEditQty(${c.id})">Edit Qty</button>
                    <button id="save-btn-${c.id}" class="btn btn-primary hidden" style="padding: 0.25rem 0.75rem; font-size: 0.8rem;" onclick="saveEditQty(${c.id}, ${c.total_qty}, ${c.available_qty})">Save</button>
                </td>
            </tr>
        `;
    });
}

function showAddComponentModal() {
    document.getElementById('addComponentForm').classList.remove('hidden');
}

function hideAddComponentModal() {
    document.getElementById('addComponentForm').classList.add('hidden');
    document.getElementById('newCompName').value = '';
    document.getElementById('newCompQty').value = '';
}

async function saveNewComponent() {
    const name = document.getElementById('newCompName').value.trim();
    const qty = parseInt(document.getElementById('newCompQty').value);

    if (!name || isNaN(qty) || qty <= 0) {
        alert("Please enter a valid name and quantity greater than 0.");
        return;
    }

    await runQuery("INSERT INTO components (name, total_qty, available_qty) VALUES (?, ?, ?)", [name, qty, qty]);
    hideAddComponentModal();
    loadAdminComponents();
}

function enableEditQty(compId) {
    document.getElementById(`qty-text-${compId}`).classList.add('hidden');
    document.getElementById(`qty-input-${compId}`).classList.remove('hidden');
    document.getElementById(`edit-btn-${compId}`).classList.add('hidden');
    document.getElementById(`save-btn-${compId}`).classList.remove('hidden');
}

async function saveEditQty(compId, oldTotal, currentAvail) {
    const input = document.getElementById(`qty-input-${compId}`);
    const newTotal = parseInt(input.value);

    if (isNaN(newTotal) || newTotal < 0) {
        alert("Invalid quantity.");
        return;
    }

    // Calculate difference and adjust available_qty
    const diff = newTotal - oldTotal;
    const newAvail = currentAvail + diff;

    if (newAvail < 0) {
        alert("Cannot reduce total quantity below what is currently distributed.");
        return;
    }

    await runQuery("UPDATE components SET total_qty = ?, available_qty = ? WHERE id = ?", [newTotal, newAvail, compId]);
    loadAdminComponents();
}

// --- Edit Section Logic ---
function showAddUserModal() {
    document.getElementById('addUserForm').classList.remove('hidden');
}

function hideAddUserModal() {
    document.getElementById('addUserForm').classList.add('hidden');
    document.getElementById('newUserName').value = '';
    document.getElementById('newUserPass').value = '';
    document.getElementById('newUserRole').value = 'student';
}

async function saveNewUser() {
    const name = document.getElementById('newUserName').value.trim();
    const pass = document.getElementById('newUserPass').value.trim();
    const role = document.getElementById('newUserRole').value;

    if (!name || !pass) {
        alert("Please enter both username and password.");
        return;
    }

    try {
        const existing = await fetchQuery("SELECT * FROM users WHERE username = ?", [name]);
        if (existing.length > 0) {
            alert("Username already exists.");
            return;
        }

        await runQuery("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", [name, pass, role]);
        
        hideAddUserModal();
        loadUsersList();
    } catch(e) {
        console.error(e);
        alert("Error creating user.");
    }
}

function enableEditUser(id) {
    document.getElementById(`user-pass-text-${id}`).classList.add('hidden');
    document.getElementById(`user-pass-input-${id}`).classList.remove('hidden');
    document.getElementById(`edit-user-btn-${id}`).classList.add('hidden');
    document.getElementById(`save-user-btn-${id}`).classList.remove('hidden');
}

async function saveEditUser(id) {
    const input = document.getElementById(`user-pass-input-${id}`);
    const newPass = input.value.trim();

    if (!newPass) {
        alert("Password cannot be empty.");
        return;
    }

    await runQuery("UPDATE users SET password = ? WHERE id = ?", [newPass, id]);
    loadUsersList();
}

async function deleteUser(id, role, username) {
    if (!confirm(`Are you sure you want to delete the user '${username}'?`)) return;
    
    await runQuery("DELETE FROM users WHERE id = ?", [id]);
    
    loadUsersList();
}

async function loadUsersList() {
    const mentorsBody = document.getElementById('mentorsBody');
    const studentsBody = document.getElementById('studentsBody');
    
    mentorsBody.innerHTML = '<tr><td colspan="3" class="text-center">Loading...</td></tr>';
    studentsBody.innerHTML = '<tr><td colspan="3" class="text-center">Loading...</td></tr>';

    const mentors = await fetchQuery("SELECT id, username, password, role FROM users WHERE role = 'mentor' ORDER BY username ASC");
    const students = await fetchQuery("SELECT id, username, password, role FROM users WHERE role = 'student' ORDER BY username ASC");

    mentorsBody.innerHTML = '';
    if (mentors.length === 0) {
        mentorsBody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">No mentors found.</td></tr>';
    } else {
        mentors.forEach(m => {
            mentorsBody.innerHTML += `
                <tr>
                    <td><strong>${m.username}</strong></td>
                    <td>
                        <span id="user-pass-text-${m.id}">${m.password}</span>
                        <input type="text" id="user-pass-input-${m.id}" class="form-control hidden" style="max-width:150px; padding: 0.25rem;" value="${m.password}">
                    </td>
                    <td>
                        <button id="edit-user-btn-${m.id}" class="btn btn-outline" style="padding: 0.25rem 0.75rem; font-size: 0.8rem;" onclick="enableEditUser(${m.id})">Edit Password</button>
                        <button id="save-user-btn-${m.id}" class="btn btn-primary hidden" style="padding: 0.25rem 0.75rem; font-size: 0.8rem;" onclick="saveEditUser(${m.id})">Save</button>
                        <button class="btn btn-danger" style="padding: 0.25rem 0.75rem; font-size: 0.8rem; margin-left: 0.5rem;" onclick="deleteUser(${m.id}, '${m.role}', '${m.username}')">Delete</button>
                    </td>
                </tr>
            `;
        });
    }

    studentsBody.innerHTML = '';
    if (students.length === 0) {
        studentsBody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">No students found.</td></tr>';
    } else {
        students.forEach(s => {
            studentsBody.innerHTML += `
                <tr>
                    <td><strong>${s.username}</strong></td>
                    <td>
                        <span id="user-pass-text-${s.id}">${s.password}</span>
                        <input type="text" id="user-pass-input-${s.id}" class="form-control hidden" style="max-width:150px; padding: 0.25rem;" value="${s.password}">
                    </td>
                    <td>
                        <button id="edit-user-btn-${s.id}" class="btn btn-outline" style="padding: 0.25rem 0.75rem; font-size: 0.8rem;" onclick="enableEditUser(${s.id})">Edit Password</button>
                        <button id="save-user-btn-${s.id}" class="btn btn-primary hidden" style="padding: 0.25rem 0.75rem; font-size: 0.8rem;" onclick="saveEditUser(${s.id})">Save</button>
                        <button class="btn btn-danger" style="padding: 0.25rem 0.75rem; font-size: 0.8rem; margin-left: 0.5rem;" onclick="deleteUser(${s.id}, '${s.role}', '${s.username}')">Delete</button>
                    </td>
                </tr>
            `;
        });
    }
}

async function loadEditGroupsList() {
    const tbody = document.getElementById('editGroupsBody');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Loading...</td></tr>';
    
    // Fetch all groups with their leader's username
    const groups = await fetchQuery(`
        SELECT g.id, g.group_name, g.status, u.username as leader_username 
        FROM project_groups g 
        LEFT JOIN users u ON g.leader_id = u.id 
        ORDER BY g.id DESC
    `);
    
    tbody.innerHTML = '';
    if (groups.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No groups found.</td></tr>';
        return;
    }
    
    groups.forEach(g => {
        tbody.innerHTML += `
            <tr>
                <td>${g.id}</td>
                <td><strong>${g.group_name || 'Unnamed Group'}</strong></td>
                <td>${g.leader_username || 'Unknown'}</td>
                <td>${g.status}</td>
                <td>
                    <button class="btn btn-danger" style="padding: 0.25rem 0.75rem; font-size: 0.8rem;" onclick="deleteGroup(${g.id})">Delete Group</button>
                </td>
            </tr>
        `;
    });
}

async function deleteGroup(groupId) {
    if (!confirm("Are you SURE you want to completely delete this group? All associated students, component requests, and data will be lost. This cannot be undone.")) return;

    try {
        // 1. Fetch component requests to return inventory
        const requests = await fetchQuery("SELECT * FROM component_requests WHERE group_id = ?", [groupId]);
        for (let req of requests) {
            // If request was not rejected and not returned, the components are still deducted
            if (req.status !== 'Rejected' && req.admin_status !== 'Returned') {
                await runQuery("UPDATE components SET available_qty = available_qty + ? WHERE id = ?", [req.requested_qty, req.component_id]);
            }
        }
        
        // 2. Delete component requests
        await runQuery("DELETE FROM component_requests WHERE group_id = ?", [groupId]);
        
        // 3. Delete students
        await runQuery("DELETE FROM students WHERE group_id = ?", [groupId]);
        
        // 4. Delete the group
        await runQuery("DELETE FROM project_groups WHERE id = ?", [groupId]);
        
        loadEditGroupsList();
        
        // Refresh groups in memory/DOM if necessary
        if (!document.getElementById('students-directory-section').classList.contains('hidden')) {
            loadGroups();
        }
    } catch(e) {
        console.error(e);
        alert("Error deleting group.");
    }
}

// --- Assignee Section Logic ---
let currentFilteredGroupsForAssignment = [];

async function loadAssigneeSection() {
    // Load mentors into the dropdown from users table
    const mentors = await fetchQuery("SELECT * FROM users WHERE role = 'mentor' ORDER BY username ASC");
    const select = document.getElementById('assignMentorSelect');
    select.innerHTML = '<option value="">-- Choose Mentor --</option>';
    mentors.forEach(m => {
        select.innerHTML += `<option value="${m.id}">${m.username}</option>`;
    });
    previewAssignGroups();
}

async function previewAssignGroups() {
    const yearSelect = document.getElementById('assignAcademicYear').value;
    const yearLvlSelect = document.getElementById('assignYear').value;
    const semSelect = document.getElementById('assignSem').value;
    const divInput = document.getElementById('assignDiv').value.trim().toLowerCase();
    
    let sql = "SELECT * FROM project_groups WHERE 1=1";
    let params = [];

    if (yearSelect !== 'All') { sql += " AND academic_year = ?"; params.push(yearSelect); }
    if (yearLvlSelect !== 'All') { sql += " AND year = ?"; params.push(yearLvlSelect); }
    if (semSelect !== 'All') { sql += " AND sem = ?"; params.push(semSelect); }
    if (divInput) { sql += " AND LOWER(division) = ?"; params.push(divInput); }

    sql += " ORDER BY id ASC"; 

    currentFilteredGroupsForAssignment = await fetchQuery(sql, params);
    
    const preview = document.getElementById('assignGroupsPreview');
    if (currentFilteredGroupsForAssignment.length === 0) {
        preview.innerHTML = "No groups found for the selected filters.";
    } else {
        preview.innerHTML = `Found ${currentFilteredGroupsForAssignment.length} groups. (Indexed 1 to ${currentFilteredGroupsForAssignment.length})`;
    }
}

async function applyBatchAssignment() {
    const fromIdx = parseInt(document.getElementById('assignFrom').value);
    const toIdx = parseInt(document.getElementById('assignTo').value);
    const mentorId = document.getElementById('assignMentorSelect').value;

    if (!fromIdx || !toIdx || isNaN(fromIdx) || isNaN(toIdx)) {
        alert("Please enter valid 'From' and 'To' group numbers.");
        return;
    }
    
    if (fromIdx > toIdx) {
        alert("'From' number cannot be greater than 'To' number.");
        return;
    }

    if (!mentorId) {
        alert("Please select a mentor.");
        return;
    }

    if (currentFilteredGroupsForAssignment.length === 0) {
        alert("No groups available to assign.");
        return;
    }

    let assignedCount = 0;
    // Arrays are 0-indexed, but UI is 1-indexed (1 to N)
    for (let i = fromIdx - 1; i < toIdx; i++) {
        if (i >= 0 && i < currentFilteredGroupsForAssignment.length) {
            const group = currentFilteredGroupsForAssignment[i];
            await runQuery("UPDATE project_groups SET mentor_id = ? WHERE id = ?", [mentorId, group.id]);
            assignedCount++;
        }
    }

    alert(`Successfully assigned mentor to ${assignedCount} groups!`);
    
    document.getElementById('assignFrom').value = '';
    document.getElementById('assignTo').value = '';
    
    // Refresh group view if necessary
    if (!document.getElementById('students-directory-section').classList.contains('hidden')) {
        loadGroups();
    }
    loadEditGroupsList();
}


