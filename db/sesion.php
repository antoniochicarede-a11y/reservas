<?php
require_once __DIR__ . '/auth.php';
header('Content-Type: application/json; charset=utf-8');

echo json_encode(['ok' => true, 'usuario' => usuarioActual()]);