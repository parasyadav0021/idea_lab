<?php
try {
    $pdo = new PDO('sqlite:' . __DIR__ . '/database.sqlite');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("ALTER TABLE component_requests ADD COLUMN approval_time TEXT");
    $pdo->exec("ALTER TABLE component_requests ADD COLUMN issue_time TEXT");
    $pdo->exec("ALTER TABLE component_requests ADD COLUMN return_time TEXT");
    echo "Migration successful.";
} catch (Exception $e) {
    echo "Migration failed: " . $e->getMessage();
}
