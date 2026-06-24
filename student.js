// student.js

let currentUser = null;
let currentGroupId = null;
let groupInfoSaved = false;

document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication
    const userStr = localStorage.getItem('currentUser');
    if (!userStr) {
        window.location.href = 'index.html';
        return;
    }
    currentUser = JSON.parse(userStr);
    if (currentUser.role !== 'student') {
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('welcomeUser').textContent = `Welcome, ${currentUser.username}`;

    await initDB();
    await initializeData();
    
    // Group Form Submit Handler
    document.getElementById('groupForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveGroupDetails();
        toggleEditMode(false);
    });
});

async function logout() {
    try {
        await callAPI('logout');
    } catch (e) {
        console.error("Logout request failed:", e);
    }
    localStorage.removeItem('currentUser');
    window.location.href = 'index.html';
}

function showSection(sectionId) {
    // Allow navigation but show a warning if trying to request
    if (sectionId === 'component-selection' && !groupInfoSaved) {
        document.getElementById('componentsList').innerHTML = '<p class="text-muted text-center mt-4" style="color: var(--danger);">Please complete and save your Project Information details first before requesting components.</p>';
    }
    
    document.querySelectorAll('.section-card').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    
    document.getElementById(sectionId).classList.remove('hidden');
    event.currentTarget.classList.add('active');
    
    // Update the page title
    document.getElementById('pageTitle').textContent = event.currentTarget.textContent;

    if (sectionId === 'component-selection') {
        loadComponents();
    } else if (sectionId === 'order-history') {
        loadOrderHistory();
    }

    // Close mobile sidebar if open
    if (window.innerWidth <= 768 && document.getElementById('sidebar').classList.contains('open')) {
        toggleSidebar();
    }
}

let allMentors = [];

async function initializeData() {
    await loadMentors();
    await loadGroupDetails();
}

async function loadMentors() {
    const result = await callAPI('get_mentors');
    allMentors = result.data || [];
}

async function loadGroupDetails() {
    const result = await callAPI('get_group_details');
    if (result.error) return;

    const group = result.data.group;
    currentGroupId = group.id;
    groupInfoSaved = !!(group.group_name && group.branch && group.division && group.problem_statement);

    document.getElementById('academicYear').value = group.academic_year || '2025-26';
    document.getElementById('year').value = group.year || '1';
    document.getElementById('sem').value = group.sem || '1';
    document.getElementById('branch').value = group.branch || '';
    document.getElementById('division').value = group.division || '';
    
    // Populate Group Numbers 1-16
    const groupNameSelect = document.getElementById('groupName');
    if (groupNameSelect.options.length <= 1) {
        for (let i = 1; i <= 16; i++) {
            groupNameSelect.innerHTML += `<option value="${i}">Group ${i}</option>`;
        }
    }
    groupNameSelect.value = group.group_name || '';
    
    // Display assigned mentor name (read-only, assigned by admin)
    const assignedMentor = allMentors.find(m => m.id == group.mentor_id);
    document.getElementById('mentorName').value = assignedMentor ? assignedMentor.username : 'Not yet assigned';
    document.getElementById('problemStatement').value = group.problem_statement || '';
    document.getElementById('description').value = group.description || '';

    // Load members
    const members = result.data.members || [];
    const container = document.getElementById('membersContainer');
    container.innerHTML = '';
    
    members.forEach(member => {
        container.innerHTML += createMemberRowHTML(member);
    });

    // Enable edit mode automatically if it's the first time (no group name)
    if (!group.group_name) {
        toggleEditMode(true);
        const cancelBtn = document.getElementById('cancelBtn');
        if (cancelBtn) cancelBtn.style.display = 'none';
    } else {
        const cancelBtn = document.getElementById('cancelBtn');
        if (cancelBtn) cancelBtn.style.display = 'inline-block';
    }
}

