import {DomainError} from "./errors";
import {serializeDomainTransaction} from "./transaction-lock";
function busy(error:unknown,seen=new Set<unknown>()):boolean{
  if(!error || typeof error!=="object" || seen.has(error))return false;
  seen.add(error);
  return ("code" in error && /SQLITE_BUSY|SQLITE_LOCKED/.test(String(error.code))) || ("cause" in error && busy(error.cause,seen));
}
/** SQLite arbitrates between processes; the local queue only reduces contention. */
export async function logisticsTransaction<T>(operation:()=>Promise<T>):Promise<T>{
  return serializeDomainTransaction(async()=>{
    for(let attempt=0;;attempt++){
      try{return await operation();}catch(error){
        if(!busy(error))throw error;
        if(attempt>=12)throw new DomainError("Outra operação está em andamento. Atualize a página e tente novamente.",409,"LOGISTICS_BUSY");
        await new Promise(resolve=>setTimeout(resolve,Math.min(1000,25*2**attempt)));
      }
    }
  });
}
