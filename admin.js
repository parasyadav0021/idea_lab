// admin.js

let currentUser = null;
let currentTab = 'Active';
let currentAdminOpenGroupId = null;

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
    await loadAdminStats();
    await loadGroups();
    await loadAdminComponents();
});

async function loadAdminStats() {
    const result = await callAPI('admin_get_stats');
    if (result.success) {
        document.getElementById('stat-pending-returns').textContent = result.data.pending_returns;
    }
}

async function exportData(type) {
    showToast('Preparing export...', 'success');
    const result = await callAPI('admin_export_csv', { type });
    if (result.success) {
        const blob = new Blob([result.data], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `idea_lab_${type}_export.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        showToast('Export successful!', 'success');
    } else {
        showToast("Export failed: " + (result.error || "Unknown error"), 'error');
    }
}

async function logout() {
    try {
        await callAPI('logout');
    } catch (e) {
        console.error("Logout request failed:", e);
    }
    localStorage.removeItem('currentUser');
    window.location.href = 'index.html';
}

function showAdminSection(sectionId) {
    // Hide all sections
    document.getElementById('students-directory-section').classList.add('hidden');
    document.getElementById('components-section').classList.add('hidden');
    document.getElementById('edit-section').classList.add('hidden');
    
    // Manage stats widget visibility
    if (sectionId === 'students-directory') {
        document.getElementById('admin-stats-section').classList.remove('hidden');
    } else {
        document.getElementById('admin-stats-section').classList.add('hidden');
    }

    // Remove active class from nav items
    document.getElementById('nav-students').classList.remove('active');
    document.getElementById('nav-components').classList.remove('active');
    document.getElementById('nav-edit').classList.remove('active');

    const pageTitle = document.getElementById('pageTitle');

    if (sectionId === 'students-directory') {
        document.getElementById('students-directory-section').classList.remove('hidden');
        document.getElementById('nav-students').classList.add('active');
        if (pageTitle) pageTitle.textContent = 'Project Directory';
        loadGroups();
    } else if (sectionId === 'components') {
        document.getElementById('components-section').classList.remove('hidden');
        document.getElementById('nav-components').classList.add('active');
        if (pageTitle) pageTitle.textContent = 'Inventory Management';
        loadAdminComponents();
    } else if (sectionId === 'edit') {
        document.getElementById('edit-section').classList.remove('hidden');
        document.getElementById('nav-edit').classList.add('active');
        if (pageTitle) pageTitle.textContent = 'System Administration';
        loadUsersList();
        loadEditGroupsList();
        loadAssigneeSection();
    }

    // Close mobile sidebar if open
    if (window.innerWidth <= 768 && document.getElementById('sidebar').classList.contains('open')) {
        toggleSidebar();
    }
}

function setTab(tabName) {
    currentTab = tabName;
    document.getElementById('tabActive').classList.toggle('active', tabName === 'Active');
    document.getElementById('tabReturn').classList.toggle('active', tabName === 'Return');
    document.getElementById('tabReturned').classList.toggle('active', tabName === 'Returned');
    loadGroups();
}

function toggleGroupDetails(groupId) {
    const detailsDiv = document.getElementById(`group-details-${groupId}`);
    if (detailsDiv.classList.contains('open')) {
        detailsDiv.classList.remove('open');
        currentAdminOpenGroupId = null;
    } else {
        // Close others
        document.querySelectorAll('.group-details.open').forEach(el => el.classList.remove('open'));
        detailsDiv.classList.add('open');
        currentAdminOpenGroupId = groupId;
    }
}

let allAdminGroups = [];
let currentAdminGroupPage = 1;
const adminGroupsPerPage = 10;

async function loadGroups() {
    const yearSelect = document.getElementById('filterAcademicYear').value;
    const yearLvlSelect = document.getElementById('filterYear').value;
    const semSelect = document.getElementById('filterSem').value;
    const divInput = document.getElementById('filterDiv').value.trim();
    
    const container = document.getElementById('groupsContainer');
    container.innerHTML = '<p class="text-muted text-center">Loading...</p>';

    const result = await callAPI('admin_get_groups', {
        tab: currentTab,
        academic_year: yearSelect,
        year: yearLvlSelect,
        sem: semSelect,
        division: divInput
    });

    allAdminGroups = result.data || [];
    currentAdminGroupPage = 1;
    renderGroupsPage();
}

function changeAdminGroupPage(page) {
    currentAdminGroupPage = page;
    renderGroupsPage();
}

function renderGroupsPage() {
    const container = document.getElementById('groupsContainer');
    const pagination = document.getElementById('groupsPagination');
    
    if (allAdminGroups.length === 0) {
        container.innerHTML = `<p class="text-muted text-center mt-4">No groups ready for administration matching the criteria.</p>`;
        if(pagination) pagination.innerHTML = '';
        return;
    }

    const totalPages = Math.ceil(allAdminGroups.length / adminGroupsPerPage);
    if (currentAdminGroupPage > totalPages) currentAdminGroupPage = totalPages;
    if (currentAdminGroupPage < 1) currentAdminGroupPage = 1;

    const startIdx = (currentAdminGroupPage - 1) * adminGroupsPerPage;
    const endIdx = startIdx + adminGroupsPerPage;
    const pageGroups = allAdminGroups.slice(startIdx, endIdx);

    container.innerHTML = '';

    for (let i = 0; i < pageGroups.length; i++) {
        let group = pageGroups[i];
        let displayIndex = startIdx + i + 1;
        
        // Fetch students
        const students = group.students || [];
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
                        <div>${escapeHTML(s.name)}</div>
                        <div>${escapeHTML(s.roll_no)}</div>
                        <div>${escapeHTML(s.email)}</div>
                        <div>${escapeHTML(s.phone)}</div>
                    </div>
                `;
            });
        } else {
            studentsHtml = '<p class="text-muted text-sm mb-4">No students added yet.</p>';
        }

        // Fetch component requests
        const requests = group.requests || []; 

        let componentsHtml = '';
        if (requests.length > 0) {
            componentsHtml += `
                <h4 class="mt-6 mb-2">Requested Components</h4>
                <div class="component-grid comp-header" style="grid-template-columns: ${currentTab === 'Active' ? '0.5fr 0.5fr 2fr 1fr 1fr 1fr' : '0.5fr 2fr 1fr 1.5fr'};">
                    <div></div>
                    ${currentTab === 'Active' ? '<div></div>' : ''}
                    <div>Component Name</div>
                    <div>Requested Qty</div>
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
                        actionHtml = `
                            <span style="color: var(--danger); font-weight: 600; margin-right: 0.5rem;">Rejected</span>
                            <button type="button" class="btn btn-outline" style="padding: 0.2rem 0.5rem; font-size: 0.7rem;" onclick="revertAdminRequest(${req.id}, ${req.component_id}, ${req.requested_qty})">Edit</button>
                        `;
                    }
                    
                    componentsHtml += `
                        <div>
                            <div class="component-grid" style="grid-template-columns: 0.5fr 0.5fr 2fr 1fr 1fr 1fr;">
                                <div><button type="button" class="chevron-btn" onclick="toggleTimestamps(this)" title="View Timestamps">▼</button></div>
                                <div style="display:flex; justify-content:center; align-items:center;">${checkboxHtml}</div>
                                <div><strong>${escapeHTML(req.component_name)}</strong></div>
                                <div>${req.requested_qty}</div>
                                <div><span style="color: ${statusColor}; font-weight: 600;">${displayStatus}</span></div>
                                <div>${actionHtml}</div>
                            </div>
                            <div class="timestamp-details">
                                <div class="timestamp-row"><span>Requisition Timestamp:</span> <span>${req.request_time ? req.request_time : 'N/A'}</span></div>
                                ${req.approval_time ? `<div class="timestamp-row"><span>Approval Timestamp:</span> <span>${req.approval_time}</span></div>` : ''}
                                ${req.issue_time ? `<div class="timestamp-row"><span>Issuance Timestamp:</span> <span>${req.issue_time}</span></div>` : ''}
                            </div>
                        </div>
                    `;
                } else {
                    // Return Tab rendering
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
                        <div>
                            <div class="component-grid" style="grid-template-columns: 0.5fr 2fr 1fr 1.5fr;">
                                <div><button type="button" class="chevron-btn" onclick="toggleTimestamps(this)" title="View Timestamps">▼</button></div>
                                <div><strong>${escapeHTML(req.component_name)}</strong></div>
                                <div>${req.requested_qty}</div>
                                <div>${actionHtml}</div>
                            </div>
                            <div class="timestamp-details">
                                <div class="timestamp-row"><span>Requisition Timestamp:</span> <span>${req.request_time ? req.request_time : 'N/A'}</span></div>
                                ${req.approval_time ? `<div class="timestamp-row"><span>Approval Timestamp:</span> <span>${req.approval_time}</span></div>` : ''}
                                ${req.issue_time ? `<div class="timestamp-row"><span>Issuance Timestamp:</span> <span>${req.issue_time}</span></div>` : ''}
                                ${req.return_time ? `<div class="timestamp-row"><span>Return Timestamp:</span> <span>${req.return_time}</span></div>` : ''}
                            </div>
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
                    <div>
                        <h4 style="margin: 0;">${displayIndex}- ${escapeHTML(group.group_name || 'Unnamed Group')}</h4>
                        <span style="font-size: 0.85rem; color: var(--text-muted); display: block; margin-top: 0.35rem;">Assigned Mentor: <strong style="color: var(--text-main);">${escapeHTML(group.mentor_username || 'Not assigned')}</strong></span>
                    </div>
                    <span class="badge" style="background: rgba(79, 70, 229, 0.1); color: var(--primary); padding: 0.25rem 0.75rem; border-radius: 999px; font-size: 0.8rem;">
                        ${escapeHTML(group.academic_year || 'Year N/A')} | Year ${escapeHTML(group.year || '-')}, Sem ${escapeHTML(group.sem || '-')} | Div: ${escapeHTML(group.division || '-')}
                    </span>
                </div>
                <div class="group-details" id="group-details-${group.id}">
                    <h4 class="mb-2">Students</h4>
                    ${studentsHtml}
                    
                    <h4 class="mt-6 mb-2">Problem Statement</h4>
                    <div style="background: rgba(255,255,255,0.02); padding: 1rem; border-radius: 8px; border: 1px solid var(--border);">
                        <strong>${escapeHTML(group.problem_statement || 'N/A')}</strong><br>
                        <span class="text-muted text-sm mt-2 block">${escapeHTML(group.description || 'No description provided.')}</span>
                    </div>

                    ${componentsHtml}
                </div>
            </div>
        `;
    }
    
    if (currentAdminOpenGroupId) {
        const detailsDiv = document.getElementById(`group-details-${currentAdminOpenGroupId}`);
        if (detailsDiv) {
            detailsDiv.classList.add('open');
        }
    }
    
    if (pagination && totalPages > 1) {
        let html = `<div style="display: flex; justify-content: center; gap: 10px; align-items: center; margin-top: 1.5rem;">`;
        html += `<button class="btn btn-outline" style="padding: 5px 15px;" ${currentAdminGroupPage === 1 ? 'disabled' : ''} onclick="changeAdminGroupPage(${currentAdminGroupPage - 1})">Prev</button>`;
        html += `<span style="color: var(--text-muted); font-size: 0.9rem;">Page ${currentAdminGroupPage} of ${totalPages}</span>`;
        html += `<button class="btn btn-outline" style="padding: 5px 15px;" ${currentAdminGroupPage === totalPages ? 'disabled' : ''} onclick="changeAdminGroupPage(${currentAdminGroupPage + 1})">Next</button>`;
        html += `</div>`;
        pagination.innerHTML = html;
    } else if (pagination) {
        pagination.innerHTML = '';
    }
}

