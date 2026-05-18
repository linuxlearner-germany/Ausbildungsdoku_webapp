USE Berichtsheft;

DECLARE @sql NVARCHAR(MAX) = N'';

SELECT @sql = @sql +
  N'ALTER TABLE dbo.entries DROP CONSTRAINT [' + dc.name + N'];' + CHAR(13)
FROM sys.default_constraints dc
JOIN sys.columns c
  ON dc.parent_object_id = c.object_id
 AND dc.parent_column_id = c.column_id
WHERE dc.parent_object_id = OBJECT_ID('dbo.entries')
  AND c.name IN ('schule', 'themen', 'reflection', 'trainerComment', 'rejectionReason');

PRINT @sql;
EXEC sp_executesql @sql;

ALTER TABLE dbo.entries ALTER COLUMN schule NVARCHAR(MAX) NULL;
ALTER TABLE dbo.entries ALTER COLUMN themen NVARCHAR(MAX) NULL;
ALTER TABLE dbo.entries ALTER COLUMN reflection NVARCHAR(MAX) NULL;
ALTER TABLE dbo.entries ALTER COLUMN trainerComment NVARCHAR(MAX) NULL;
ALTER TABLE dbo.entries ALTER COLUMN rejectionReason NVARCHAR(MAX) NULL;


-------------------------
Prüfen
--------------------------
SELECT 
  COLUMN_NAME,
  DATA_TYPE,
  CHARACTER_MAXIMUM_LENGTH
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'entries'
  AND COLUMN_NAME IN ('betrieb', 'schule', 'themen', 'reflection', 'trainerComment', 'rejectionReason');
