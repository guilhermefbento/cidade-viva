import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { containsPoint } from '../public/territory.js';
import { appRoot, transaction, checkPassword, hashPassword } from './store.js';

export const territory = JSON.parse(await readFile(resolve(appRoot, 'public/data/sao-paulo.geojson'), 'utf8'));
export const inSaoPaulo = (lat, lng) => containsPoint(territory, lat, lng);
export const scope = 'p.local_id IN (SELECT local_id FROM locais_verificados WHERE municipio_codigo=3550308)';
export async function upgrade(db) {
  const sql = await readFile(resolve(appRoot, 'db/upgrade.sql'), 'utf8');
  for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) await db.query(statement);
  const [locations] = await db.query('SELECT l.id,l.latitude,l.longitude FROM locais l LEFT JOIN locais_verificados v ON v.local_id=l.id WHERE v.local_id IS NULL');
  for (const local of locations) {
    await db.execute('INSERT INTO locais_verificados (local_id,municipio_codigo) VALUES (?,?) ON DUPLICATE KEY UPDATE local_id=locais_verificados.local_id',
      [local.id,inSaoPaulo(local.latitude,local.longitude) ? 3550308 : 0]);
  }
}
export async function notifyStatus(conn, reportId, actor, status) {
  const labels = { aberta:'reaberta', andamento:'colocada em andamento', resolvida:'resolvida' };
  await conn.execute(`INSERT INTO notificacoes (usuario_id,ocorrencia_id,mensagem)
    SELECT u.id, o.id, CONCAT('Ocorrência #', o.id, ' ', ?)
    FROM usuarios u JOIN ocorrencias o ON o.id=?
    WHERE u.id<>? AND (u.id=o.autor_id OR EXISTS (SELECT 1 FROM acompanhamentos a WHERE a.ocorrencia_id=o.id AND a.usuario_id=u.id))`,
    [labels[status], reportId, actor]);
}
export function registerFeatures(app, db, { requireUser, rows, fail, clean, id }) {
  app.get('/api/painel', async (_req,res) => {
    const [totals] = await rows(db, `SELECT count(*) total,
      coalesce(sum(status='aberta'),0) abertas,coalesce(sum(status='andamento'),0) andamento,
      coalesce(sum(status='resolvida'),0) resolvidas, coalesce(sum(confirmacoes),0) confirmacoes
      FROM painel_ocorrencias p WHERE ${scope}`);
    const categories = await rows(db, `SELECT categoria, count(*) total FROM painel_ocorrencias p WHERE ${scope} GROUP BY categoria ORDER BY total DESC,categoria`);
    const daily = await rows(db, `SELECT DATE_FORMAT(criado_em,'%Y-%m-%d') dia, count(*) total FROM painel_ocorrencias p WHERE ${scope} AND criado_em>=DATE_SUB(UTC_DATE(),INTERVAL 13 DAY) GROUP BY dia ORDER BY dia`);
    res.json({totais:totals, categorias:categories, dias:daily});
  });
  app.get('/api/notificacoes', requireUser, async (req,res) => res.json(await rows(db,
    `SELECT n.* FROM notificacoes n JOIN ocorrencias p ON p.id=n.ocorrencia_id WHERE n.usuario_id=? AND ${scope} ORDER BY n.id DESC LIMIT 100`,[req.user.id])));
  app.put('/api/notificacoes/lidas', requireUser, async (req,res) => {
    await rows(db,'UPDATE notificacoes SET lida=true WHERE usuario_id=?',[req.user.id]);
    res.status(204).end();
  });
  app.patch('/api/perfil', requireUser, async (req,res) => {
    const nome=clean(req.body?.nome,100,2);
    await rows(db,'UPDATE usuarios SET nome=? WHERE id=?',[nome,req.user.id]);
    res.json({ ...req.user, nome });
  });
  app.put('/api/senha', requireUser, async (req,res) => {
    const atual=req.body?.atual, nova=req.body?.nova;
    if (typeof atual!=='string'||atual.length>128||typeof nova!=='string'||nova.trim().length<8||nova.length>128) fail(400,'Confira a senha atual e use uma nova senha de 8 a 128 caracteres.');
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
    if (!report) fail(404,'Ocorrência não encontrada no município de São Paulo.');
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
    const texto=clean(req.body?.texto,1000,3);
    const result=await rows(db,'INSERT INTO comentarios (usuario_id,ocorrencia_id,texto) VALUES (?,?,?)',[req.user.id,id(req.params.id),texto]);
    res.status(201).json({id:result.insertId});
  });
  app.delete('/api/ocorrencias/:id/comentarios/:comentario', requireUser, async (req,res) => {
    const params=[id(req.params.comentario),id(req.params.id)];
    let condition='';
    if (req.user.papel!=='admin') {condition=' AND usuario_id=?';params.push(req.user.id);}
    const result=await rows(db,'DELETE FROM comentarios WHERE id=? AND ocorrencia_id=?'+condition,params);
    if (!result.affectedRows) fail(404,'Comentário não encontrado ou sem permissão.');
    res.status(204).end();
  });
}
