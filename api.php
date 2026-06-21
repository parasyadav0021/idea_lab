<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$dbFile = __DIR__ . '/database.sqlite';

try {
    $pdo = new PDO('sqlite:' . $dbFile);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $inputJSON = file_get_contents('php://input');
    $input = json_decode($inputJSON, true);

    if (!isset($input['sql'])) {
        echo json_encode(['error' => 'No SQL query provided']);
        exit;
    }

    $sql = $input['sql'];
    $params = isset($input['params']) ? $input['params'] : [];

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    if (stripos(trim($sql), 'SELECT') === 0 || stripos(trim($sql), 'PRAGMA') === 0) {
        $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['data' => $results]);
    } else {
        echo json_encode(['success' => true, 'rows_affected' => $stmt->rowCount()]);
    }

} catch (PDOException $e) {
    echo json_encode(['error' => $e->getMessage()]);
}
?>
