// Rutas públicas: catálogo de disciplinas/razas y tarifas
const router = require('express').Router();
const { SERVICES, wrap } = require('../lib/common');
const { GROUPS, DISCIPLINES, BREEDS, FIELD_LABELS, TEXT_FIELDS, VIDEO_KINDS } = require('../lib/disciplines');
const { GENERAL, FILMING, DISCIPLINE_KNOWLEDGE, YOUNG, HEALTH, stagesFor } = require('../lib/knowledge');

router.get('/catalog', wrap(async (req, res) => {
  res.json({
    groups: GROUPS, disciplines: DISCIPLINES, breeds: BREEDS, fieldLabels: FIELD_LABELS, textFields: TEXT_FIELDS, videoKinds: VIDEO_KINDS,
    knowledge: { general: GENERAL, filming: FILMING, disciplines: DISCIPLINE_KNOWLEDGE, young: Object.fromEntries(Object.entries(YOUNG).map(([k, v]) => [k, v.levels])), health: HEALTH,
      stages: Object.fromEntries(Object.keys(YOUNG).map((k) => [k, stagesFor(k).map(({ weights, ...st }) => st)])) },
    services: Object.entries(SERVICES).map(([code, s]) => ({ code, ...s })),
  });
}));

module.exports = router;
