import {createHash} from 'node:crypto';
import {seed, Problem} from './domain.js';

// The version check and write are one transaction, including across instances.
export class FirestoreWorkspaceStore {
  constructor(db) { this.collection=db.collection('relay_workspaces'); this.db=db; }
  ref(id) { return this.collection.doc(createHash('sha256').update(id).digest('hex')); }
  async load(id) {
    return this.db.runTransaction(async tx=>{
      const ref=this.ref(id), snapshot=await tx.get(ref);
      if(snapshot.exists) {const row=snapshot.data();return {version:row.version,state:JSON.parse(row.data)};}
      const state=seed();tx.create(ref,{version:0,data:JSON.stringify(state)});
      return {version:0,state};
    });
  }
  async save(id,version,state) {
    const data=JSON.stringify(state);
    if(Buffer.byteLength(data)>850000) throw new Problem(422,'Workspace storage limit reached. Export and reset the synthetic workspace.');
    await this.db.runTransaction(async tx=>{
      const ref=this.ref(id),snapshot=await tx.get(ref);
      if(!snapshot.exists || snapshot.data().version!==version) throw new Problem(409,'Workspace changed in another request. Refresh and retry; no partial update was applied.');
      tx.update(ref,{version:version+1,data});
    });
  }
}
