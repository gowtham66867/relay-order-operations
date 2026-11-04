import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
execFileSync(process.execPath,['scripts/build.mjs'],{stdio:'inherit'});
mkdirSync('.local',{recursive:true});
const sqlite=new DatabaseSync('.local/relay.sqlite');
// Local-only migration runner. Hosted schema changes run through Sites migrations.
const journal=JSON.parse(readFileSync('drizzle/meta/_journal.json','utf8'));
sqlite.exec('CREATE TABLE IF NOT EXISTS local_migrations (tag TEXT PRIMARY KEY)');
for(const migration of journal.entries){if(!sqlite.prepare('SELECT tag FROM local_migrations WHERE tag=?').get(migration.tag)){sqlite.exec(readFileSync(`drizzle/${migration.tag}.sql`,'utf8'));sqlite.prepare('INSERT INTO local_migrations(tag) VALUES (?)').run(migration.tag);}}
export const adaptDatabase=db=>({prepare(sql){return {bind(...values){return {async first(){return db.prepare(sql).get(...values)||null;},async run(){const r=db.prepare(sql).run(...values);return {meta:{changes:Number(r.changes)}};}};}};}});
const {default:worker}=await import(pathToFileURL(process.cwd()+'/dist/server/index.js'));
const env={DB:adaptDatabase(sqlite),LOCAL_DEV:'1',MODEL_API_KEY:process.env.MODEL_API_KEY,META_MODEL:process.env.META_MODEL,META_PROVIDER:process.env.META_PROVIDER,BASETEN_API_KEY:process.env.BASETEN_API_KEY,FIREWORKS_API_KEY:process.env.FIREWORKS_API_KEY};
const server=createServer(async(req,res)=>{try{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>25000){res.writeHead(413);res.end('Request too large');return;}chunks.push(chunk);}const request=new Request(`http://${req.headers.host}${req.url}`,{method:req.method,headers:req.headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})});const result=await worker.fetch(request,env);res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));}catch{res.writeHead(500);res.end('Local preview failed');}});
server.listen(Number(process.env.PORT||4173),'127.0.0.1',()=>console.log(`Relay Local: http://127.0.0.1:${server.address().port}`));
process.on('SIGINT',()=>server.close(()=>{sqlite.close();process.exit(0);}));
