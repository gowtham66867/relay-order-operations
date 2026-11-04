import {createServer} from 'node:http';
import {Firestore} from '@google-cloud/firestore';
import {FirestoreWorkspaceStore} from '../src/firestore-storage.js';
import worker from '../dist/server/index.js';

// Cloud Run IAM is mandatory. This service serves the owner's private workspace.
// Never trust client-supplied Sites identity headers on this different platform.
const env={WORKSPACE_STORE:new FirestoreWorkspaceStore(new Firestore({databaseId:process.env.FIRESTORE_DATABASE||'(default)'})),
  MODEL_API_KEY:process.env.MODEL_API_KEY,META_MODEL:process.env.META_MODEL,META_PROVIDER:process.env.META_PROVIDER};
const identity='cloud-run-owner';
const server=createServer(async(req,res)=>{
  try {
    if(req.url==='/healthz'){res.writeHead(200,{'Content-Type':'text/plain'});res.end('ok');return;}
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>25000){res.writeHead(413);res.end('Request too large');return;}chunks.push(chunk);}
    const headers=new Headers();
    for(const [key,value] of Object.entries(req.headers)) if(value && !key.startsWith('oai-') && key!=='authorization')headers.set(key,Array.isArray(value)?value.join(','):value);
    headers.set('oai-authenticated-user-id',identity);
    const proxyOrigin=process.env.LOCAL_PROXY_ORIGIN;
    const origin=proxyOrigin && headers.get('origin')===proxyOrigin ? proxyOrigin : process.env.PUBLIC_ORIGIN||`https://${req.headers.host}`;
    const request=new Request(new URL(req.url,origin),{method:req.method,headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})});
    const response=await worker.fetch(request,env);
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){console.error('Request failed:',error.name);res.writeHead(500);res.end('Unable to complete request');}
});
server.listen(Number(process.env.PORT||8080),'0.0.0.0',()=>console.log('Relay Cloud Run ready'));
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
