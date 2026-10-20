import {existsSync,mkdirSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {dirname} from 'node:path';
import {canonicalJSON,contentHash} from './goals.js';

export function writeJSON(path,value){
 mkdirSync(dirname(path),{recursive:true});
 writeFileSync(path+'.tmp',JSON.stringify(value,null,2)+'\n');
 renameSync(path+'.tmp',path);
}
export const readJSON=path=>JSON.parse(readFileSync(path,'utf8'));
/** Preserve scientific inputs while permitting source-only changes on resume.
 * Return the original saved lock hash to retain optimizer-state identity.
 */
export function lockConfiguration(path,configuration,{ignoreSource=false}={}){
 const value={schema:'uba-configuration-lock-v1',hash:contentHash(configuration),configuration};
 if(!existsSync(path)){writeJSON(path,value);return value;}
 const saved=readJSON(path);
 if(saved.schema!==value.schema||saved.hash!==contentHash(saved.configuration))
  throw Error('Corrupt configuration lock: '+path);
 const inputs=object=>{
  if(!ignoreSource)return object;
  const {source,...withoutSource}=object;
  return withoutSource;
 };
 if(canonicalJSON(inputs(saved.configuration))!==canonicalJSON(inputs(configuration)))
  throw Error('Incompatible resume configuration: '+path);
 return saved;
}
