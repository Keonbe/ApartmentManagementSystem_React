-- Fix double-encoded UTF-8 / CP437 mojibake for currency symbols and dashes in notifications and settings
UPDATE system_settings SET setting_value = UNHEX('E282B1') WHERE setting_key = 'currency_symbol';
UPDATE notifications SET message = REPLACE(REPLACE(message, UNHEX('CE93C3A9E29692'), UNHEX('E282B1')), UNHEX('CE93C387C3B4'), UNHEX('E28093'));
UPDATE notifications SET title = REPLACE(REPLACE(title, UNHEX('CE93C3A9E29692'), UNHEX('E282B1')), UNHEX('CE93C387C3B4'), UNHEX('E28093'));

