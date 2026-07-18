<?php
/**
 * Priority A Migration Runner
 * Run this once via browser: http://localhost:8080/ApartmentManagementSystem_React/backend/api/migrations/run_priority_a.php
 * DELETE this file after running.
 */

require_once "../../config.php";

$results = [];

$statements = [
    "Add assigned_to column" => "ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS assigned_to VARCHAR(100) DEFAULT NULL AFTER status",
    "Add estimated_cost column" => "ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS estimated_cost DECIMAL(10,2) DEFAULT NULL AFTER assigned_to",
    "Add work_notes column" => "ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS work_notes TEXT DEFAULT NULL AFTER estimated_cost",
    "Add tenant_responsible column" => "ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS tenant_responsible TINYINT(1) DEFAULT 0 AFTER work_notes",
];

foreach ($statements as $label => $sql) {
    if ($conn->query($sql)) {
        $results[] = "✅ $label — OK";
    } else {
        $results[] = "❌ $label — ERROR: " . $conn->error;
    }
}

// Show current schema
$cols = [];
$res = $conn->query("SHOW COLUMNS FROM maintenance_requests");
while ($row = $res->fetch_assoc()) {
    $cols[] = $row['Field'] . " (" . $row['Type'] . ")";
}

$conn->close();
?>
<!DOCTYPE html>
<html>
<head><title>Priority A Migration</title>
<style>body{font-family:monospace;padding:2rem;background:#f8fafc;} pre{background:#fff;border:1px solid #e2e8f0;padding:1rem;border-radius:8px;}</style>
</head>
<body>
<h2>Priority A Migration — maintenance_requests enrichment columns</h2>
<pre><?php echo implode("\n", $results); ?></pre>
<h3>Current maintenance_requests columns:</h3>
<pre><?php echo implode("\n", $cols); ?></pre>
<p style="color:red;font-weight:bold;">⚠️ Delete this file after running! (run_priority_a.php)</p>
</body>
</html>
