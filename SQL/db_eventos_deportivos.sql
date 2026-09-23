-- ============================================================
-- db_eventos_deportivos.sql
-- Esquema completo: recursos (eventos), usuarios y reservas
-- ============================================================

CREATE DATABASE IF NOT EXISTS db_eventos_deportivos
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE db_eventos_deportivos;

-- Usuarios de la plataforma (clientes y administradores)
CREATE TABLE IF NOT EXISTS usuarios (
  id_usuario       INT AUTO_INCREMENT PRIMARY KEY,
  nombre           VARCHAR(120) NOT NULL,
  email            VARCHAR(150) NOT NULL UNIQUE,
  contrasena_hash  VARCHAR(255) NOT NULL,      -- nunca se guarda en texto plano
  rol              ENUM('cliente', 'admin') NOT NULL DEFAULT 'cliente',
  fecha_registro   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Pistas / eventos disponibles para reservar (creados por el admin)
CREATE TABLE IF NOT EXISTS recursos (
  id_recurso   INT AUTO_INCREMENT PRIMARY KEY,
  nombre       VARCHAR(120) NOT NULL,
  tipo         VARCHAR(60)  NOT NULL,
  descripcion  VARCHAR(255) NULL,
  capacidad    INT NOT NULL DEFAULT 1,
  fecha        DATE NOT NULL,
  hora         TIME NOT NULL,
  lugar        VARCHAR(120) NULL,
  activo       TINYINT(1) NOT NULL DEFAULT 1,
  creado_por   INT NULL,
  CONSTRAINT fk_recurso_admin
    FOREIGN KEY (creado_por) REFERENCES usuarios(id_usuario)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Reservas hechas por usuarios registrados sobre un recurso
CREATE TABLE IF NOT EXISTS reservas (
  id_reserva      INT AUTO_INCREMENT PRIMARY KEY,
  id_recurso      INT NOT NULL,
  id_usuario      INT NOT NULL,
  nombre          VARCHAR(120) NOT NULL,   -- copia del nombre en el momento de reservar
  email           VARCHAR(150) NOT NULL,   -- copia del email en el momento de reservar
  plazas          INT NOT NULL DEFAULT 1,
  estado          VARCHAR(30) NOT NULL DEFAULT 'confirmada',
  fecha_creacion  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reserva_recurso
    FOREIGN KEY (id_recurso) REFERENCES recursos(id_recurso)
    ON DELETE CASCADE,
  CONSTRAINT fk_reserva_usuario
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Datos de ejemplo para poder probar el front-end
INSERT INTO recursos (nombre, tipo, descripcion, capacidad, fecha, hora, lugar) VALUES
('Pista Central - Fútbol 7', 'Fútbol 7 y Fútbol 11', 'Partido amistoso en césped artificial', 14, '2026-10-05', '18:00:00', 'Polideportivo Norte'),
('Pista 2 - Pádel', 'Tenis y Pádel', 'Pista cubierta, se recomienda calzado adecuado', 4, '2026-10-06', '10:00:00', 'Club Deportivo Sur'),
('Cancha 1 - Baloncesto 3x3', 'Baloncesto', 'Abierto a todos los niveles', 6, '2026-10-07', '19:30:00', 'Polideportivo Este'),
('Carrera Popular 10K', 'Carreras populares', 'Circuito urbano de 10 km', 200, '2026-10-12', '09:00:00', 'Parque Central');

-- NOTA IMPORTANTE SOBRE EL USUARIO ADMIN:
-- No insertamos aquí el admin con una contraseña "a mano", porque una
-- contraseña bien cifrada (bcrypt) no se puede escribir de memoria en SQL.
-- Ejecuta una vez, desde el navegador, el script db/crear_admin.php:
--   http://localhost/reservas/db/crear_admin.php
-- Te devolverá el email y la contraseña temporal del admin.
-- Después, BORRA o renombra ese archivo por seguridad.
