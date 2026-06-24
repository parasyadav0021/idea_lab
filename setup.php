<?php
$dbDir = '/var/data';
$dbFile = __DIR__ . '/database.sqlite';

if (is_dir($dbDir)) {
    if (is_writable($dbDir)) {
        $dbFile = $dbDir . '/database.sqlite';
    }
}

try {
    $pdo = new PDO('sqlite:' . $dbFile);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            role TEXT
        );

        CREATE TABLE IF NOT EXISTS project_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            leader_id INTEGER,
            academic_year TEXT,
            year TEXT,
            sem TEXT,
            branch TEXT,
            division TEXT,
            group_name TEXT,
            mentor_id INTEGER,
            problem_statement TEXT,
            description TEXT,
            status TEXT DEFAULT 'Active',
            FOREIGN KEY(leader_id) REFERENCES users(id),
            FOREIGN KEY(mentor_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER,
            name TEXT,
            roll_no TEXT,
            email TEXT,
            phone TEXT,
            FOREIGN KEY(group_id) REFERENCES project_groups(id)
        );

        CREATE TABLE IF NOT EXISTS components (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            total_qty INTEGER,
            available_qty INTEGER
        );

        CREATE TABLE IF NOT EXISTS component_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER,
            component_id INTEGER,
            requested_qty INTEGER,
            status TEXT,
            request_time TEXT,
            approval_time TEXT,
            issue_time TEXT,
            return_time TEXT,
            admin_status TEXT,
            FOREIGN KEY(group_id) REFERENCES project_groups(id),
            FOREIGN KEY(component_id) REFERENCES components(id)
        );

        CREATE TABLE IF NOT EXISTS mentor_assignments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            academic_year TEXT,
            year TEXT,
            sem TEXT,
            division TEXT,
            group_name TEXT,
            mentor_id INTEGER
        );
    ");

    $stmt = $pdo->prepare("SELECT COUNT(*) FROM users");
    $stmt->execute();
    if ($stmt->fetchColumn() == 0) {
        $pdo->exec("INSERT INTO users (username, password, role) VALUES ('student1', 'password', 'student')");
        $pdo->exec("INSERT INTO users (username, password, role) VALUES ('student2', 'password', 'student')");
        $pdo->exec("INSERT INTO users (username, password, role) VALUES ('student3', 'password', 'student')");
        $pdo->exec("INSERT INTO users (username, password, role) VALUES ('mentor1', 'password', 'mentor')");
        $pdo->exec("INSERT INTO users (username, password, role) VALUES ('admin', 'admin123', 'admin')");

        $pdo->exec("INSERT INTO components (name, total_qty, available_qty) VALUES ('Arduino Uno', 50, 50)");
        $pdo->exec("INSERT INTO components (name, total_qty, available_qty) VALUES ('Raspberry Pi 4', 20, 20)");
        $pdo->exec("INSERT INTO components (name, total_qty, available_qty) VALUES ('10k Resistor', 1000, 1000)");
        $pdo->exec("INSERT INTO components (name, total_qty, available_qty) VALUES ('Breadboard', 100, 100)");
        $pdo->exec("INSERT INTO components (name, total_qty, available_qty) VALUES ('Jumper Wires (M-M)', 500, 500)");
        $pdo->exec("INSERT INTO components (name, total_qty, available_qty) VALUES ('5V Relay Module', 40, 40)");
        $pdo->exec("INSERT INTO components (name, total_qty, available_qty) VALUES ('DC Motor', 60, 60)");
        $pdo->exec("INSERT INTO components (name, total_qty, available_qty) VALUES ('Servo Motor', 40, 40)");
        $pdo->exec("INSERT INTO components (name, total_qty, available_qty) VALUES ('Ultrasonic Sensor', 30, 30)");
        echo "Database initialized and seeded successfully!\n";
    } else {
        echo "Database already seeded.\n";
    }

} catch (PDOException $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
