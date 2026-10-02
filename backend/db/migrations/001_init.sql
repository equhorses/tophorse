-- TopHorses · Análisis de datos del caballo deportivo (todas las disciplinas).
-- Esquema base: usuarios, ejemplares, material (fotos, vídeos, documentos), resultados, solicitudes y pagos.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────── Usuarios ───────────
-- ADMIN: dirección · EVALUADOR: analista · TITULAR: cliente (propietario, comprador, entrenador…)
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL UNIQUE,
  password    TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'TITULAR' CHECK (role IN ('ADMIN','EVALUADOR','TITULAR')),
  first_name  TEXT NOT NULL,
  last_name   TEXT NOT NULL,
  phone       TEXT,
  country     TEXT NOT NULL,
  city        TEXT,
  company     TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────── Ejemplares ───────────
CREATE SEQUENCE horse_ref_seq START 10001;
CREATE TABLE horses (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref                TEXT NOT NULL UNIQUE DEFAULT ('TH-' || nextval('horse_ref_seq')),
  name               TEXT NOT NULL,
  birth_date         DATE NOT NULL,
  sex                TEXT NOT NULL CHECK (sex IN ('MACHO','HEMBRA','CASTRADO')),
  coat               TEXT,
  country            TEXT NOT NULL,
  breed              TEXT NOT NULL,          -- clave del catálogo (lib/disciplines.js)
  discipline         TEXT NOT NULL,          -- disciplina principal (lib/disciplines.js)
  sire_name          TEXT,
  dam_name           TEXT,
  damsire_name       TEXT,                   -- abuelo materno: clave en carreras
  breeder_name       TEXT,
  microchip          TEXT,
  ueln               TEXT,
  official_registry  TEXT,                   -- nº en su libro genealógico
  studbook           TEXT,
  trainer_name       TEXT,
  external_owner     TEXT,                   -- titular sin cuenta (alta hecha por la dirección)
  admin_notes        TEXT,
  status             TEXT NOT NULL DEFAULT 'ACTIVO' CHECK (status IN ('ACTIVO','RETIRADO','BAJA')),
  owner_id           UUID NOT NULL REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX horses_owner_idx ON horses(owner_id);
CREATE INDEX horses_discipline_idx ON horses(discipline);

CREATE TABLE horse_photos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  horse_id    UUID NOT NULL REFERENCES horses(id) ON DELETE CASCADE,
  view        TEXT NOT NULL CHECK (view IN ('LATERAL_IZQUIERDO','LATERAL_DERECHO','FRONTAL','TRASERA','SUPERIOR')),
  url         TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (horse_id, view)
);

-- Vídeos: entrenamiento, competición, subasta (breeze-up), a la mano o en libertad
CREATE TABLE horse_videos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  horse_id    UUID NOT NULL REFERENCES horses(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'ENTRENAMIENTO' CHECK (kind IN ('ENTRENAMIENTO','COMPETICION','SUBASTA','A_LA_MANO','LIBERTAD')),
  title       TEXT,
  recorded_on DATE,
  url         TEXT NOT NULL,
  seconds     INT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Documentación privada (carta genealógica, pasaporte, certificado de libro); la IA la lee y propone datos
CREATE TABLE horse_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  horse_id      UUID REFERENCES horses(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'EJEMPLAR' CHECK (role IN ('EJEMPLAR','PADRE','MADRE')),
  file          TEXT NOT NULL,
  mime          TEXT NOT NULL,
  original_name TEXT,
  doc_type      TEXT,
  extracted     JSONB,
  ai_model      TEXT,
  ai_error      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX horse_documents_horse_idx ON horse_documents(horse_id);

-- ─────────── Resultados (todas las disciplinas) ───────────
-- Campos comunes + los propios de cada disciplina (tiempo, distancia, faltas, nota, velocidad, premio…)
CREATE TABLE results (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  horse_id      UUID NOT NULL REFERENCES horses(id) ON DELETE CASCADE,
  discipline    TEXT NOT NULL,
  competition   TEXT NOT NULL,
  date          DATE NOT NULL,
  country       TEXT,
  category      TEXT,                 -- prueba / carrera / categoría
  level         TEXT,                 -- p. ej. Grupo 1, CEI 3*, CSI 5*, Gran Premio
  position      INT,                  -- puesto (NULL si eliminado/retirado)
  field_size    INT,                  -- participantes
  status        TEXT NOT NULL DEFAULT 'CLASIFICADO' CHECK (status IN ('CLASIFICADO','ELIMINADO','RETIRADO','NO_SALIO')),
  score         NUMERIC(7,3),         -- nota (doma, reining…) o %
  faults        NUMERIC(6,2),         -- faltas (salto, completo)
  time_s        NUMERIC(9,3),         -- tiempo en segundos
  distance_m    INT,                  -- distancia (carreras, raid)
  speed_kmh     NUMERIC(6,2),         -- velocidad media (raid)
  going         TEXT,                 -- estado de la pista (carreras)
  rating        NUMERIC(6,1),         -- rating / handicap oficial
  earnings_eur  NUMERIC(12,2),        -- premio obtenido
  details       JSONB,                -- datos adicionales propios de la disciplina
  document_url  TEXT,
  source        TEXT NOT NULL DEFAULT 'TITULAR' CHECK (source IN ('TITULAR','DIRECCION','IMPORTACION')),
  ai_extracted  JSONB,
  ai_warning    TEXT,
  verified      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX results_horse_idx ON results(horse_id);
CREATE INDEX results_discipline_idx ON results(discipline, date);

-- ─────────── Historial que no se borra ───────────
CREATE TABLE audit_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id),
  entity     TEXT NOT NULL,
  entity_id  TEXT NOT NULL,
  action     TEXT NOT NULL,
  data       JSONB,
  at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_entity_idx ON audit_log(entity, entity_id);

-- ─────────── Solicitudes (informes) y pagos ───────────
CREATE TABLE service_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id),
  horse_id     UUID REFERENCES horses(id) ON DELETE SET NULL,
  service      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'PENDIENTE_PAGO' CHECK (status IN ('PENDIENTE_PAGO','PAGADA','EN_REVISION','REQUIERE_DOCUMENTACION','RESUELTA','RECHAZADA')),
  documents    JSONB,
  notes        TEXT,
  admin_notes  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ
);

CREATE TABLE payments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  request_id  UUID REFERENCES service_requests(id) ON DELETE SET NULL,
  stripe_id   TEXT UNIQUE,
  amount      INT NOT NULL,          -- céntimos
  currency    TEXT NOT NULL DEFAULT 'eur',
  status      TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (status IN ('PENDIENTE','COMPLETADO','FALLIDO','REEMBOLSADO')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at     TIMESTAMPTZ
);

-- ─────────── Ajustes de la dirección ───────────
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);