async function saveAdminComponents(event, groupId) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    
    const checkedIds = [];
    for (let [key, value] of formData.entries()) {
        if (key.startsWith('comp_given_')) {
            checkedIds.push(parseInt(value));
        }
    }

    const result = await callAPI('admin_save_given_components', {
        group_id: groupId,
        checked_request_ids: checkedIds
    });

    if (result.success) {
        if (result.all_given) {
            showToast("All components given! Group moved to Return section.", "success");
        } else {
            showToast("Saved successfully!", "success");
        }
        loadGroups();
        loadAdminStats();
    } else {
        showToast("Failed to save components: " + (result.error || "Unknown error"), "error");
        loadGroups();
    }
}

async function returnComponent(reqId, compId, qty) {
    if (!confirm("Confirm component returned?")) return;
    
    const result = await callAPI('admin_return_component', {
        request_id: reqId,
        component_id: compId,
        requested_qty: qty
    });

    if (result.success) {
        if (result.all_returned) {
            showToast("All components returned! Group moved to Component Returned section.", "success");
        } else {
            showToast("Component returned.", "success");
        }
        loadGroups();
        loadAdminStats();
    } else {
        showToast("Failed to process component return: " + (result.error || "Unknown error"), "error");
    }
}

async function rejectAdminRequest(reqId, compId, requestedQty) {
    if (!confirm('Reject this component request?')) return;
    
    const result = await callAPI('admin_reject_request', {
        request_id: reqId,
        component_id: compId,
        requested_qty: requestedQty
    });

    if (result.success) {
        loadGroups();
        showToast("Request rejected.", "success");
    } else {
        showToast("Failed to reject request: " + (result.error || "Unknown error"), "error");
    }
}

