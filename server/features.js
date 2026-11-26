import { registerNearby } from './nearby.js';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { containsPoint } from '../public/territory.js';
import { appRoot, transaction, checkPassword, hashPassword } from './store.js';

export const territory = JSON.parse(await readFile(resolve(appRoot, 'public/data/sao-paulo.geojson'), 'utf8'));
export const inSaoPaulo = (lat, lng) => containsPoint(territory, lat, lng);
export let scope = 'p.local_id IN (SELECT id FROM locais WHERE municipio_codigo=3550308)';
export let usesLegacyLocations = false;
export async function upgrade(db) {
  const sql = await readFile(resolve(appRoot, 'db/upgrade.sql'), 'utf8');
  for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) await db.query(statement);
  const [legacy] = await db.query("SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='locais_verificados'");
  usesLegacyLocations = Boolean(legacy.length);
  if (!usesLegacyLocations) return;
  scope = 'p.local_id IN (SELECT local_id FROM locais_verificados WHERE municipio_codigo=3550308)';
  const [pending] = await db.query(`SELECT l.id,l.latitude,l.longitude FROM locais l
    LEFT JOIN locais_verificados v ON v.local_id=l.id WHERE v.local_id IS NULL`);
  for (const local of pending) {
    await db.execute(`INSERT INTO locais_verificados (local_id,municipio_codigo) VALUES (?,?)
      ON DUPLICATE KEY UPDATE local_id=locais_verificados.local_id`,
      [local.id,inSaoPaulo(local.latitude,local.longitude) ? 3550308 : 0]);
  }
}

