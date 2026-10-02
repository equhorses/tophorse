// Rutas públicas: catálogo de disciplinas/razas y tarifas
const router = require('express').Router();
const { SERVICES, wrap } = require('../lib/common');
const { GROUPS, DISCIPLINES, BREEDS, FIELD_LABELS, VIDEO_KINDS } = require('../lib/disciplines');

router.get('/catalog', wrap(async (req, res) => {
  res.json({
    groups: GROUPS, disciplines: DISCIPLINES, breeds: BREEDS, fieldLabels: FIELD_LABELS, videoKinds: VIDEO_KINDS,
    services: Object.entries(SERVICES).map(([code, s]) => ({ code, ...s })),
  });
}));

module.exports = router;
