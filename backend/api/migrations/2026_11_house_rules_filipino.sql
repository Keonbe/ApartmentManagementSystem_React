-- ============================================================
-- 2026_11_house_rules_filipino.sql
-- Filipino text for the four starter house rules (quiet hours, smoke-free,
-- visitors, paying rent on time). The children/pets and parking starters got
-- theirs in 2026_10_panelist_gaps.sql; these four were left English-only, so
-- the Preview page and the rules dialog mixed languages in Filipino mode.
--
-- A rule is filled only while its Filipino title is empty, so wording an admin
-- already wrote is kept. Plain UPDATEs: safe to re-run, on MySQL 8 and MariaDB,
-- through the mysql client or cron/migrate.php.
-- ============================================================

UPDATE `house_rules` SET `title_fil` = 'Igalang ang oras ng katahimikan',
  `description_fil` = 'Panatilihing mahina ang ingay mula 10:00 PM hanggang 7:00 AM upang makapagpahinga ang lahat ng residente.'
 WHERE `scope` = 'house' AND `title` = 'Respect quiet hours' AND (`title_fil` IS NULL OR `title_fil` = '');
UPDATE `house_rules` SET `title_fil` = 'Bawal manigarilyo sa loob ng gusali',
  `description_fil` = 'Hindi pinapayagan ang paninigarilyo sa loob ng mga kwarto o saanmang saradong karaniwang lugar. Panatilihing malinis ang paligid at agad na iulat ang anumang sira.'
 WHERE `scope` = 'house' AND `title` = 'Smoke-free indoor areas' AND (`title_fil` IS NULL OR `title_fil` = '');
UPDATE `house_rules` SET `title_fil` = 'Iparehistro ang iyong mga bisita',
  `description_fil` = 'Dapat maiparehistro sa management ng apartment ang lahat ng bisita at sundin nila ang mga patakaran sa pagpasok at kaligtasan ng gusali.'
 WHERE `scope` = 'house' AND `title` = 'Register your visitors' AND (`title_fil` IS NULL OR `title_fil` = '');
UPDATE `house_rules` SET `title_fil` = 'Magbayad ng upa sa tamang oras',
  `description_fil` = 'Ang buwanang upa ay dapat bayaran sa napagkasunduang petsa. Makipag-ugnayan agad sa management kung may tanong ka tungkol sa iyong bayad.'
 WHERE `scope` = 'house' AND `title` = 'Pay rent on time' AND (`title_fil` IS NULL OR `title_fil` = '');