export async function migrateLocations(db) {
  const conn = await db.getConnection();
  const lock = "SHA2(CONCAT(DATABASE(), ':municipio-locais'), 256)";
  try {
    const [[{ acquired }]] = await conn.query(`SELECT GET_LOCK(${lock}, 30) AS acquired`);
    if (acquired !== 1) throw new Error('Não foi possível atualizar o cadastro de locais.');
    const [columns] = await conn.query("SHOW COLUMNS FROM locais LIKE 'municipio_codigo'");
    if (!columns.length) await conn.query('ALTER TABLE locais ADD COLUMN municipio_codigo integer');
    const [legacy] = await conn.query("SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='locais_verificados'");
    if (legacy.length) {
      await conn.query('UPDATE locais l JOIN locais_verificados v ON v.local_id=l.id SET l.municipio_codigo=v.municipio_codigo');
    }
    const [locations] = await conn.query('SELECT id,latitude,longitude FROM locais WHERE municipio_codigo IS NULL');
    for (const local of locations) {
      await conn.execute('UPDATE locais SET municipio_codigo=? WHERE id=? AND municipio_codigo IS NULL',
        [inSaoPaulo(local.latitude,local.longitude) ? 3550308 : 0, local.id]);
    }
    if (legacy.length) {
      const [mismatches] = await conn.query(`SELECT v.local_id FROM locais_verificados v
        LEFT JOIN locais l ON l.id=v.local_id WHERE NOT (l.municipio_codigo <=> v.municipio_codigo) LIMIT 1`);
      if (mismatches.length) throw new Error('Os códigos de município da tabela antiga não foram preservados.');
      await conn.query('DROP TABLE locais_verificados');
    }
  } finally {
    try { await conn.query(`SELECT RELEASE_LOCK(${lock})`); }
    finally { conn.release(); }
  }
}
export async function notifyStatus(conn, reportId, actor, status) {
  const labels = { aberta:'reaberta', andamento:'colocada em andamento', resolvida:'resolvida' };
  await conn.execute(`INSERT INTO notificacoes (usuario_id,ocorrencia_id,mensagem)
    SELECT u.id, o.id, CONCAT('A ocorrência CV-', LPAD(o.id, GREATEST(6, CHAR_LENGTH(o.id)), '0'), ' foi ', ?, '.')
    FROM usuarios u JOIN ocorrencias o ON o.id=?
    WHERE u.id<>? AND (u.id=o.autor_id OR EXISTS (SELECT 1 FROM acompanhamentos a WHERE a.ocorrencia_id=o.id AND a.usuario_id=u.id))`,
    [labels[status], reportId, actor]);
}
export function registerFeatures(app, db, { requireUser, rows, fail, clean, id }) {
  registerNearby(app, db, { rows, fail, scope, inSaoPaulo });
  app.get('/api/painel', async (_req,res) => {
    const [totals] = await rows(db, `SELECT count(*) total,
      coalesce(sum(status='aberta'),0) abertas,coalesce(sum(status='andamento'),0) andamento,
      coalesce(sum(status='resolvida'),0) resolvidas, coalesce(sum(confirmacoes),0) confirmacoes
      FROM painel_ocorrencias p WHERE ${scope}`);
    const categories = await rows(db, `SELECT categoria, count(*) total FROM painel_ocorrencias p WHERE ${scope} GROUP BY categoria ORDER BY total DESC,categoria`);
    const daily = await rows(db, `SELECT DATE_FORMAT(criado_em,'%Y-%m-%d') dia, count(*) total FROM painel_ocorrencias p WHERE ${scope} AND criado_em>=DATE_SUB(UTC_DATE(),INTERVAL 13 DAY) GROUP BY dia ORDER BY dia`);
    const [periodos] = await rows(db, `SELECT
      COUNT(CASE WHEN criado_em >= NOW() - INTERVAL 7 DAY THEN 1 END) AS d7,
      COUNT(CASE WHEN criado_em >= NOW() - INTERVAL 14 DAY THEN 1 END) AS d14,
      COUNT(CASE WHEN criado_em >= NOW() - INTERVAL 30 DAY THEN 1 END) AS d30,
      COUNT(CASE WHEN criado_em >= NOW() - INTERVAL 60 DAY THEN 1 END) AS d60,
      COUNT(CASE WHEN criado_em >= NOW() - INTERVAL 90 DAY THEN 1 END) AS d90,
      COUNT(*) AS d180 FROM ocorrencias p WHERE ${scope} AND criado_em >= NOW() - INTERVAL 180 DAY`);
    res.json({totais:totals, categorias:categories, dias:daily, periodos});
  });
  app.get('/api/atividade', async (req, res) => {
    const conditions = [scope];
    const params = [];
    if (req.query.status) {
      if (!['aberta','andamento','resolvida'].includes(req.query.status)) fail(400, 'Status inválido.');
      conditions.push('h.status=?');
      params.push(req.query.status);
    }
    if (req.query.periodo) {
      if (!['7','30','90'].includes(req.query.periodo)) fail(400, 'Período inválido.');
      conditions.push('h.criado_em >= DATE_SUB(NOW(), INTERVAL ? DAY)');
      params.push(Number(req.query.periodo));
    }
    if (req.query.antes) {
      conditions.push('h.id<?');
      params.push(id(req.query.antes));
    }
    const activity = await rows(db, 'SELECT h.id,h.ocorrencia_id,h.status,h.criado_em,p.titulo,c.nome AS categoria ' +
      'FROM historico_status h JOIN ocorrencias p ON p.id=h.ocorrencia_id JOIN categorias c ON c.id=p.categoria_id WHERE ' +
      conditions.join(' AND ') + ' ORDER BY h.id DESC LIMIT 21', params);
    const eventos = activity.slice(0,20);
    res.json({ eventos, proximo:activity.length>20 ? eventos.at(-1).id : null });
  });
  app.get('/api/notificacoes', requireUser, async (req,res) => res.json(await rows(db,
    `SELECT n.* FROM notificacoes n JOIN ocorrencias p ON p.id=n.ocorrencia_id WHERE n.usuario_id=? AND ${scope} ORDER BY n.id DESC LIMIT 100`,[req.user.id])));
  app.put('/api/notificacoes/lidas', requireUser, async (req,res) => {
    await rows(db,'UPDATE notificacoes SET lida=true WHERE usuario_id=?',[req.user.id]);
    res.status(204).end();
  });
  app.patch('/api/perfil', requireUser, async (req,res) => {
    const nome=clean(req.body?.nome,100,2,'O nome');
    await rows(db,'UPDATE usuarios SET nome=? WHERE id=?',[nome,req.user.id]);
    res.json({ ...req.user, nome });
  });
  app.put('/api/senha', requireUser, async (req,res) => {
    const atual=req.body?.atual, nova=req.body?.nova;
    if (typeof atual!=='string'||atual.length>128||typeof nova!=='string'||nova.trim().length<8||nova.length>128) fail(400,'Informe a senha atual e escolha uma nova com 8 a 128 caracteres.');
    await transaction(db,async conn => {
      const [user]=await rows(conn,'SELECT senha_hash FROM usuarios WHERE id=? FOR UPDATE',[req.user.id]);
      if (!await checkPassword(atual,user.senha_hash)) fail(403,'A senha atual está incorreta.');
      await rows(conn,'UPDATE usuarios SET senha_hash=? WHERE id=?',[await hashPassword(nova),req.user.id]);
      await rows(conn,'DELETE FROM sessoes WHERE usuario_id=?',[req.user.id]);
    });
    res.status(204).end();
  });
  app.use('/api/ocorrencias/:id', async (req,_res,next) => {
    const [report]=await rows(db,`SELECT p.id FROM ocorrencias p WHERE p.id=? AND ${scope}`,[id(req.params.id)]);
    if (!report) fail(404,'Não encontramos essa ocorrência em São Paulo.');
    next();
  });
  app.put('/api/ocorrencias/:id/acompanhamento', requireUser, async (req,res) => {
    if (typeof req.body?.ativo!=='boolean') fail(400,'Informe se deseja acompanhar a ocorrência.');
    const reportId=id(req.params.id);
    if (req.body.ativo) await rows(db,'INSERT INTO acompanhamentos (usuario_id,ocorrencia_id) VALUES (?,?) ON DUPLICATE KEY UPDATE usuario_id=usuario_id',[req.user.id,reportId]);
    else await rows(db,'DELETE FROM acompanhamentos WHERE usuario_id=? AND ocorrencia_id=?',[req.user.id,reportId]);
    res.status(204).end();
  });
  app.get('/api/ocorrencias/:id/comentarios', async (req,res) => {
    const before=req.query.antes ? id(req.query.antes) : 2147483647;
    res.json(await rows(db,`SELECT c.id,c.texto,c.criado_em,c.usuario_id,u.nome FROM comentarios c JOIN usuarios u ON u.id=c.usuario_id
      WHERE c.ocorrencia_id=? AND c.id<? ORDER BY c.id DESC LIMIT 30`,[id(req.params.id),before]));
  });
  app.post('/api/ocorrencias/:id/comentarios', requireUser, async (req,res) => {
    const texto=clean(req.body?.texto,1000,3,'O comentário');
    const result=await rows(db,'INSERT INTO comentarios (usuario_id,ocorrencia_id,texto) VALUES (?,?,?)',[req.user.id,id(req.params.id),texto]);
    res.status(201).json({id:result.insertId});
  });
  app.delete('/api/ocorrencias/:id/comentarios/:comentario', requireUser, async (req,res) => {
    const params=[id(req.params.comentario),id(req.params.id)];
    let condition='';
    if (req.user.papel!=='admin') {condition=' AND usuario_id=?';params.push(req.user.id);}
    const result=await rows(db,'DELETE FROM comentarios WHERE id=? AND ocorrencia_id=?'+condition,params);
    if (!result.affectedRows) fail(404,'O comentário foi excluído ou você não tem permissão para excluí-lo.');
    res.status(204).end();
  });
}
