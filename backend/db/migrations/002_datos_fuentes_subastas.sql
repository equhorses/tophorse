-- Datos que la investigación marca como predictivos por disciplina, catálogo de fuentes y archivo de subastas

-- Resultados: campos propios de cada disciplina y agregados de la prueba (para métricas relativas a los rivales)
ALTER TABLE results
  ADD COLUMN lengths_beaten     NUMERIC(6,2),   -- cuerpos de derrota (carreras)
  ADD COLUMN weight_kg          NUMERIC(5,1),   -- peso llevado (carreras)
  ADD COLUMN rating_authority   TEXT,           -- quién emite el rating (France Galop, BHA, ERA, JCE…)
  ADD COLUMN speed_index        NUMERIC(5,1),   -- Speed Index AQHA (Quarter Horse)
  ADD COLUMN penalties          NUMERIC(5,1),   -- penalizaciones (reining)
  ADD COLUMN elimination_reason TEXT,           -- motivo de eliminación (raid: cojera, metabólico…; completo: caída…)
  ADD COLUMN event_mean_score   NUMERIC(7,3),   -- media de la prueba (doma, reining)
  ADD COLUMN event_clear_count  INT;            -- recorridos limpios en la prueba (salto, completo)

ALTER TABLE horses ADD COLUMN fei_id TEXT;
CREATE INDEX horses_fei_idx ON horses(fei_id);
CREATE INDEX horses_name_idx ON horses(lower(name));

-- Catálogo de fuentes de datos y su estado de acceso
CREATE TABLE data_sources (
  key          TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  url          TEXT,
  kind         TEXT NOT NULL,          -- RESULTADOS, GENEALOGIA, INDICES, SUBASTA, VIDEO, SENSORES
  disciplines  TEXT[] NOT NULL DEFAULT '{}',
  region       TEXT,
  access       TEXT NOT NULL,          -- PUBLICO, PUBLICO_CABALLO_A_CABALLO, SUSCRIPCION, LICENCIA, CONVENIO
  has_video    BOOLEAN NOT NULL DEFAULT FALSE,
  has_prices   BOOLEAN NOT NULL DEFAULT FALSE,
  block        INT NOT NULL DEFAULT 3, -- orden de carga recomendado (1 = primero)
  notes        TEXT,
  status       TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (status IN ('PENDIENTE','CONTACTADO','PERMISO','ACTIVA','DESCARTADA')),
  status_notes TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Archivo de subastas: cada lote con su vídeo, su precio y su estado de venta (para relacionar vídeo, precio y resultado)
CREATE TABLE sale_lots (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key     TEXT REFERENCES data_sources(key) ON DELETE SET NULL,
  sale_name      TEXT NOT NULL,
  sale_date      DATE,
  lot            TEXT,
  discipline     TEXT,
  horse_name     TEXT,
  sire_name      TEXT,
  dam_name       TEXT,
  damsire_name   TEXT,
  sex            TEXT,
  birth_year     INT,
  consignor      TEXT,
  buyer          TEXT,
  price          NUMERIC(14,2),
  currency       TEXT NOT NULL DEFAULT 'EUR',
  sale_status    TEXT NOT NULL DEFAULT 'VENDIDO' CHECK (sale_status IN ('VENDIDO','RECOMPRADO','NO_VENDIDO','RETIRADO')),
  breeze_time_s  NUMERIC(6,2),
  breeze_distance TEXT,                 -- p. ej. '1f', '2f', '1/4'
  video_url      TEXT,                  -- enlace externo (web de la subasta, YouTube…)
  video_file     TEXT,                  -- copia propia subida a /uploads
  horse_id       UUID REFERENCES horses(id) ON DELETE SET NULL,  -- caballo enlazado para seguir sus resultados
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sale_lots_sale_idx ON sale_lots(sale_name, sale_date);
CREATE INDEX sale_lots_horse_idx ON sale_lots(horse_id);
CREATE INDEX sale_lots_pedigree_idx ON sale_lots(lower(sire_name), lower(dam_name), birth_year);

-- Análisis de vídeo con IA (de un vídeo de caballo o de un lote de subasta), con el conocimiento de su disciplina
CREATE TABLE video_analyses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  horse_id     UUID REFERENCES horses(id) ON DELETE CASCADE,
  video_id     UUID REFERENCES horse_videos(id) ON DELETE CASCADE,
  sale_lot_id  UUID REFERENCES sale_lots(id) ON DELETE CASCADE,
  discipline   TEXT NOT NULL,
  model        TEXT,
  filming_ok   BOOLEAN,
  result       JSONB,
  error        TEXT,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX video_analyses_horse_idx ON video_analyses(horse_id);
CREATE INDEX video_analyses_lot_idx ON video_analyses(sale_lot_id);