function createMemberRowHTML(member, isEditing = false) {
    const disabled = isEditing ? '' : 'disabled';
    return `
        <div class="members-grid member-row" data-id="${member.id || ''}">
            <input type="text" class="form-control mem-name" value="${escapeHTML(member.name || '')}" placeholder="Name" ${disabled} required>
            <input type="text" class="form-control mem-roll" value="${escapeHTML(member.roll_no || '')}" placeholder="Roll No" ${disabled} required>
            <input type="email" class="form-control mem-email" value="${escapeHTML(member.email || '')}" placeholder="Email" ${disabled} required>
            <input type="text" class="form-control mem-phone" value="${escapeHTML(member.phone || '')}" placeholder="Phone" ${disabled} required>
            ${isEditing ? `<button type="button" class="btn btn-danger" onclick="this.parentElement.remove()">Remove</button>` : '<div>-</div>'}
        </div>
    `;
}

function toggleEditMode(forceState) {
    const isEditing = forceState !== undefined ? forceState : document.getElementById('year').disabled;
    
    const controls = document.querySelectorAll('#groupForm .form-control:not(#mentorId)');
    controls.forEach(c => c.disabled = !isEditing);

    const memberInputs = document.querySelectorAll('.member-row input');
    memberInputs.forEach(input => input.disabled = !isEditing);
    
    // Re-render member actions (Remove buttons vs dash)
    const memberRows = document.querySelectorAll('.member-row');
    memberRows.forEach(row => {
        const actionDiv = row.lastElementChild;
        if (isEditing) {
            actionDiv.outerHTML = `<button type="button" class="btn btn-danger" onclick="this.parentElement.remove()">Remove</button>`;
        } else {
            actionDiv.outerHTML = `<div>-</div>`;
        }
    });

    if (isEditing) {
        document.getElementById('saveActions').classList.remove('hidden');
        document.getElementById('addMemberBtn').classList.remove('hidden');
        document.getElementById('editGroupBtn').classList.add('hidden');
    } else {
        document.getElementById('saveActions').classList.add('hidden');
        document.getElementById('addMemberBtn').classList.add('hidden');
        document.getElementById('editGroupBtn').classList.remove('hidden');
    }
}

function cancelEdit() {
    toggleEditMode(false);
    loadGroupDetails(); // reload original data
}

function addMemberRow() {
    const container = document.getElementById('membersContainer');
    const rows = container.querySelectorAll('.member-row');
    if (rows.length >= 5) {
        showToast("Maximum 5 members allowed.", "error");
        return;
    }
    container.insertAdjacentHTML('beforeend', createMemberRowHTML({}, true));
}

async function saveGroupDetails() {
    const academicYear = document.getElementById('academicYear').value;
    const year = document.getElementById('year').value;
    const sem = document.getElementById('sem').value;
    const branch = document.getElementById('branch').value;
    const division = document.getElementById('division').value;
    const groupName = document.getElementById('groupName').value;
    const problemStatement = document.getElementById('problemStatement').value;
    const description = document.getElementById('description').value;

    const members = [];
    const rows = document.querySelectorAll('.member-row');
    for (const row of rows) {
        const name = row.querySelector('.mem-name').value;
        const roll = row.querySelector('.mem-roll').value;
        const email = row.querySelector('.mem-email').value;
        const phone = row.querySelector('.mem-phone').value;
        members.push({ name, roll_no: roll, email, phone });
    }

    const result = await callAPI('save_group_details', {
        academic_year: academicYear,
        year: year,
        sem: sem,
        branch: branch,
        division: division,
        group_name: groupName,
        problem_statement: problemStatement,
        description: description,
        members: members
    });

    if (result.success) {
        showToast('Group details saved successfully!', "success");
    } else {
        showToast('Failed to save group details: ' + (result.error || 'Unknown error'), "error");
    }
    
    await loadGroupDetails(); // Refresh
}

// === Component Selection Logic ===
let allComponents = [];

async function loadComponents() {
    const result = await callAPI('get_components');
    allComponents = result.data || [];
    renderComponents(allComponents);
}

