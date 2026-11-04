import { seed, Problem } from './domain.js';
export class WorkspaceStore {
  constructor(db) {this.db=db;}
  async load(id) {
    let row=await this.db.prepare('SELECT version, data FROM workspaces WHERE id = ?').bind(id).first();
    if(!row) {
      await this.db.prepare('INSERT OR IGNORE INTO workspaces (id, version, data) VALUES (?, 0, ?)').bind(id,JSON.stringify(seed())).run();
      row=await this.db.prepare('SELECT version, data FROM workspaces WHERE id = ?').bind(id).first();
    }
    return {version:row.version,state:JSON.parse(row.data)};
  }
  async save(id,version,state) {
    const result=await this.db.prepare('UPDATE workspaces SET data = ?, version = version + 1 WHERE id = ? AND version = ?').bind(JSON.stringify(state),id,version).run();
    if(result.meta.changes !== 1) throw new Problem(409,'Workspace changed in another request. Refresh and retry; no partial update was applied.');
  }
}
