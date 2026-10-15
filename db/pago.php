<?php
/**
 * pago.php
 * Devuelve los datos de pago (móvil, método) para mostrarlos en la web.
 */
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/correo.php';
header('Content-Type: application/json; charset=utf-8');

echo json_encode(['ok' => true, 'pago' => configPago()]);