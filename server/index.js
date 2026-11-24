import { upgrade, inSaoPaulo, registerFeatures, notifyStatus, scope } from './features.js';
import './config.js';
import express from 'express';
import multer from 'multer';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { appRoot, openDatabase, hashPassword, checkPassword, tokenHash, transaction } from './store.js';

const db = await openDatabase();
await upgrade(db);
const app = express();
const oneWeek = 7 * 24 * 3600 * 1000;
const states = ['aberta', 'andamento', 'resolvida'];
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 10, fieldSize: 10000 } });
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('X-Frame-Options', 'DENY');
  next();
});
app.use('/api', express.json({ limit: '20kb' }), (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('Origin')) {
    if (req.get('Origin') !== req.protocol + '://' + req.get('Host')) return res.status(403).json({ erro: 'Origem inválida.' });
  }
  next();
});
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const rows = async (connection, sql, params = []) => (await connection.execute(sql, params))[0];
const clean = (value, max, min = 0) => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length < min || text.length > max) fail(400, 'Confira o tamanho dos campos.');
  return text;
};
const id = value => {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 2147483647) fail(400, 'Identificador inválido.');
  return number;
};
const email = value => {
  const result = clean(value, 254, 3).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) fail(400, 'Informe um e-mail válido.');
  return result;
};
const cookie = { httpOnly: true, sameSite: 'lax', path: '/', secure: process.env.COOKIE_SECURE === 'true' };
const sessionToken = req => (req.get('cookie') || '').match(/(?:^|;\s*)cv_session=([a-f0-9]{64})(?:;|$)/)?.[1];
async function currentUser(req) {
  const token = sessionToken(req);
  if (!token) return null;
  const [user] = await rows(db, 'SELECT u.id,u.nome,u.email,u.papel FROM sessoes s JOIN usuarios u ON u.id=s.usuario_id WHERE s.token_hash=? AND s.expira_em>NOW()', [tokenHash(token)]);
  return user || null;
}
async function requireUser(req, _res, next) {
  req.user = await currentUser(req);
  if (!req.user) fail(401, 'Entre na sua conta para continuar.');
  next();
}
async function startSession(req, res, user) {
  const token = randomBytes(32).toString('hex');
  const olderToken = sessionToken(req);
  await transaction(db, async conn => {
    if (olderToken) await rows(conn, 'DELETE FROM sessoes WHERE token_hash=?', [tokenHash(olderToken)]);
    await rows(conn, 'DELETE FROM sessoes WHERE expira_em<=NOW()');
    await rows(conn, 'INSERT INTO sessoes VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))', [tokenHash(token), user.id]);
  });
  res.cookie('cv_session', token, { ...cookie, maxAge: oneWeek });
  res.json({ usuario: { id: user.id, nome: user.nome, email: user.email, papel: user.papel } });
}
const attempts = new Map();
function limitAuth(req, _res, next) {
  const now = Date.now();
  for (const [ip, entry] of attempts) if (entry.until < now) attempts.delete(ip);
  const entry = attempts.get(req.ip) || { count: 0, until: now + 600000 };
  attempts.set(req.ip, entry);
  if (++entry.count > 30) fail(429, 'Aguarde alguns minutos para tentar novamente.');
  next();
}
app.get('/api/saude', async (_req, res) => {
  await db.query('SELECT 1');
  res.json({ banco: 'MySQL', online: true });
});
app.get('/api/sessao', async (req, res) => res.json({ usuario: await currentUser(req) }));
app.post('/api/cadastro', limitAuth, async (req, res) => {
  const { nome, email: inputEmail, senha } = req.body || {};
  const name = clean(nome, 100, 2);
  const login = email(inputEmail);
  if (typeof senha !== 'string' || senha.trim().length < 8 || senha.length > 128) fail(400, 'Use uma senha de 8 a 128 caracteres.');
  const result = await rows(db, 'INSERT INTO usuarios (nome,email,senha_hash) VALUES (?,?,?)', [name, login, await hashPassword(senha)]);
  res.status(201);
  await startSession(req, res, { id: result.insertId, nome: name, email: login, papel: 'cidadao' });
});
app.post('/api/login', limitAuth, async (req, res) => {
  const { email: inputEmail, senha } = req.body || {};
  const login = email(inputEmail);
  if (typeof senha !== 'string' || senha.length > 128) fail(400, 'Senha inválida.');
  const [user] = await rows(db, 'SELECT id,nome,email,papel,senha_hash FROM usuarios WHERE email=?', [login]);
  if (!(await checkPassword(senha, user?.senha_hash))) fail(401, 'E-mail ou senha incorretos.');
  await startSession(req, res, user);
});
app.post('/api/sair', async (req, res) => {
  const token = sessionToken(req);
  if (token) await rows(db, 'DELETE FROM sessoes WHERE token_hash=?', [tokenHash(token)]);
  res.clearCookie('cv_session', cookie).status(204).end();
});
app.get('/api/categorias', async (_req, res) => res.json(await rows(db, 'SELECT id,nome FROM categorias ORDER BY nome')));
registerFeatures(app, db, { requireUser, rows, fail, clean, id });
const selectReport = 'SELECT p.*, EXISTS(SELECT 1 FROM confirmacoes x WHERE x.ocorrencia_id=p.id AND x.usuario_id=?) AS confirmada, EXISTS(SELECT 1 FROM acompanhamentos a WHERE a.ocorrencia_id=p.id AND a.usuario_id=?) AS acompanhando, (SELECT count(*) FROM comentarios c WHERE c.ocorrencia_id=p.id) AS comentarios FROM painel_ocorrencias p';
app.get('/api/ocorrencias', async (req, res) => {
  const user = await currentUser(req);
  const params = [user?.id || 0, user?.id || 0];
  const filters = [scope];
  if (req.query.escopo) {
    if (!user) fail(401, 'Entre na sua conta para ver suas ocorrências.');
    if (req.query.escopo === 'minhas') { filters.push('p.autor_id=?'); params.push(user.id); }
    else if (req.query.escopo === 'acompanhando') { filters.push('EXISTS(SELECT 1 FROM acompanhamentos a WHERE a.ocorrencia_id=p.id AND a.usuario_id=?)'); params.push(user.id); }
    else fail(400, 'Filtro inválido.');
  }
  if (req.query.categoria) { filters.push('categoria_id=?'); params.push(id(req.query.categoria)); }
  if (req.query.status) {
    if (!states.includes(req.query.status)) fail(400, 'Status inválido.');
    filters.push('status=?'); params.push(req.query.status);
  }
  if (req.query.busca) {
    const value = clean(req.query.busca, 100);
    filters.push("(LOCATE(?,titulo)>0 OR LOCATE(?,endereco)>0 OR LOCATE(?,descricao)>0)");
    params.push(value, value, value);
  }
  const where = filters.length ? ' WHERE ' + filters.join(' AND ') : '';
  const order = req.query.ordem === 'recente' ? 'p.criado_em DESC' : "(p.status='resolvida'), p.prioridade DESC, p.criado_em DESC";
  const page = req.query.pagina ? id(req.query.pagina) : 1;
  const reports = await rows(db, selectReport + where + ' ORDER BY ' + order + ',p.id DESC LIMIT 101 OFFSET ?', [...params, (page - 1) * 100]);
  res.json({ ocorrencias: reports.slice(0, 100), mais: reports.length > 100 });
});
app.get('/api/ocorrencias/:id', async (req, res) => {
  const reportId = id(req.params.id);
  const user = await currentUser(req);
  const [report] = await rows(db, selectReport + ' WHERE p.id=?', [user?.id || 0, user?.id || 0, reportId]);
  if (!report) fail(404, 'Ocorrência não encontrada.');
  report.historico = await rows(db, 'SELECT status,nota,criado_em FROM historico_status WHERE ocorrencia_id=? ORDER BY id DESC', [reportId]);
  res.json(report);
});
function imageType(buffer) {
  if (buffer.subarray(0, 3).toString('hex') === 'ffd8ff') return 'image/jpeg';
  if (buffer.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return 'image/png';
  if (buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  fail(400, 'Envie uma foto JPEG, PNG ou WebP.');
}
app.post('/api/ocorrencias', requireUser, upload.single('foto'), async (req, res) => {
  const data = req.body || {};
  const title = clean(data.titulo, 100, 5);
  const description = clean(data.descricao, 2000, 10);
  const address = clean(data.endereco, 250) || null;
  const coordinate = (value, limit) => {
    if (value == null || value === '') return null;
    if (typeof value !== 'string' && typeof value !== 'number') fail(400, 'Coordenadas inválidas.');
    const number = Number(value);
    if (!Number.isFinite(number) || Math.abs(number) > limit || !String(value).trim()) fail(400, 'Coordenadas inválidas.');
    return number;
  };
  const lat = coordinate(data.latitude, 90);
  const lng = coordinate(data.longitude, 180);
  if (lat === null || lng === null || !inSaoPaulo(lat, lng)) fail(400, 'Marque um ponto dentro do município de São Paulo.');
  const type = req.file ? imageType(req.file.buffer) : null;
  const category = id(data.categoria_id);
  const reportId = await transaction(db, async conn => {
    if (!(await rows(conn, 'SELECT id FROM categorias WHERE id=?', [category])).length) fail(400, 'Selecione uma categoria válida.');
    const location = await rows(conn, 'INSERT INTO locais (endereco,latitude,longitude) VALUES (?,?,?)', [address, lat, lng]);
    await rows(conn, 'INSERT INTO locais_verificados VALUES (?,3550308)', [location.insertId]);
    const report = await rows(conn, 'INSERT INTO ocorrencias (autor_id,categoria_id,local_id,titulo,descricao) VALUES (?,?,?,?,?)', [req.user.id, category, location.insertId, title, description]);
    if (req.file) await rows(conn, 'INSERT INTO fotos (ocorrencia_id,tipo,conteudo) VALUES (?,?,?)', [report.insertId, type, req.file.buffer]);
    await rows(conn, "INSERT INTO historico_status (ocorrencia_id,usuario_id,status) VALUES (?,?,'aberta')", [report.insertId, req.user.id]);
    return report.insertId;
  });
  res.status(201).json({ id: reportId });
});
app.get('/api/fotos/:id', async (req, res) => {
  const [photo] = await rows(db, `SELECT f.tipo,f.conteudo FROM fotos f JOIN ocorrencias p ON p.id=f.ocorrencia_id WHERE f.id=? AND ${scope}`, [id(req.params.id)]);
  if (!photo) fail(404, 'Foto não encontrada.');
  res.type(photo.tipo).send(photo.conteudo);
});
app.put('/api/ocorrencias/:id/confirmacao', requireUser, async (req, res) => {
  await transaction(db, async conn => {
    const reportId = id(req.params.id);
    const [report] = await rows(conn, 'SELECT autor_id,status FROM ocorrencias WHERE id=? FOR UPDATE', [reportId]);
    if (!report) fail(404, 'Ocorrência não encontrada.');
    if (report.autor_id === req.user.id) fail(403, 'A confirmação deve vir de outro cidadão.');
    if (report.status === 'resolvida') fail(409, 'Esta ocorrência já foi resolvida.');
    await rows(conn, 'INSERT INTO confirmacoes (usuario_id,ocorrencia_id) VALUES (?,?) ON DUPLICATE KEY UPDATE criado_em=criado_em', [req.user.id, reportId]);
  });
  res.status(204).end();
});
app.patch('/api/ocorrencias/:id/status', requireUser, async (req, res) => {
  if (req.user.papel !== 'admin') fail(403, 'Acesso reservado à administração.');
  const reportId = id(req.params.id);
  const { status, nota } = req.body || {};
  if (!states.includes(status)) fail(400, 'Status inválido.');
  const note = clean(nota, 500) || null;
  await transaction(db, async conn => {
    const [report] = await rows(conn, 'SELECT status FROM ocorrencias WHERE id=? FOR UPDATE', [reportId]);
    if (!report) fail(404, 'Ocorrência não encontrada.');
    if (report.status === status) return;
    await rows(conn, 'UPDATE ocorrencias SET status=? WHERE id=?', [status, reportId]);
    await rows(conn, 'INSERT INTO historico_status (ocorrencia_id,usuario_id,status,nota) VALUES (?,?,?,?)', [reportId, req.user.id, status, note]);
    await notifyStatus(conn, reportId, req.user.id, status);
  });
  res.status(204).end();
});
app.use('/api', (_req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));
app.use('/three', express.static(resolve(appRoot, 'node_modules/three/build')));
app.use('/maplibre', express.static(resolve(appRoot, 'node_modules/maplibre-gl/dist')));
app.use('/leaflet', express.static(resolve(appRoot, 'node_modules/leaflet/dist')));
app.use(express.static(resolve(appRoot, 'public')));
app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) return res.status(400).json({ erro: error.code === 'LIMIT_FILE_SIZE' ? 'A foto deve ter até 5 MB.' : 'Confira os campos e envie no máximo uma foto.' });
  if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ erro: 'Este e-mail já está cadastrado.' });
  const status = error.status || 500;
  if (status >= 500) console.error(error);
  res.status(status).json({ erro: status >= 500 ? 'Não foi possível concluir a operação.' : status === 413 ? 'O conteúdo é grande demais.' : error.message });
});
const port = Number(process.env.PORT || 3333);
const server = app.listen(port, process.env.HOST || '127.0.0.1', () => console.log('Cidade Viva: http://localhost:' + port));
server.on('error', async error => { console.error(error.message); await db.end(); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(async () => { await db.end(); }));

