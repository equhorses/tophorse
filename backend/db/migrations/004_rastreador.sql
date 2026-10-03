-- Rastreador automático de vídeos: busca en YouTube y en las webs de subastas, la IA criba y la dirección acepta
ALTER TABLE data_sources ADD COLUMN crawl_urls TEXT[] NOT NULL DEFAULT '{}';
UPDATE data_sources SET crawl_urls = ARRAY[url] WHERE kind IN ('SUBASTA','VIDEO') AND url IS NOT NULL AND crawl_urls = '{}';

CREATE TABLE video_candidates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url          TEXT NOT NULL UNIQUE,
  platform     TEXT NOT NULL,                 -- YOUTUBE, VIMEO, WEB
  title        TEXT,
  channel      TEXT,
  description  TEXT,
  duration_s   INT,
  published    TEXT,
  source_key   TEXT REFERENCES data_sources(key) ON DELETE SET NULL,
  query        TEXT,
  page_url     TEXT,
  discipline   TEXT,
  stage        TEXT,                          -- POTRO, YEARLING, DOS_ANOS, JOVEN, PRIMERA_MONTA, COMPETICION, OTRO
  sale_name    TEXT,
  lot          TEXT,
  horse_name   TEXT,
  relevance    INT,
  triage       JSONB,
  status       TEXT NOT NULL DEFAULT 'NUEVO' CHECK (status IN ('NUEVO','RELEVANTE','DESCARTADO','DESCARGADO','ERROR')),
  error        TEXT,
  video_file   TEXT,
  sale_lot_id  UUID REFERENCES sale_lots(id) ON DELETE SET NULL,
  horse_id     UUID REFERENCES horses(id) ON DELETE SET NULL,
  found_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX video_candidates_status_idx ON video_candidates(status, relevance DESC);

CREATE TABLE crawler_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ,
  trigger      TEXT NOT NULL DEFAULT 'MANUAL',
  found        INT NOT NULL DEFAULT 0,
  added        INT NOT NULL DEFAULT 0,
  triaged      INT NOT NULL DEFAULT 0,
  downloaded   INT NOT NULL DEFAULT 0,
  log          JSONB NOT NULL DEFAULT '[]',
  error        TEXT
);
