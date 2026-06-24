<?php
// api.php
// Secure action-based API router with session management

// CORS Headers supporting credentials (required for sessions)
if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: {$_SERVER['HTTP_ORIGIN']}");
    header('Access-Control-Allow-Credentials: true');
} else {
    header('Access-Control-Allow-Origin: *');
}
header('Content-Type: application/json');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$dbDir = '/var/data';
$dbFile = __DIR__ . '/database.sqlite';

if (is_dir($dbDir)) {
    $sessionDir = $dbDir . '/sessions';
    if (!is_dir($sessionDir)) {
        @mkdir($sessionDir, 0777, true);
    }
    if (is_writable($dbDir)) {
        $dbFile = $dbDir . '/database.sqlite';
        if (is_dir($sessionDir) && is_writable($sessionDir)) {
            session_save_path($sessionDir);
        }
    }
}

// Start secure session
session_start();

try {
    $pdo = new PDO('sqlite:' . $dbFile);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Read action payload
    $inputJSON = file_get_contents('php://input');
    $input = json_decode($inputJSON, true);

    if (!isset($input['action'])) {
        echo json_encode(['error' => 'No action provided']);
        exit;
    }

    $action = $input['action'];
    $params = isset($input['params']) ? $input['params'] : [];

    // Helper functions for role authorization
    function checkRole($allowedRoles) {
        if (!isset($_SESSION['role']) || !in_array($_SESSION['role'], $allowedRoles)) {
            http_response_code(403);
            echo json_encode(['error' => 'Unauthorized action. Forbidden.']);
            exit;
        }
    }

    // Action Router
    switch ($action) {
        
        // ==========================================
        // 1. AUTH ACTIONS
        // ==========================================
        
        case 'login':
            $username = isset($params['username']) ? $params['username'] : '';
            $password = isset($params['password']) ? $params['password'] : '';

            $stmt = $pdo->prepare("SELECT * FROM users WHERE username = ? AND password = ?");
            $stmt->execute([$username, $password]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($user) {
                $_SESSION['user_id'] = $user['id'];
                $_SESSION['username'] = $user['username'];
                $_SESSION['role'] = $user['role'];
                
                // Return user profile (exclude password)
                unset($user['password']);
                echo json_encode(['data' => $user]);
            } else {
                echo json_encode(['error' => 'Invalid username or password']);
            }
            break;

        case 'logout':
            session_destroy();
            echo json_encode(['success' => true]);
            break;

        case 'get_session':
            if (isset($_SESSION['user_id'])) {
                echo json_encode([
                    'data' => [
                        'id' => $_SESSION['user_id'],
                        'username' => $_SESSION['username'],
                        'role' => $_SESSION['role']
                    ]
                ]);
            } else {
                echo json_encode(['data' => null]);
            }
            break;

        // ==========================================
        // 2. STUDENT DASHBOARD ACTIONS
        // ==========================================
        
        case 'get_mentors':
            $stmt = $pdo->prepare("SELECT id, username FROM users WHERE role = 'mentor' ORDER BY username ASC");
            $stmt->execute();
            echo json_encode(['data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
            break;

        case 'get_group_details':
            checkRole(['student']);
            $leaderId = $_SESSION['user_id'];
            
            // Check if group exists for leader
            $stmt = $pdo->prepare("SELECT * FROM project_groups WHERE leader_id = ?");
            $stmt->execute([$leaderId]);
            $group = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$group) {
                // Auto-create empty group for leader
                $stmt = $pdo->prepare("INSERT INTO project_groups (leader_id) VALUES (?)");
                $stmt->execute([$leaderId]);
                
                $stmt = $pdo->prepare("SELECT * FROM project_groups WHERE leader_id = ?");
                $stmt->execute([$leaderId]);
                $group = $stmt->fetch(PDO::FETCH_ASSOC);
            }
            
            // Fetch group members
            $stmt = $pdo->prepare("SELECT * FROM students WHERE group_id = ?");
            $stmt->execute([$group['id']]);
            $members = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            echo json_encode([
                'data' => [
                    'group' => $group,
                    'members' => $members
                ]
            ]);
            break;

        case 'save_group_details':
            checkRole(['student']);
            $leaderId = $_SESSION['user_id'];
            
            // Retrieve parameters
            $academicYear = $params['academic_year'];
            $year = $params['year'];
            $sem = $params['sem'];
            $branch = $params['branch'];
            $division = $params['division'];
            $groupName = $params['group_name'];
            $problemStatement = $params['problem_statement'];
            $description = $params['description'];
            $members = $params['members']; // array of members

            if (count($members) > 5) {
                echo json_encode(['error' => 'Maximum 5 members allowed']);
                exit;
            }

            // Retrieve group ID associated with leader
            $stmt = $pdo->prepare("SELECT id FROM project_groups WHERE leader_id = ?");
            $stmt->execute([$leaderId]);
            $groupId = $stmt->fetchColumn();

            if (!$groupId) {
                echo json_encode(['error' => 'Group not found']);
                exit;
            }

            // Check if there is an existing mentor assignment for these details
            $stmtMentor = $pdo->prepare("SELECT mentor_id FROM mentor_assignments WHERE academic_year=? AND year=? AND sem=? AND LOWER(division)=? AND group_name=?");
            $stmtMentor->execute([$academicYear, $year, $sem, strtolower($division), $groupName]);
            $autoMentorId = $stmtMentor->fetchColumn();

            if ($autoMentorId) {
                // Update project_groups with the pre-assigned mentor
                $stmt = $pdo->prepare("
                    UPDATE project_groups 
                    SET academic_year=?, year=?, sem=?, branch=?, division=?, group_name=?, problem_statement=?, description=?, mentor_id=?
                    WHERE id=?
                ");
                $stmt->execute([$academicYear, $year, $sem, $branch, $division, $groupName, $problemStatement, $description, $autoMentorId, $groupId]);
            } else {
                // Update without changing mentor
                $stmt = $pdo->prepare("
                    UPDATE project_groups 
                    SET academic_year=?, year=?, sem=?, branch=?, division=?, group_name=?, problem_statement=?, description=?
                    WHERE id=?
                ");
                $stmt->execute([$academicYear, $year, $sem, $branch, $division, $groupName, $problemStatement, $description, $groupId]);
            }

            // Save members (Delete old & Insert new)
            $stmt = $pdo->prepare("DELETE FROM students WHERE group_id = ?");
            $stmt->execute([$groupId]);

            $stmt = $pdo->prepare("INSERT INTO students (group_id, name, roll_no, email, phone) VALUES (?, ?, ?, ?, ?)");
            foreach ($members as $mem) {
                $stmt->execute([$groupId, $mem['name'], $mem['roll_no'], $mem['email'], $mem['phone']]);
            }

            echo json_encode(['success' => true]);
            break;

        case 'get_components':
            // Students can query, mentors/admins can query
            checkRole(['student', 'mentor', 'admin']);
            $stmt = $pdo->prepare("SELECT * FROM components ORDER BY name ASC");
            $stmt->execute();
            echo json_encode(['data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
            break;

        case 'request_component':
            checkRole(['student']);
            $leaderId = $_SESSION['user_id'];
            $compId = $params['component_id'];
            $qty = intval($params['qty']);

            // Get group details
            $stmt = $pdo->prepare("SELECT * FROM project_groups WHERE leader_id = ?");
            $stmt->execute([$leaderId]);
            $group = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$group) {
                echo json_encode(['error' => 'No active student group found']);
                exit;
            }

            // Check if group details are filled
            if (empty($group['group_name']) || empty($group['branch']) || empty($group['division']) || empty($group['problem_statement'])) {
                echo json_encode(['error' => 'You must complete and save your Project Information details first before requesting components.']);
                exit;
            }

            $groupId = $group['id'];

            if ($qty <= 0) {
                echo json_encode(['error' => 'Invalid quantity requested']);
                exit;
            }

            // Check availability
            $stmt = $pdo->prepare("SELECT available_qty FROM components WHERE id = ?");
            $stmt->execute([$compId]);
            $avail = $stmt->fetchColumn();

            if ($avail === false || $avail < $qty) {
                echo json_encode(['error' => 'Requested quantity not available']);
                exit;
            }

            // Insert request
            $requestTime = date('Y-m-d H:i:s');
            $stmt = $pdo->prepare("
                INSERT INTO component_requests (group_id, component_id, requested_qty, status, request_time)
                VALUES (?, ?, ?, 'Pending', ?)
            ");
            $stmt->execute([$groupId, $compId, $qty, $requestTime]);

            // Deduct availability
            $stmt = $pdo->prepare("UPDATE components SET available_qty = available_qty - ? WHERE id = ?");
            $stmt->execute([$qty, $compId]);

            echo json_encode(['success' => true]);
            break;

        case 'get_order_history':
            checkRole(['student']);
            $leaderId = $_SESSION['user_id'];

            // Get group ID
            $stmt = $pdo->prepare("SELECT id FROM project_groups WHERE leader_id = ?");
            $stmt->execute([$leaderId]);
            $groupId = $stmt->fetchColumn();

            if (!$groupId) {
                echo json_encode(['data' => []]);
                exit;
            }

            $stmt = $pdo->prepare("
                SELECT r.id, c.name as component_name, r.requested_qty, r.status, r.component_id, r.request_time
                FROM component_requests r
                JOIN components c ON r.component_id = c.id
                WHERE r.group_id = ?
                ORDER BY r.id ASC
            ");
            $stmt->execute([$groupId]);
            echo json_encode(['data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
            break;

        case 'cancel_request':
            checkRole(['student']);
            $leaderId = $_SESSION['user_id'];
            $reqId = $params['request_id'];

            // Get group ID
            $stmt = $pdo->prepare("SELECT id FROM project_groups WHERE leader_id = ?");
            $stmt->execute([$leaderId]);
            $groupId = $stmt->fetchColumn();

            // Validate that this request belongs to this group and is Pending
            $stmt = $pdo->prepare("SELECT * FROM component_requests WHERE id = ? AND group_id = ? AND status = 'Pending'");
            $stmt->execute([$reqId, $groupId]);
            $req = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$req) {
                echo json_encode(['error' => 'Request cannot be cancelled (not found or not pending)']);
                exit;
            }

            // Delete request
            $stmt = $pdo->prepare("DELETE FROM component_requests WHERE id = ?");
            $stmt->execute([$reqId]);

            // Restore component availability
            $stmt = $pdo->prepare("UPDATE components SET available_qty = available_qty + ? WHERE id = ?");
            $stmt->execute([$req['requested_qty'], $req['component_id']]);

            echo json_encode(['success' => true]);
            break;

        // ==========================================
        // 3. MENTOR DASHBOARD ACTIONS
        // ==========================================
        
        case 'mentor_get_groups':
            checkRole(['mentor', 'admin']);
            $mentorId = $_SESSION['user_id'];
            $role = $_SESSION['role'];

            $tab = $params['tab']; // 'Active' or 'Completed'
            $academicYear = $params['academic_year'];
            $year = $params['year'];
            $sem = $params['sem'];
            $division = $params['division'];

            $sql = "SELECT * FROM project_groups";
            $conditions = [];
            $sqlParams = [];

            if ($tab === 'Active') {
                $conditions[] = "status = ?";
                $sqlParams[] = 'Active';
            } else {
                $conditions[] = "status != ?";
                $sqlParams[] = 'Active';
            }

            $conditions[] = "group_name IS NOT NULL";
            $conditions[] = "group_name != ''";

            // Mentors are restricted to their assigned groups. Admins can view all.
            if ($role === 'mentor') {
                $conditions[] = "mentor_id = ?";
                $sqlParams[] = $mentorId;
            }

            if ($academicYear !== 'All') {
                $conditions[] = "academic_year = ?";
                $sqlParams[] = $academicYear;
            }
            if ($year !== 'All') {
                $conditions[] = "year = ?";
                $sqlParams[] = $year;
            }
            if ($sem !== 'All') {
                $conditions[] = "sem = ?";
                $sqlParams[] = $sem;
            }
            if (!empty($division)) {
                $conditions[] = "LOWER(division) = ?";
                $sqlParams[] = strtolower($division);
            }

            if (count($conditions) > 0) {
                $sql .= " WHERE " . implode(" AND ", $conditions);
            }
            $sql .= " ORDER BY id DESC";

            $stmt = $pdo->prepare($sql);
            $stmt->execute($sqlParams);
            $groups = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Enrich group details with students and component requests
            $resultGroups = [];
            foreach ($groups as $g) {
                // Students
                $stmtStudents = $pdo->prepare("SELECT * FROM students WHERE group_id = ?");
                $stmtStudents->execute([$g['id']]);
                $g['students'] = $stmtStudents->fetchAll(PDO::FETCH_ASSOC);

                // Requests
                $stmtRequests = $pdo->prepare("
                    SELECT r.*, c.name as component_name, c.total_qty, c.available_qty
                    FROM component_requests r
                    JOIN components c ON r.component_id = c.id
                    WHERE r.group_id = ?
                    ORDER BY r.id ASC
                ");
                $stmtRequests->execute([$g['id']]);
                $g['requests'] = $stmtRequests->fetchAll(PDO::FETCH_ASSOC);

                $resultGroups[] = $g;
            }

            echo json_encode(['data' => $resultGroups]);
            break;

        case 'mentor_approve_request':
            checkRole(['mentor', 'admin']);
            $reqId = $params['request_id'];
            
            // Optionally check if the request belongs to a group mentored by this user
            if ($_SESSION['role'] === 'mentor') {
                $stmt = $pdo->prepare("
                    SELECT r.id FROM component_requests r
                    JOIN project_groups g ON r.group_id = g.id
                    WHERE r.id = ? AND g.mentor_id = ?
                ");
                $stmt->execute([$reqId, $_SESSION['user_id']]);
                if (!$stmt->fetchColumn()) {
                    echo json_encode(['error' => 'Permission denied']);
                    exit;
                }
            }

            $stmt = $pdo->prepare("UPDATE component_requests SET status = 'Approved' WHERE id = ?");
            $stmt->execute([$reqId]);
            echo json_encode(['success' => true]);
            break;

        case 'mentor_reject_request':
            checkRole(['mentor', 'admin']);
            $reqId = $params['request_id'];
            $compId = $params['component_id'];
            $qty = intval($params['requested_qty']);

            if ($_SESSION['role'] === 'mentor') {
                $stmt = $pdo->prepare("
                    SELECT r.id FROM component_requests r
                    JOIN project_groups g ON r.group_id = g.id
                    WHERE r.id = ? AND g.mentor_id = ?
                ");
                $stmt->execute([$reqId, $_SESSION['user_id']]);
                if (!$stmt->fetchColumn()) {
                    echo json_encode(['error' => 'Permission denied']);
                    exit;
                }
            }

            // Update status to Rejected
            $stmt = $pdo->prepare("UPDATE component_requests SET status = 'Rejected' WHERE id = ?");
            $stmt->execute([$reqId]);

            // Restock component
            $stmt = $pdo->prepare("UPDATE components SET available_qty = available_qty + ? WHERE id = ?");
            $stmt->execute([$qty, $compId]);

            echo json_encode(['success' => true]);
            break;

        case 'mentor_approve_group':
            checkRole(['mentor', 'admin']);
            $groupId = $params['group_id'];

            if ($_SESSION['role'] === 'mentor') {
                $stmt = $pdo->prepare("SELECT id FROM project_groups WHERE id = ? AND mentor_id = ?");
                $stmt->execute([$groupId, $_SESSION['user_id']]);
                if (!$stmt->fetchColumn()) {
                    echo json_encode(['error' => 'Permission denied']);
                    exit;
                }
            }

            $stmt = $pdo->prepare("UPDATE project_groups SET status = 'Approved' WHERE id = ?");
            $stmt->execute([$groupId]);
            echo json_encode(['success' => true]);
            break;

        // ==========================================
        // 4. ADMIN DASHBOARD ACTIONS
        // ==========================================
        
        case 'admin_get_groups':
            checkRole(['admin']);
            $tab = $params['tab']; // 'Active', 'Return', 'Returned'
            $academicYear = $params['academic_year'];
            $year = $params['year'];
            $sem = $params['sem'];
            $division = $params['division'];

            $dbStatus = 'Approved';
            if ($tab === 'Return') $dbStatus = 'Given';
            if ($tab === 'Returned') $dbStatus = 'Returned';

            $sql = "SELECT g.*, u.username as mentor_username FROM project_groups g LEFT JOIN users u ON g.mentor_id = u.id WHERE g.status = ? AND g.group_name IS NOT NULL AND g.group_name != ''";
            $sqlParams = [$dbStatus];

            if ($academicYear !== 'All') {
                $sql .= " AND g.academic_year = ?";
                $sqlParams[] = $academicYear;
            }
            if ($year !== 'All') {
                $sql .= " AND g.year = ?";
                $sqlParams[] = $year;
            }
            if ($sem !== 'All') {
                $sql .= " AND g.sem = ?";
                $sqlParams[] = $sem;
            }
            if (!empty($division)) {
                $sql .= " AND LOWER(g.division) = ?";
                $sqlParams[] = strtolower($division);
            }
            $sql .= " ORDER BY g.id DESC";

            $stmt = $pdo->prepare($sql);
            $stmt->execute($sqlParams);
            $groups = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $resultGroups = [];
            foreach ($groups as $g) {
                // Fetch requests to apply specific directory filters
                $stmtRequests = $pdo->prepare("SELECT status, admin_status FROM component_requests WHERE group_id = ?");
                $stmtRequests->execute([$g['id']]);
                $requestsStatusList = $stmtRequests->fetchAll(PDO::FETCH_ASSOC);

                if ($tab === 'Active') {
                    // Filter: must have components, no Pending component requests, and at least one Approved request
                    if (count($requestsStatusList) === 0) continue;
                    
                    $hasPending = false;
                    $hasApproved = false;
                    foreach ($requestsStatusList as $r) {
                        if ($r['status'] === 'Pending') $hasPending = true;
                        if ($r['status'] === 'Approved') $hasApproved = true;
                    }
                    if ($hasPending || !$hasApproved) continue;
                }

                // Fetch full students list
                $stmtStudents = $pdo->prepare("SELECT * FROM students WHERE group_id = ?");
                $stmtStudents->execute([$g['id']]);
                $g['students'] = $stmtStudents->fetchAll(PDO::FETCH_ASSOC);

                // Fetch detailed component requests
                $stmtRequestsDetailed = $pdo->prepare("
                    SELECT r.*, c.name as component_name, c.total_qty, c.available_qty
                    FROM component_requests r
                    JOIN components c ON r.component_id = c.id
                    WHERE r.group_id = ?
                    ORDER BY r.status ASC, r.id ASC
                ");
                $stmtRequestsDetailed->execute([$g['id']]);
                $g['requests'] = $stmtRequestsDetailed->fetchAll(PDO::FETCH_ASSOC);

                $resultGroups[] = $g;
            }

            echo json_encode(['data' => $resultGroups]);
            break;

        case 'admin_save_given_components':
            checkRole(['admin']);
            $groupId = $params['group_id'];
            $checkedIds = $params['checked_request_ids']; // Array of request IDs marked as Given

            // Fetch all Approved requests for this group
            $stmt = $pdo->prepare("SELECT id FROM component_requests WHERE group_id = ? AND status = 'Approved'");
            $stmt->execute([$groupId]);
            $approvedRequests = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $allGiven = true;
            foreach ($approvedRequests as $req) {
                $reqId = $req['id'];
                if (in_array($reqId, $checkedIds)) {
                    $stmtUpdate = $pdo->prepare("UPDATE component_requests SET admin_status = 'Given' WHERE id = ?");
                    $stmtUpdate->execute([$reqId]);
                } else {
                    $allGiven = false;
                    // Reset admin status to NULL if not checked, unless already marked Returned
                    $stmtUpdate = $pdo->prepare("UPDATE component_requests SET admin_status = NULL WHERE id = ? AND admin_status != 'Returned'");
                    $stmtUpdate->execute([$reqId]);
                }
            }

            if ($allGiven && count($approvedRequests) > 0) {
                // All components given -> Move group status to Given
                $stmtUpdate = $pdo->prepare("UPDATE project_groups SET status = 'Given' WHERE id = ?");
                $stmtUpdate->execute([$groupId]);
                echo json_encode(['success' => true, 'all_given' => true]);
            } else {
                echo json_encode(['success' => true, 'all_given' => false]);
            }
            break;

        case 'admin_return_component':
            checkRole(['admin']);
            $reqId = $params['request_id'];
            $compId = $params['component_id'];
            $qty = intval($params['requested_qty']);

            $stmt = $pdo->prepare("UPDATE component_requests SET admin_status = 'Returned' WHERE id = ?");
            $stmt->execute([$reqId]);

            // Add quantity back to inventory
            $stmt = $pdo->prepare("UPDATE components SET available_qty = available_qty + ? WHERE id = ?");
            $stmt->execute([$qty, $compId]);

            // Check if all approved components are returned for the group
            $stmt = $pdo->prepare("SELECT group_id FROM component_requests WHERE id = ?");
            $stmt->execute([$reqId]);
            $groupId = $stmt->fetchColumn();

            if ($groupId) {
                $stmtCheck = $pdo->prepare("SELECT COUNT(*) FROM component_requests WHERE group_id = ? AND status = 'Approved' AND (admin_status IS NULL OR admin_status != 'Returned')");
                $stmtCheck->execute([$groupId]);
                if ($stmtCheck->fetchColumn() == 0) {
                    // All components returned!
                    $stmtUpdate = $pdo->prepare("UPDATE project_groups SET status = 'Returned' WHERE id = ?");
                    $stmtUpdate->execute([$groupId]);
                    echo json_encode(['success' => true, 'all_returned' => true]);
                    exit;
                }
            }

            echo json_encode(['success' => true, 'all_returned' => false]);
            break;

        case 'admin_reject_request':
            checkRole(['admin']);
            $reqId = $params['request_id'];
            $compId = $params['component_id'];
            $qty = intval($params['requested_qty']);

            $stmt = $pdo->prepare("UPDATE component_requests SET status = 'Rejected' WHERE id = ?");
            $stmt->execute([$reqId]);

            // Restock component
            $stmt = $pdo->prepare("UPDATE components SET available_qty = available_qty + ? WHERE id = ?");
            $stmt->execute([$qty, $compId]);

            echo json_encode(['success' => true]);
            break;

        case 'admin_get_components':
            checkRole(['admin']);
            $search = isset($params['search']) ? trim($params['search']) : '';

            $sql = "SELECT * FROM components";
            $sqlParams = [];
            if (!empty($search)) {
                $sql .= " WHERE LOWER(name) LIKE ?";
                $sqlParams[] = '%' . strtolower($search) . '%';
            }
            $sql .= " ORDER BY name ASC";

            $stmt = $pdo->prepare($sql);
            $stmt->execute($sqlParams);
            echo json_encode(['data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
            break;

        case 'admin_add_component':
            checkRole(['admin']);
            $name = trim($params['name']);
            $qty = intval($params['qty']);

            if (empty($name) || $qty <= 0) {
                echo json_encode(['error' => 'Invalid component details']);
                exit;
            }

            $stmt = $pdo->prepare("INSERT INTO components (name, total_qty, available_qty) VALUES (?, ?, ?)");
            $stmt->execute([$name, $qty, $qty]);
            echo json_encode(['success' => true]);
            break;

        case 'admin_edit_component_qty':
            checkRole(['admin']);
            $compId = $params['id'];
            $newTotal = intval($params['new_total']);

            // Get current component info
            $stmt = $pdo->prepare("SELECT total_qty, available_qty FROM components WHERE id = ?");
            $stmt->execute([$compId]);
            $comp = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$comp) {
                echo json_encode(['error' => 'Component not found']);
                exit;
            }

            $diff = $newTotal - $comp['total_qty'];
            $newAvail = $comp['available_qty'] + $diff;

            if ($newAvail < 0) {
                echo json_encode(['error' => 'Cannot reduce total quantity below what is currently distributed']);
                exit;
            }

            $stmt = $pdo->prepare("UPDATE components SET total_qty = ?, available_qty = ? WHERE id = ?");
            $stmt->execute([$newTotal, $newAvail, $compId]);
            echo json_encode(['success' => true]);
            break;

        case 'admin_get_users':
            checkRole(['admin']);
            
            $stmtMentors = $pdo->prepare("SELECT id, username, password, role FROM users WHERE role = 'mentor' ORDER BY username ASC");
            $stmtMentors->execute();
            
            $stmtStudents = $pdo->prepare("SELECT id, username, password, role FROM users WHERE role = 'student' ORDER BY username ASC");
            $stmtStudents->execute();

            echo json_encode([
                'data' => [
                    'mentors' => $stmtMentors->fetchAll(PDO::FETCH_ASSOC),
                    'students' => $stmtStudents->fetchAll(PDO::FETCH_ASSOC)
                ]
            ]);
            break;

        case 'admin_add_user':
            checkRole(['admin']);
            $username = trim($params['username']);
            $password = trim($params['password']);
            $role = $params['role'];

            if (empty($username) || empty($password) || !in_array($role, ['student', 'mentor'])) {
                echo json_encode(['error' => 'Invalid user fields']);
                exit;
            }

            // Check if username exists
            $stmt = $pdo->prepare("SELECT id FROM users WHERE username = ?");
            $stmt->execute([$username]);
            if ($stmt->fetchColumn()) {
                echo json_encode(['error' => 'Username already exists']);
                exit;
            }

            $stmt = $pdo->prepare("INSERT INTO users (username, password, role) VALUES (?, ?, ?)");
            $stmt->execute([$username, $password, $role]);
            echo json_encode(['success' => true]);
            break;

        case 'admin_edit_user_password':
            checkRole(['admin']);
            $userId = $params['id'];
            $password = trim($params['password']);

            if (empty($password)) {
                echo json_encode(['error' => 'Password cannot be empty']);
                exit;
            }

            $stmt = $pdo->prepare("UPDATE users SET password = ? WHERE id = ?");
            $stmt->execute([$password, $userId]);
            echo json_encode(['success' => true]);
            break;

        case 'admin_delete_user':
            checkRole(['admin']);
            $userId = $params['id'];

            // Protect the logged in admin from deleting themselves (safety check)
            if ($userId == $_SESSION['user_id']) {
                echo json_encode(['error' => 'Cannot delete currently logged in admin']);
                exit;
            }

            $stmt = $pdo->prepare("DELETE FROM users WHERE id = ?");
            $stmt->execute([$userId]);
            echo json_encode(['success' => true]);
            break;

        case 'admin_get_edit_groups':
            checkRole(['admin']);
            $stmt = $pdo->prepare("
                SELECT g.id, g.group_name, g.status, u.username as leader_username 
                FROM project_groups g 
                LEFT JOIN users u ON g.leader_id = u.id 
                WHERE g.group_name IS NOT NULL AND g.group_name != ''
                ORDER BY g.id DESC
            ");
            $stmt->execute();
            echo json_encode(['data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
            break;

        case 'admin_delete_group':
            checkRole(['admin']);
            $groupId = $params['group_id'];

            // 1. Fetch active component requests to return inventory
            $stmt = $pdo->prepare("SELECT component_id, requested_qty, status, admin_status FROM component_requests WHERE group_id = ?");
            $stmt->execute([$groupId]);
            $requests = $stmt->fetchAll(PDO::FETCH_ASSOC);

            foreach ($requests as $req) {
                if ($req['status'] !== 'Rejected' && $req['admin_status'] !== 'Returned') {
                    $stmtRestock = $pdo->prepare("UPDATE components SET available_qty = available_qty + ? WHERE id = ?");
                    $stmtRestock->execute([$req['requested_qty'], $req['component_id']]);
                }
            }

            // 2. Delete requests
            $stmt = $pdo->prepare("DELETE FROM component_requests WHERE group_id = ?");
            $stmt->execute([$groupId]);

            // 3. Delete students
            $stmt = $pdo->prepare("DELETE FROM students WHERE group_id = ?");
            $stmt->execute([$groupId]);

            // 4. Delete the group
            $stmt = $pdo->prepare("DELETE FROM project_groups WHERE id = ?");
            $stmt->execute([$groupId]);

            echo json_encode(['success' => true]);
            break;

        case 'admin_preview_assign_groups':
            checkRole(['admin']);
            $academicYear = $params['academic_year'];
            $year = $params['year'];
            $sem = $params['sem'];
            $division = $params['division'];

            $sql = "SELECT * FROM project_groups WHERE 1=1";
            $sqlParams = [];

            if ($academicYear !== 'All') { $sql .= " AND academic_year = ?"; $sqlParams[] = $academicYear; }
            if ($year !== 'All') { $sql .= " AND year = ?"; $sqlParams[] = $year; }
            if ($sem !== 'All') { $sql .= " AND sem = ?"; $sqlParams[] = $sem; }
            if (!empty($division)) { $sql .= " AND LOWER(division) = ?"; $sqlParams[] = strtolower($division); }
            $sql .= " ORDER BY id ASC";

            $stmt = $pdo->prepare($sql);
            $stmt->execute($sqlParams);
            echo json_encode(['data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
            break;

        case 'admin_apply_batch_assignment':
            checkRole(['admin']);
            $fromIdx = intval($params['from_idx']);
            $toIdx = intval($params['to_idx']);
            $mentorId = $params['mentor_id'];
            
            $academicYear = $params['academic_year'];
            $year = $params['year'];
            $sem = $params['sem'];
            $division = $params['division'];

            if (empty($division) || $academicYear === 'All' || $year === 'All' || $sem === 'All') {
                echo json_encode(['error' => 'You must select a specific Academic Year, Year, Semester, and Division to assign mentors.']);
                exit;
            }

            // Check for crosspath
            $conflictGroups = [];
            for ($i = $fromIdx; $i <= $toIdx; $i++) {
                $groupNameStr = (string)$i;
                $stmt = $pdo->prepare("SELECT mentor_id FROM mentor_assignments WHERE academic_year=? AND year=? AND sem=? AND LOWER(division)=? AND group_name=?");
                $stmt->execute([$academicYear, $year, $sem, strtolower($division), $groupNameStr]);
                $existingMentor = $stmt->fetchColumn();

                if ($existingMentor && $existingMentor != $mentorId) {
                    $conflictGroups[] = $i;
                }
            }

            if (count($conflictGroups) > 0) {
                echo json_encode(['success' => false, 'error' => "Cross-pathing detected! Groups " . implode(', ', $conflictGroups) . " already have a different mentor assigned. Assignment aborted."]);
                exit;
            }

            $assignedCount = 0;
            for ($i = $fromIdx; $i <= $toIdx; $i++) {
                $groupNameStr = (string)$i;
                
                // 1. Save to mentor_assignments for future groups
                $stmtDel = $pdo->prepare("DELETE FROM mentor_assignments WHERE academic_year=? AND year=? AND sem=? AND LOWER(division)=? AND group_name=?");
                $stmtDel->execute([$academicYear, $year, $sem, strtolower($division), $groupNameStr]);
                
                $stmtInsert = $pdo->prepare("INSERT INTO mentor_assignments (academic_year, year, sem, division, group_name, mentor_id) VALUES (?, ?, ?, ?, ?, ?)");
                $stmtInsert->execute([$academicYear, $year, $sem, strtolower($division), $groupNameStr, $mentorId]);
                
                // 2. Update any existing project_groups immediately
                $stmtUpdate = $pdo->prepare("
                    UPDATE project_groups 
                    SET mentor_id = ? 
                    WHERE academic_year = ? AND year = ? AND sem = ? AND LOWER(division) = ? AND group_name = ?
                ");
                $stmtUpdate->execute([$mentorId, $academicYear, $year, $sem, strtolower($division), $groupNameStr]);
                
                $assignedCount++;
            }

            echo json_encode(['success' => true, 'assigned_count' => $assignedCount]);
            break;

        case 'admin_get_stats':
            checkRole(['admin']);
            $stmt = $pdo->prepare("SELECT COUNT(*) FROM project_groups WHERE status = 'Given'");
            $stmt->execute();
            $pendingReturns = $stmt->fetchColumn();

            echo json_encode([
                'success' => true,
                'data' => [
                    'pending_returns' => $pendingReturns
                ]
            ]);
            break;

        case 'admin_export_csv':
            checkRole(['admin']);
            $type = $params['type'];
            
            $csvData = [];
            if ($type === 'inventory') {
                $stmt = $pdo->prepare("SELECT name, total_qty, available_qty FROM components ORDER BY name ASC");
                $stmt->execute();
                $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
                $csvData[] = ['Component Name', 'Total Quantity', 'Available Quantity'];
                foreach ($rows as $row) {
                    $csvData[] = [$row['name'], $row['total_qty'], $row['available_qty']];
                }
            } else if ($type === 'projects') {
                $stmt = $pdo->prepare("
                    SELECT g.id, g.group_name, g.academic_year, g.year, g.sem, g.division, u.username as mentor, g.status 
                    FROM project_groups g 
                    LEFT JOIN users u ON g.mentor_id = u.id 
                    ORDER BY g.id ASC
                ");
                $stmt->execute();
                $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
                $csvData[] = ['Group ID', 'Group Name', 'Academic Year', 'Year', 'Sem', 'Division', 'Mentor', 'Status'];
                foreach ($rows as $row) {
                    $csvData[] = [$row['id'], $row['group_name'], $row['academic_year'], $row['year'], $row['sem'], $row['division'], $row['mentor'], $row['status']];
                }
            } else {
                echo json_encode(['error' => 'Invalid export type']);
                exit;
            }
            
            // Generate CSV string
            $output = fopen('php://temp', 'r+');
            foreach ($csvData as $line) {
                fputcsv($output, $line);
            }
            rewind($output);
            $csvString = stream_get_contents($output);
            fclose($output);
            
            echo json_encode(['success' => true, 'data' => $csvString]);
            break;

        default:
            http_response_code(404);
            echo json_encode(['error' => 'API action not found']);
            break;
    }

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
?>
