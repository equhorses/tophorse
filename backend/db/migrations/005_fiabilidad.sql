-- Fiabilidad del informe de potro: datos genéticos de los padres e informes veterinarios aportados
ALTER TABLE horses ADD COLUMN pedigree_data JSONB;   -- índices del padre/abuelo materno, producción de la madre, estadísticas de semental

ALTER TABLE horse_documents DROP CONSTRAINT IF EXISTS horse_documents_role_check;
ALTER TABLE horse_documents ADD CONSTRAINT horse_documents_role_check CHECK (role IN ('EJEMPLAR','PADRE','MADRE','VETERINARIO'));
