/** Stable indexes are never renumbered when another unit is cancelled. */
export function availableWarehouseUnits(quantity: number, received: number[], cancelled: { unitStart: number; quantity: number }[], reserved: number[]) {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000) throw new Error("Quantidade inválida.");
  const unavailable = new Set(reserved);
  for (const range of cancelled) for (let i = range.unitStart; i < range.unitStart + range.quantity; i++) unavailable.add(i);
  if (new Set(received).size !== received.length || received.some(i => !Number.isSafeInteger(i) || i < 0 || i >= quantity)) throw new Error("Unidades recebidas inválidas.");
  return received.filter(i => !unavailable.has(i)).sort((a,b) => a-b);
}

/** Exact, stable per-unit capacities. A later reservation cannot move cents. */
export function unitMinorCapacity(total: number, quantity: number, unitIndex: number) {
  if (![total, quantity, unitIndex].every(Number.isSafeInteger) || total < 0 || quantity < 1 || unitIndex < 0 || unitIndex >= quantity) throw new Error("Capacidade inválida.");
  const amount = BigInt(total), count = BigInt(quantity), index = BigInt(unitIndex);
  return Number(amount / count + (index < amount % count ? 1n : 0n));
}

/** Integer transport matrix preserving BOTH unit totals and personal totals. */
export function unitPersonMatrix(unitTotals: number[], personalTotals: { personId: string; amountCents: number }[]) {
  if ([...unitTotals, ...personalTotals.map(p => p.amountCents)].some(n => !Number.isSafeInteger(n) || n < 0)) throw new Error("Parcelas inválidas.");
  if(new Set(personalTotals.map(p=>p.personId)).size!==personalTotals.length)throw new Error("Participantes duplicados.");
  const sum = (values: number[]) => values.reduce((a,b) => a + BigInt(b),0n);
  if (sum(unitTotals) !== sum(personalTotals.map(p => p.amountCents))) throw new Error("As parcelas não conciliam.");
  const grand = sum(unitTotals);
  const matrix = unitTotals.map(total => personalTotals.map(p => ({personId:p.personId,amountCents:grand === 0n ? 0 : Number(BigInt(total)*BigInt(p.amountCents)/grand)})));
  const remaining = personalTotals.map((p,index) => p.amountCents-matrix.reduce((n,row)=>n+row[index].amountCents,0));
  const fractional=unitTotals.map(total=>personalTotals.map(p=>grand!==0n && BigInt(total)*BigInt(p.amountCents)%grand!==0n));
  const extras=unitTotals.map(()=>new Set<number>()),rowsByPerson=personalTotals.map(()=>new Set<number>());
  const add=(row:number,person:number)=>{matrix[row][person].amountCents++;extras[row].add(person);rowsByPerson[person].add(row);};
  const remove=(row:number,person:number)=>{matrix[row][person].amountCents--;extras[row].delete(person);rowsByPerson[person].delete(row);};
  for (let i=0;i<unitTotals.length;i++) {
    let left = unitTotals[i]-matrix[i].reduce((n,p)=>n+p.amountCents,0);
    while(left>0){
      let direct=-1;
      for(let j=0;j<remaining.length;j++)if(remaining[j]>0 && fractional[i][j] && !extras[i].has(j) && (direct<0 || remaining[j]>remaining[direct]))direct=j;
      if(direct>=0){add(i,direct);remaining[direct]--;left--;continue;}
      // Augment an alternating path instead of giving one cell several extra
      // cents. Every cell remains the floor or ceiling of its exact quota.
      const parentPerson=personalTotals.map(()=>-1),parentRow=unitTotals.map(()=>-1),queue=[i];
      parentRow[i]=-2;let target=-1;
      for(let cursor=0;cursor<queue.length && target<0;cursor++){
        const row=queue[cursor];
        for(let person=0;person<personalTotals.length;person++){
          if(!fractional[row][person] || extras[row].has(person) || parentPerson[person]>=0)continue;
          parentPerson[person]=row;
          if(remaining[person]>0){target=person;break;}
          for(const previousRow of rowsByPerson[person])if(parentRow[previousRow]===-1){parentRow[previousRow]=person;queue.push(previousRow);}
        }
      }
      if(target<0)throw new Error("Matriz sem capacidade.");
      remaining[target]--;
      for(let person=target;;){
        const row=parentPerson[person];add(row,person);
        if(row===i)break;
        const previousPerson=parentRow[row];remove(row,previousPerson);person=previousPerson;
      }
      left--;
    }
  }
  return matrix;
}
