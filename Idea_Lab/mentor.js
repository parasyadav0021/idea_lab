// mentor.js

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
    
    // We allow mentor and admin to use this script for simplicity
    if (currentUser.role !== 'mentor' && currentUser.role !== 'admin') {
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('welcomeUser').textContent = `Welcome, ${currentUser.username}`;

    await initDB();
    await loadGroups();
});

function logout() {
    localStorage.removeItem('currentUser');
    window.location.href = 'index.html';
}

function setTab(tabName) {
    currentTab = tabName;
    document.getElementById('tabActive').classList.toggle('active', tabName === 'Active');
    document.getElementById('tabCompleted').classList.toggle('active', tabName === 'Completed');
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

    let sql = "SELECT * FROM project_groups";
    let params = [];
    let conditions = [];

    // Filter by tab status
    if (currentTab === 'Active') {
        conditions.push("status = ?");
        params.push('Active');
    } else {
        conditions.push("status != ?");
        params.push('Active');
    }

    // Filter by assigned mentor
    if (currentUser.role === 'mentor') {
        conditions.push("mentor_id = ?");
        params.push(currentUser.id);
    }

    if (yearSelect !== 'All') {
        conditions.push("academic_year = ?");
        params.push(yearSelect);
    }
    if (yearLvlSelect !== 'All') {
        conditions.push("year = ?");
        params.push(yearLvlSelect);
    }
    if (semSelect !== 'All') {
        conditions.push("sem = ?");
        params.push(semSelect);
    }
    if (divInput) {
        conditions.push("LOWER(division) = ?");
        params.push(divInput);
    }

    if (conditions.length > 0) {
        sql += " WHERE " + conditions.join(" AND ");
    }
    
    sql += " ORDER BY id DESC";

    const groups = await fetchQuery(sql, params);
    
    if (groups.length === 0) {
        container.innerHTML = `<p class="text-muted text-center mt-4">No ${currentTab.toLowerCase()} groups found matching the criteria.</p>`;
        return;
    }

    container.innerHTML = '';

    for (let i = 0; i < groups.length; i++) {
        let group = groups[i];
        
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
            ORDER BY r.id ASC
        `, [group.id]);
        
        let componentsHtml = '';
        if (requests.length > 0) {
            componentsHtml += `
                <h4 class="mt-6 mb-2">Requested Components</h4>
                <div class="component-grid comp-header">
                    <div>Component Name</div>
                    <div>Total Qty</div>
                    <div>Available</div>
                    <div>Requested Qty</div>
                    <div>Time</div>
                    <div>Action</div>
                </div>
            `;
            requests.forEach(req => {
                let actionHtml = '';
                if (req.status === 'Pending') {
                    actionHtml = `
                        <button class="btn btn-primary" style="padding: 0.25rem 0.75rem; font-size: 0.8rem; margin-right: 0.5rem;" onclick="approveRequest(${req.id})">Approve</button>
                        <button class="btn btn-outline" style="padding: 0.25rem 0.75rem; font-size: 0.8rem; border-color: var(--danger); color: var(--danger);" onclick="rejectRequest(${req.id}, ${req.component_id}, ${req.requested_qty})">Reject</button>
                    `;
                } else {
                    let color = req.status === 'Approved' ? 'var(--secondary)' : 'var(--danger)';
                    actionHtml = `<span style="color: ${color}; font-weight: 600;">${req.status}</span>`;
                }
                
                componentsHtml += `
                    <div class="component-grid">
                        <div><strong>${req.component_name}</strong></div>
                        <div>${req.total_qty}</div>
                        <div>${req.available_qty}</div>
                        <div>${req.requested_qty}</div>
                        <div>${req.request_time ? req.request_time : 'N/A'}</div>
                        <div>${actionHtml}</div>
                    </div>
                `;
            });
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
                    
                    ${currentTab === 'Active' ? `
                        <div class="mt-6 pt-4" style="border-top: 1px solid var(--border); text-align: right;">
                            <button class="btn btn-primary" onclick="approveGroup(${group.id})">Approve Group</button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }
}

async function approveRequest(reqId) {
    if (!confirm('Approve this component request?')) return;
    await runQuery("UPDATE component_requests SET status = 'Approved' WHERE id = ?", [reqId]);
    loadGroups(); // Refresh
}

async function rejectRequest(reqId, compId, requestedQty) {
    if (!confirm('Reject this component request?')) return;
    // Update status
    await runQuery("UPDATE component_requests SET status = 'Rejected' WHERE id = ?", [reqId]);
    // Restock component
    await runQuery("UPDATE components SET available_qty = available_qty + ? WHERE id = ?", [requestedQty, compId]);
    loadGroups(); // Refresh
}

async function approveGroup(groupId) {
    if (!confirm('Are you sure you want to approve this group? It will be moved to the Completed section and sent to the Admin for component distribution.')) return;
    await runQuery("UPDATE project_groups SET status = 'Approved' WHERE id = ?", [groupId]);
    loadGroups(); // Refresh list to move it out
}
