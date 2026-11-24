import './config.js';
import { openDatabase } from './store.js';

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error('Uso: npm run admin -- email@exemplo.com');
  process.exitCode = 1;
} else {
  const db = await openDatabase();
  try {
    const [result] = await db.execute("UPDATE usuarios SET papel = 'admin' WHERE email = ?", [email]);
    if (!result.affectedRows) {
      console.error('Cadastre esse e-mail no Cidade Viva primeiro.');
      process.exitCode = 1;
    } else console.log(email + ' agora tem acesso de administrador.');
  } finally {
    await db.end();
  }
}

