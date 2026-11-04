import { build } from 'esbuild';
import {mkdir,copyFile,rm} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});
await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await build({entryPoints:['worker/index.js'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'dist/server/index.js',loader:{'.html':'text','.css':'text'},plugins:[{name:'client-text',setup(b){b.onLoad({filter:/public\/client\.js$/},async args=>({contents:await (await import('node:fs/promises')).readFile(args.path,'utf8'),loader:'text'}));}}]});
await copyFile('.openai/hosting.json','dist/.openai/hosting.json');
console.log('Built Relay Worker and embedded interface.');
