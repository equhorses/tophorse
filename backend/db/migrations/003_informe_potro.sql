-- Informe de potro / caballo joven sin historial: lo genera la dirección, lo revisa y lo publica al cliente
CREATE TABLE young_reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  horse_id      UUID NOT NULL REFERENCES horses(id) ON DELETE CASCADE,
  discipline    TEXT NOT NULL,
  model         TEXT,
  version       TEXT NOT NULL,
  inputs        JSONB,          -- material usado (fotos, vídeo) y edad
  result        JSONB,          -- rasgos, percentil, probabilidades, salud, valor
  status        TEXT NOT NULL DEFAULT 'BORRADOR' CHECK (status IN ('BORRADOR','PUBLICADO','RETIRADO')),
  admin_notes   TEXT,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at  TIMESTAMPTZ
);
CREATE INDEX young_reports_horse_idx ON young_reports(horse_id);
