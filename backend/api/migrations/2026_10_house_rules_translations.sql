ALTER TABLE house_rules
  ADD COLUMN title_fil VARCHAR(255) NULL AFTER title,
  ADD COLUMN description_fil TEXT NULL AFTER description;