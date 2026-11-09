import { expect,it } from "vitest";
import { availableWarehouseUnits,unitMinorCapacity,unitPersonMatrix } from "@/lib/domain/warehouse-calculations";
it("keeps logical indexes and blocks cancelled and reserved units",() => {
  expect(availableWarehouseUnits(5,[0,1,3,4],[{unitStart:1,quantity:1}],[3])).toEqual([0,4]);
  expect(() => availableWarehouseUnits(2,[2],[],[])).toThrow();
});
it("conserves every cent across unit and personal margins",() => {
  const units = Array.from({length:7},(_,i) => unitMinorCapacity(101,7,i));
  const matrix = unitPersonMatrix(units,[{personId:"a",amountCents:51},{personId:"b",amountCents:50}]);
  expect(matrix.map(r => r.reduce((sum,v) => sum+v.amountCents,0))).toEqual(units);
  expect([0,1].map(i => matrix.reduce((sum,r) => sum+r[i].amountCents,0))).toEqual([51,50]);
});
it("rounds every unit/person cell by at most one cent while preserving both margins",()=>{
  for(let quantity=1;quantity<=8;quantity++)for(let total=0;total<=41;total++)for(let count=1;count<=5;count++){
    const units=Array.from({length:quantity},(_,i)=>unitMinorCapacity(total,quantity,i));
    const people=Array.from({length:count},(_,i)=>({personId:String(i),amountCents:unitMinorCapacity(total,count,i)}));
    const matrix=unitPersonMatrix(units,people);
    expect(matrix.map(row=>row.reduce((n,p)=>n+p.amountCents,0))).toEqual(units);
    expect(people.map((_,p)=>matrix.reduce((n,row)=>n+row[p].amountCents,0))).toEqual(people.map(p=>p.amountCents));
    for(let r=0;r<quantity;r++)for(let p=0;p<count;p++){
      const quota=total?units[r]*people[p].amountCents/total:0;
      expect([Math.floor(quota),Math.ceil(quota)]).toContain(matrix[r][p].amountCents);
    }
  }
});
