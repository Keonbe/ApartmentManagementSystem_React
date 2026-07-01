<?php
    header('Content-Type: application/json');
    header('Access-Control-Allow-Origin: *');
    

    $first_name = $input["first_name"];
    $last_name = $input["last_name"];
    $email_address = $input["email_address"];
    $password = $input["password"];

    $hashed_password = password_hash($password, PASSWORD_DEFAULT);

    $stmt = $conn->prepare(INSERT INTO users (first_name, last_name, email_address, password) VALUES (?,?,?,?));
    $stmt->bind


?>