function filterComponents() {
    const query = document.getElementById('componentSearch').value.toLowerCase();
    const filtered = allComponents.filter(c => c.name.toLowerCase().includes(query));
    renderComponents(filtered);
}

function renderComponents(components) {
    const list = document.getElementById('componentsList');
    list.innerHTML = '';
    
    if (components.length === 0) {
        list.innerHTML = '<p class="text-muted text-center mt-4">No components found.</p>';
        return;
    }

    components.forEach(comp => {
        list.innerHTML += `
            <div class="component-grid">
                <div><strong>${escapeHTML(comp.name)}</strong></div>
                <div>${comp.total_qty}</div>
                <div style="color: ${comp.available_qty > 0 ? 'var(--secondary)' : 'var(--danger)'}">${comp.available_qty}</div>
                <div>
                    <input type="number" id="qty-${comp.id}" class="form-control" min="1" max="${comp.available_qty}" value="1" style="width: 80px;" ${comp.available_qty === 0 ? 'disabled' : ''}>
                </div>
                <div>
                    ${!groupInfoSaved ? 
                        `<button class="btn btn-outline" disabled title="Fill group details first" style="opacity:0.5;">Request</button>` :
                        (comp.available_qty > 0 ? 
                            `<button class="btn btn-primary" onclick="requestComponent(${comp.id})">Request</button>` : 
                            `<button class="btn btn-outline" disabled>Out of Stock</button>`
                        )
                    }
                </div>
            </div>
        `;
    });
}

async function requestComponent(compId) {
    const qtyInput = document.getElementById(`qty-${compId}`);
    const qty = parseInt(qtyInput.value);
    
    if (isNaN(qty) || qty <= 0) {
        showToast("Please enter a valid quantity.", "error");
        return;
    }

    const result = await callAPI('request_component', {
        component_id: compId,
        qty: qty
    });

    if (result.success) {
        showToast("Component requested successfully!", "success");
    } else {
        showToast("Failed to request component: " + (result.error || "Unknown error"), "error");
    }
    
    loadComponents(); // Refresh list
}

// === Order History Logic ===
async function loadOrderHistory() {
    const result = await callAPI('get_order_history');
    const requests = result.data || [];

    const tbody = document.getElementById('historyBody');
    tbody.innerHTML = '';

    if (requests.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No requests found.</td></tr>';
        return;
    }

    requests.forEach(req => {
        let statusColor = 'var(--text-muted)';
        if (req.status === 'Approved') statusColor = 'var(--secondary)';
        if (req.status === 'Rejected') statusColor = 'var(--danger)';
        if (req.status === 'Pending') statusColor = '#F59E0B'; // Amber

        tbody.innerHTML += `
            <tr>
                <td data-label="Component Name">${escapeHTML(req.component_name)}</td>
                <td data-label="Requested Qty">${req.requested_qty}</td>
                <td data-label="Date & Time">${req.request_time || '-'}</td>
                <td data-label="Status" style="color: ${statusColor}; font-weight: 600;">${req.status}</td>
                <td data-label="Actions">
                    ${req.status === 'Pending' ? 
                        `<button class="btn btn-outline" onclick="cancelRequest(${req.id}, ${req.component_id}, ${req.requested_qty})">Cancel</button>` : 
                        '-'
                    }
                </td>
            </tr>
        `;
    });
}

async function cancelRequest(requestId, compId, qty) {
    if (!confirm("Are you sure you want to cancel this request?")) return;

    const result = await callAPI('cancel_request', {
        request_id: requestId
    });

    if (result.success) {
        showToast("Request cancelled.", "success");
    } else {
        showToast("Failed to cancel request: " + (result.error || "Unknown error"), "error");
    }
    
    loadOrderHistory(); // Refresh history
}

