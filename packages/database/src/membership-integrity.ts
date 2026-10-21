/** Read-only diagnostic for restored/imported data; never repairs or deletes records. */
export const membershipIntegritySql = `
SELECT 'multiple_competitive_teams' AS issue,
       tm.discord_user_id AS subject, t.season_name AS context
FROM team_memberships tm JOIN teams t ON t.id = tm.team_id
WHERE tm.role IN ('top', 'jungle', 'mid', 'adc', 'support', 'substitute')
GROUP BY tm.discord_user_id, t.season_name HAVING count(*) > 1
UNION ALL
SELECT 'membership_season_mismatch', tm.discord_user_id, tm.team_id::text
FROM team_memberships tm JOIN teams t ON t.id = tm.team_id
WHERE tm.season_name IS DISTINCT FROM t.season_name
UNION ALL
SELECT 'team_season_mismatch', t.id::text, sd.id::text
FROM teams t JOIN seasons_divisions sd ON sd.id = t.season_division_id
WHERE t.season_name IS DISTINCT FROM sd.season_name
UNION ALL
SELECT 'invalid_captain_role', tm.discord_user_id, tm.team_id::text
FROM team_memberships tm
WHERE tm.is_captain AND tm.role NOT IN ('top', 'jungle', 'mid', 'adc', 'support')
UNION ALL
SELECT 'multiple_captains', tm.team_id::text, count(*)::text
FROM team_memberships tm WHERE tm.is_captain
GROUP BY tm.team_id HAVING count(*) > 1
UNION ALL
SELECT 'orphan_membership', tm.discord_user_id, tm.team_id::text
FROM team_memberships tm
LEFT JOIN teams t ON t.id = tm.team_id
LEFT JOIN discord_users u ON u.discord_id = tm.discord_user_id
WHERE t.id IS NULL OR u.discord_id IS NULL
ORDER BY issue, subject, context
`;
