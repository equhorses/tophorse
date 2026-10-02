// Al arrancar: aplica migraciones y crea la cuenta de dirección.
const bcrypt = require('bcryptjs');
const db = require('./db');

async function bootstrap() {
  await db.migrate();

  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (ADMIN_EMAIL && ADMIN_PASSWORD) {
    const email = ADMIN_EMAIL.trim().toLowerCase();
    const existing = await db.one('SELECT id, role FROM users WHERE email=$1', [email]);
    if (!existing) {
      await db.query(
        "INSERT INTO users(email, password, role, first_name, last_name, country) VALUES ($1,$2,'ADMIN','Dirección','TopHorses','España')",
        [email, await bcrypt.hash(ADMIN_PASSWORD, 10)],
      );
      console.log(`Cuenta de dirección creada: ${email}`);
    } else if (existing.role !== 'ADMIN') {
      await db.query("UPDATE users SET role='ADMIN' WHERE id=$1", [existing.id]);
    }
  }
}

module.exports = bootstrap;
