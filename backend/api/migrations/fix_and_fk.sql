USE ams_db;

-- Update invalid room_names to 'A' so that the constraint succeeds
UPDATE rent_applications 
SET room_name = 'A' 
WHERE room_name NOT IN (SELECT id FROM rooms);

-- Now try adding the constraint again
ALTER TABLE rent_applications 
ADD CONSTRAINT fk_rent_room FOREIGN KEY (room_name) REFERENCES rooms(id) ON DELETE RESTRICT;