async function revertAdminRequest(reqId, compId, requestedQty) {
    if (!confirm('Revert this request back to Approved?')) return;
    
    const result = await callAPI('admin_revert_request', {
        request_id: reqId,
        component_id: compId,
        requested_qty: requestedQty
    });

    if (result.success) {
        loadGroups();
        showToast("Request reverted to Approved.", "success");
    } else {
        showToast("Failed to revert request: " + (result.error || "Unknown error"), "error");
    }
}

// --- Components Section Logic ---

async function loadAdminComponents() {
    const searchStr = document.getElementById('adminComponentSearch').value.trim();
    const tbody = document.getElementById('componentsBody');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center">Loading...</td></tr>';

    const result = await callAPI('admin_get_components', { search: searchStr });
    const comps = result.data || [];
    
    tbody.innerHTML = '';
    if (comps.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No components found.</td></tr>';
        return;
    }

    comps.forEach(c => {
        tbody.innerHTML += `
            <tr>
                <td data-label="Component Name"><strong>${escapeHTML(c.name)}</strong></td>
                <td data-label="Total Quantity">
                    <span id="qty-text-${c.id}">${c.total_qty}</span>
                    <input type="number" id="qty-input-${c.id}" class="form-control hidden" style="max-width:80px; padding: 0.25rem;" value="${c.total_qty}">
                </td>
                <td data-label="Available Quantity">${c.available_qty}</td>
                <td data-label="Actions">
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

function toggleTimestamps(btn) {
    btn.classList.toggle('open');
    const details = btn.closest('div.component-grid').nextElementSibling;
    if (details.classList.contains('open')) {
        details.classList.remove('open');
    } else {
        details.classList.add('open');
    }
}

async function saveNewComponent() {
    const name = document.getElementById('newCompName').value.trim();
    const qty = parseInt(document.getElementById('newCompQty').value);

    if (!name || isNaN(qty) || qty <= 0) {
        showToast("Please enter a valid name and quantity greater than 0.", "error");
        return;
    }

    const result = await callAPI('admin_add_component', { name, qty });
    if (result.success) {
        hideAddComponentModal();
        loadAdminComponents();
        showToast("Component added successfully.", "success");
    } else {
        showToast("Failed to add component: " + (result.error || "Unknown error"), "error");
    }
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
        showToast("Invalid quantity.", "error");
        return;
    }

    const result = await callAPI('admin_edit_component_qty', { id: compId, new_total: newTotal });
    if (result.success) {
        loadAdminComponents();
        showToast("Quantity updated.", "success");
    } else {
        showToast("Failed to update quantity: " + (result.error || "Unknown error"), "error");
    }
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
        showToast("Please enter both username and password.", "error");
        return;
    }

    const result = await callAPI('admin_add_user', { username: name, password: pass, role });
    if (result.success) {
        hideAddUserModal();
        loadUsersList();
        showToast("User added.", "success");
    } else {
        showToast("Failed to save user: " + (result.error || "Username already exists"), "error");
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
        showToast("Password cannot be empty.", "error");
        return;
    }

    const result = await callAPI('admin_edit_user_password', { id, password: newPass });
    if (result.success) {
        loadUsersList();
        showToast("Password updated.", "success");
    } else {
        showToast("Failed to update password: " + (result.error || "Unknown error"), "error");
    }
}

async function deleteUser(id, role, username) {
    if (!confirm(`Are you sure you want to delete the user '${username}'?`)) return;
    
    const result = await callAPI('admin_delete_user', { id });
    if (result.success) {
        loadUsersList();
        showToast("User deleted.", "success");
    } else {
        showToast("Failed to delete user: " + (result.error || "Unknown error"), "error");
    }
}

async function loadUsersList() {
    const mentorsBody = document.getElementById('mentorsBody');
    const studentsBody = document.getElementById('studentsBody');
    
    mentorsBody.innerHTML = '<tr><td colspan="3" class="text-center">Loading...</td></tr>';
    studentsBody.innerHTML = '<tr><td colspan="3" class="text-center">Loading...</td></tr>';

    const result = await callAPI('admin_get_users');
    if (result.error) return;

    const mentors = result.data.mentors || [];
    const students = result.data.students || [];

    mentorsBody.innerHTML = '';
    if (mentors.length === 0) {
        mentorsBody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">No mentors found.</td></tr>';
    } else {
        mentors.forEach(m => {
            mentorsBody.innerHTML += `
                <tr>
                    <td data-label="Username"><strong>${escapeHTML(m.username)}</strong></td>
                    <td data-label="Password">
                        <span id="user-pass-text-${m.id}">${m.password}</span>
                        <input type="text" id="user-pass-input-${m.id}" class="form-control hidden" style="max-width:150px; padding: 0.25rem;" value="${m.password}">
                    </td>
                    <td data-label="Actions">
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
                    <td data-label="Username"><strong>${escapeHTML(s.username)}</strong></td>
                    <td data-label="Password">
                        <span id="user-pass-text-${s.id}">${s.password}</span>
                        <input type="text" id="user-pass-input-${s.id}" class="form-control hidden" style="max-width:150px; padding: 0.25rem;" value="${s.password}">
                    </td>
                    <td data-label="Actions">
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
    
    const result = await callAPI('admin_get_edit_groups');
    const groups = result.data || [];
    
    tbody.innerHTML = '';
    if (groups.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No groups found.</td></tr>';
        return;
    }
    
    groups.forEach(g => {
        tbody.innerHTML += `
            <tr>
                <td data-label="Group ID">${g.id}</td>
                <td data-label="Group Name"><strong>${escapeHTML(g.group_name || 'Unnamed Group')}</strong></td>
                <td data-label="Leader">${escapeHTML(g.leader_username || 'Unknown')}</td>
                <td data-label="Status">${g.status}</td>
                <td data-label="Actions">
                    <button class="btn btn-danger" style="padding: 0.25rem 0.75rem; font-size: 0.8rem;" onclick="deleteGroup(${g.id})">Delete Group</button>
                </td>
            </tr>
        `;
    });
}

async function deleteGroup(groupId) {
    if (!confirm("Are you SURE you want to completely delete this group? All associated students, component requests, and data will be lost. This cannot be undone.")) return;

    const result = await callAPI('admin_delete_group', { group_id: groupId });
    if (result.success) {
        loadEditGroupsList();
        if (!document.getElementById('students-directory-section').classList.contains('hidden')) {
            loadGroups();
        }
        showToast("Group deleted.", "success");
    } else {
        showToast("Failed to delete group: " + (result.error || "Unknown error"), "error");
    }
}

// --- Assignee Section Logic ---
let currentFilteredGroupsForAssignment = [];

async function loadAssigneeSection() {
    const result = await callAPI('get_mentors');
    const mentors = result.data || [];
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
    const divInput = document.getElementById('assignDiv').value.trim();
    
    const preview = document.getElementById('assignGroupsPreview');
    if (yearSelect === 'All' || yearLvlSelect === 'All' || semSelect === 'All' || !divInput) {
        preview.innerHTML = "Please select specific Academic Year, Year, Semester, and Division to assign mentors.";
        preview.style.color = "var(--danger)";
    } else {
        preview.innerHTML = `Ready to pre-assign mentors for Academic Year ${yearSelect}, Year ${yearLvlSelect}, Sem ${semSelect}, Div ${divInput}. Use the form below to assign Group Numbers.`;
        preview.style.color = "var(--secondary)";
    }
}

async function applyBatchAssignment() {
    const fromIdx = parseInt(document.getElementById('assignFrom').value);
    const toIdx = parseInt(document.getElementById('assignTo').value);
    const mentorId = document.getElementById('assignMentorSelect').value;

    if (!fromIdx || !toIdx || isNaN(fromIdx) || isNaN(toIdx)) {
        showToast("Please enter valid 'From' and 'To' group numbers.", "error");
        return;
    }
    
    if (fromIdx > toIdx) {
        showToast("'From' number cannot be greater than 'To' number.", "error");
        return;
    }

    if (!mentorId) {
        showToast("Please select a mentor.", "error");
        return;
    }

    const yearSelect = document.getElementById('assignAcademicYear').value;
    const yearLvlSelect = document.getElementById('assignYear').value;
    const semSelect = document.getElementById('assignSem').value;
    const divInput = document.getElementById('assignDiv').value.trim();

    const result = await callAPI('admin_apply_batch_assignment', {
        from_idx: fromIdx,
        to_idx: toIdx,
        mentor_id: mentorId,
        academic_year: yearSelect,
        year: yearLvlSelect,
        sem: semSelect,
        division: divInput
    });

    if (result.success) {
        showToast(`Successfully assigned mentor to ${result.assigned_count} groups!`, "success");
        document.getElementById('assignFrom').value = '';
        document.getElementById('assignTo').value = '';
        if (!document.getElementById('students-directory-section').classList.contains('hidden')) {
            loadGroups();
        }
        loadEditGroupsList();
    } else {
        showToast("Failed to execute batch assignment: " + (result.error || "Unknown error"), "error");
    }
}
