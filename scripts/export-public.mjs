import {cp,mkdir,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
const target=resolve('.local/public-source');
await mkdir(target,{recursive:true});
for(const file of ['README.md','LICENSE','package.json','package-lock.json','drizzle.config.ts','.env.example','.gitignore','.github','worker','src','public','db','drizzle','test','scripts','docs'])await cp(file,resolve(target,file),{recursive:true});
await rm(resolve(target,'docs/custom-domain.md'),{force:true});
await mkdir(resolve(target,'.openai'),{recursive:true});
await writeFile(resolve(target,'.openai/hosting.json'),JSON.stringify({d1:'DB',r2:null},null,2)+'\n');
console.log(target);