async function downloadSlip() {
    showToast("Generating PDF...", "success");

    // Fetch latest group details and order history to ensure we have the latest
    const groupResult = await callAPI('get_group_details');
    const orderResult = await callAPI('get_order_history');

    if (groupResult.error || orderResult.error) {
        showToast("Failed to fetch data for PDF.", "error");
        return;
    }

    const group = groupResult.data.group;
    const members = groupResult.data.members || [];
    const requests = orderResult.data || [];
    
    // Filter only approved requests
    const approvedRequests = requests.filter(r => r.status === 'Approved');
    
    if (approvedRequests.length === 0) {
        showToast("No approved components to print.", "error");
        return;
    }

    // Create a hidden div to render the PDF content
    const printDiv = document.createElement('div');
    printDiv.style.padding = '40px';
    printDiv.style.fontFamily = 'Arial, sans-serif';
    printDiv.style.color = '#000';
    printDiv.style.background = '#fff';

    let html = `
        <div style="text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px;">
            <h1 style="margin: 0; font-size: 24px;">IDEA LAB</h1>
            <h2 style="margin: 5px 0 0 0; font-size: 18px; color: #555;">Component Requisition Slip</h2>
        </div>
        
        <div style="display: flex; justify-content: space-between; margin-bottom: 30px;">
            <div>
                <p><strong>Group Name:</strong> ${escapeHTML(group.group_name)}</p>
                <p><strong>Academic Year:</strong> ${escapeHTML(group.academic_year)}</p>
                <p><strong>Branch/Div:</strong> ${escapeHTML(group.branch)} / ${escapeHTML(group.division)}</p>
            </div>
            <div style="text-align: right;">
                <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
                <p><strong>Mentor:</strong> ${escapeHTML(document.getElementById('mentorName').value)}</p>
            </div>
        </div>

        <h3 style="border-bottom: 1px solid #ccc; padding-bottom: 5px;">Project Details</h3>
        <p><strong>Statement:</strong> ${escapeHTML(group.problem_statement)}</p>
        
        <h3 style="border-bottom: 1px solid #ccc; padding-bottom: 5px; margin-top: 30px;">Team Members</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
            <thead>
                <tr style="background: #f5f5f5;">
                    <th style="border: 1px solid #ccc; padding: 8px; text-align: left;">Name</th>
                    <th style="border: 1px solid #ccc; padding: 8px; text-align: left;">Roll No</th>
                </tr>
            </thead>
            <tbody>
    `;

    members.forEach(m => {
        html += `
            <tr>
                <td style="border: 1px solid #ccc; padding: 8px;">${escapeHTML(m.name)}</td>
                <td style="border: 1px solid #ccc; padding: 8px;">${escapeHTML(m.roll_no)}</td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>

        <h3 style="border-bottom: 1px solid #ccc; padding-bottom: 5px;">Approved Components</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 50px;">
            <thead>
                <tr style="background: #f5f5f5;">
                    <th style="border: 1px solid #ccc; padding: 8px; text-align: left;">S.No</th>
                    <th style="border: 1px solid #ccc; padding: 8px; text-align: left;">Component Name</th>
                    <th style="border: 1px solid #ccc; padding: 8px; text-align: left;">Qty</th>
                </tr>
            </thead>
            <tbody>
    `;

    approvedRequests.forEach((req, idx) => {
        html += `
            <tr>
                <td style="border: 1px solid #ccc; padding: 8px;">${idx + 1}</td>
                <td style="border: 1px solid #ccc; padding: 8px;">${escapeHTML(req.component_name)}</td>
                <td style="border: 1px solid #ccc; padding: 8px;">${req.requested_qty}</td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>

        <div style="display: flex; justify-content: space-between; margin-top: 80px;">
            <div style="text-align: center;">
                <p>_______________________</p>
                <p>Student Signature</p>
            </div>
            <div style="text-align: center;">
                <p>_______________________</p>
                <p>Lab Incharge Signature</p>
            </div>
        </div>
    `;

    printDiv.innerHTML = html;
    const opt = {
        margin:       0.5,
        filename:     `Requisition_Slip_Group_${escapeHTML(group.group_name)}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2 },
        jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(printDiv).save().then(() => {
        showToast("PDF downloaded!", "success");
    }).catch(err => {
        console.error(err);
        showToast("Error generating PDF.", "error");
    });
}
