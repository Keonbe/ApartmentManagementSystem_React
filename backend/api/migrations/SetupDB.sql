CREATE DATABASE IF NOT EXISTS ams_db 
  DEFAULT CHARACTER SET utf8mb4 
  DEFAULT COLLATE utf8mb4_general_ci;

USE ams_db

CREATE TABLE users (
  id int(11) NOT NULL AUTO_INCREMENT,
  first_name varchar(30) NOT NULL,
  last_name varchar(30) NOT NULL,
  `suffix` varchar(20) DEFAULT NULL,
  `contact_no` varchar(30) DEFAULT NULL,
  `gender` varchar(20) DEFAULT NULL,
  email_address varchar(30) NOT NULL,
  password varchar(200) NOT NULL,
  `role` varchar(20) DEFAULT 'user',
  PRIMARY KEY (id),
  UNIQUE KEY `email_address` (`email_address`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE rent_applications (
  id int(11) NOT NULL AUTO_INCREMENT,
  first_name varchar(100) NOT NULL,
  last_name varchar(100) NOT NULL,
  suffix varchar(20) DEFAULT NULL,
  contact_no varchar(30) NOT NULL,
  email varchar(150) NOT NULL,
  gender varchar(20) NOT NULL,
  occupants int(11) NOT NULL,
  months_of_rent int(11) NOT NULL,
  room_name varchar(50) NOT NULL,
  monthly_rent decimal(10,2) NOT NULL,
  valid_id_front_path varchar(255) NOT NULL,
  valid_id_back_path varchar(255) NOT NULL,
  nbi_clearance_path varchar(255) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'Pending Review',
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE cctv_requests (
  id int(11) NOT NULL AUTO_INCREMENT,
  incident_date date NOT NULL,
  incident_time varchar(50) NOT NULL,
  location_details varchar(50) NOT NULL,
  reason_request text NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'Pending',
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE maintenance_requests (
  id int(11) NOT NULL AUTO_INCREMENT,
  issue_category varchar(50) NOT NULL,
  urgency varchar(50) NOT NULL,
  preferred_date date NOT NULL,
  preferred_time varchar(50) NOT NULL,
  description text NOT NULL,
  permission_to_enter tinyint(1) NOT NULL DEFAULT 0,
  attachment_path varchar(255) DEFAULT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status varchar(20) NOT NULL DEFAULT 'Pending',
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE parking_reservations (
  id int(11) NOT NULL AUTO_INCREMENT,
  vehicle_type varchar(50) NOT NULL,
  vehicle_model varchar(100) NOT NULL,
  plate_number varchar(20) NOT NULL,
  transmission varchar(50) NOT NULL,
  duration_months int(11) NOT NULL,
  total_cost decimal(10,2) NOT NULL,
  document_path varchar(255) NOT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `users` (`first_name`, `last_name`, `email_address`, `password`, `role`) 
VALUES ('Admin', 'User', 'admin@gmail.com', '$2y$10$kyF64U0j2xVl0PN1wiqJ5eaDR14ZhjAxjVTnRC0yLleTl9Rdi4Nli', 'admin');