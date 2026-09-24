@echo off
rem Notification queue drain runner for Windows Task Scheduler (checklist 6.6).
rem Delivers queued SMS/email; with a real SMS provider nothing leaves until this runs.
rem
rem Register once (every minute, as the current user):
rem   schtasks /create /tn "AMS Notification Queue" /sc minute /mo 1 /tr "\"%~f0\""
rem Remove:  schtasks /delete /tn "AMS Notification Queue" /f
rem Output is appended to backend\logs\queue_drain.log (gitignored).

set "ROOT=%~dp0..\.."
if not exist "%ROOT%\backend\logs" mkdir "%ROOT%\backend\logs"
"C:\xampp\php\php.exe" "%ROOT%\backend\cron\process_queue.php" >> "%ROOT%\backend\logs\queue_drain.log" 2>&1
